"use strict";

/* =========================================================
   Blobl.io - multiplayer relay server

   - No player limit (unlimited connections).
   - New players spawn close together (a ring around the map
     center) so they can see each other right away.
   - Relays each player's state snapshot (power, buildings,
     soldiers) to everyone at ~10 Hz, which also drives the
     leaderboard (sorted by power).
   - Safe zone: every player spawns safe (SAFE_TIME ms). The
     zone clears when the timer runs out OR when the player
     presses space (pvp message). Safe players cannot attack
     or be attacked (combat consumes this flag later).
   - Also serves the static files, so open
        http://localhost:8080  in several tabs to test.
   ========================================================= */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const COMBAT = require("./shared/combat.js");

const ROOT = __dirname;

const CONFIG = {
  port: Number(process.env.PORT) || 8080,
  safeTime: 30 * 1000, // ms of safe-zone protection at spawn
  broadcastMs: 100, // state relay rate (10 Hz)
  startPower: 200,
  map: { width: 3000, height: 3000 },
  spawn: {
    minDist: 400, // spawn ring radius, inner edge
    maxDist: 650, // spawn ring radius, outer edge
    minSeparation: 450, // keep spawns apart so they don't overlap
    attempts: 60,
  },
  palette: [
    "#e03b3b", "#3b7ee0", "#3be068", "#e8b93b",
    "#a13be0", "#2fb8c8", "#e0603b", "#d03b8a",
  ],
};

const CENTER = {
  x: CONFIG.map.width / 2,
  y: CONFIG.map.height / 2,
};

const players = new Map(); // id -> player record
let nextId = 1;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/* ---------- spawn ---------- */

function spawnPosition() {
  for (let i = 0; i < CONFIG.spawn.attempts; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = CONFIG.spawn.minDist + Math.random() * (CONFIG.spawn.maxDist - CONFIG.spawn.minDist);
    const x = CENTER.x + Math.cos(ang) * rad;
    const y = CENTER.y + Math.sin(ang) * rad;

    let ok = true;
    for (const p of players.values()) {
      if (Math.hypot(p.x - x, p.y - y) < CONFIG.spawn.minSeparation) {
        ok = false;
        break;
      }
    }
    if (ok) return { x, y };
  }

  return { x: CENTER.x + CONFIG.spawn.maxDist, y: CENTER.y };
}

function snapshot(p) {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    x: p.x,
    y: p.y,
    power: p.power,
    safe: p.safe,
    pvp: p.pvp,
    safeUntil: p.safeUntil,
    health: Math.max(0, p.health),
    dead: p.dead,
    kills: p.kills || 0,
    tag: p.tag || null,
    buildings: p.buildings.map((bd) => ({
      uid: bd.uid,
      b: bd.b,
      x: bd.x,
      y: bd.y,
      dir: bd.dir,
      hp: Math.ceil(Math.max(0, bd.hp)),
      t: bd.t, // tent upgrade tier (1..4), undefined for other buildings
    })),
    soldiers: p.soldiers.map((s) => ({
      uid: s.uid,
      x: s.x,
      y: s.y,
      dir: s.dir,
      hp: Math.ceil(Math.max(0, s.hp)),
      kind: s.kind || "soldier",
    })),
    u: p.upgrades || 0, // armory research bitmask
  };
}

/* ---------- connection ---------- */

function onConnection(ws, req) {
  const id = "p" + nextId++;
  const pos = spawnPosition();
  const player = {
    id,
    ws,
    name: "Player " + id,
    color: CONFIG.palette[(nextId - 2) % CONFIG.palette.length],
    x: pos.x,
    y: pos.y,
    power: CONFIG.startPower,
    buildings: [],
    soldiers: [],
    health: COMBAT.player.health,
    dead: false,
    deadUids: [], // units combat killed, so a late client update can't resurrect them
    upgrades: 0, // armory research bitmask (FlagArmor/Booster/Cannons/Cloak)
    kills: 0, // confirmed kills credited to this player (relayed to clients)
    tag: null, // earned-achievement tag shown under the base name
    safe: true,
    safeUntil: Date.now() + CONFIG.safeTime,
    pvp: false,
  };

  players.set(id, player);
  console.log(`[+] ${player.name} joined (${players.size} online)`);

  ws.on("error", () => {}); // ignore per-socket errors; 'close' cleans up
  ws.on("message", (raw) => handleMessage(player, raw));
  ws.on("close", () => {
    players.delete(id);
    console.log(`[-] ${player.name} left (${players.size} online)`);
  });

  send(ws, {
    type: "welcome",
    id,
    name: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
    safe: player.safe,
    safeUntil: player.safeUntil,
    safeTime: CONFIG.safeTime,
    players: [...players.values()].map(snapshot),
  });
}

function handleMessage(player, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  switch (msg && msg.type) {
    case "state":
      applyPlayerState(player, msg);
      break;

    case "identity": // name shown on the leaderboard, color tints the base
      if (typeof msg.name === "string" && msg.name.trim()) {
        player.name = msg.name.trim().slice(0, 24);
      }
      if (typeof msg.color === "string" && /^#[0-9a-fA-F]{6}$/.test(msg.color)) {
        player.color = msg.color;
      }
      // cosmetic achievement tag; only a short slug is accepted
      if (msg.tag === null || msg.tag === "") {
        player.tag = null;
      } else if (typeof msg.tag === "string" && /^[a-z0-9-]{1,32}$/.test(msg.tag)) {
        player.tag = msg.tag;
      }
      break;

    case "pvp": // player pressed space: drop their safe zone, enable PvP
      player.pvp = true;
      player.safe = false;
      break;
  }
}

/* ---------- combat (authoritative) ---------- */

const BUILDING_CAP = 500;
const SOLDIER_CAP = 2000;
const DEAD_UID_CAP = 500;

/* Reconcile the list the client just sent with what we already track, keeping
   the hp combat assigned and never resurrecting a unit the server destroyed. */
function syncUnits(player, existing, incoming, isBuilding) {
  const byUid = new Map();
  for (const e of existing) byUid.set(e.uid, e);

  const out = [];
  for (const inc of incoming) {
    const uid = inc.uid;
    if (typeof uid !== "string" && typeof uid !== "number") continue;
    if (player.deadUids.includes(uid)) continue;

    let rec = byUid.get(uid);
    if (rec) {
      rec.x = inc.x;
      rec.y = inc.y;
      if (typeof inc.dir === "number") rec.dir = inc.dir;
      if (!isBuilding) {
        // keep kind/stats fixed from creation; only movement changes here
        if (!rec.stat) {
          rec.kind = inc.kind === "tank" || inc.kind === "siege" ? inc.kind : "soldier";
          rec.stat = COMBAT.units[rec.kind] || COMBAT.soldier;
          rec.size = rec.stat.size;
        }
      } else if (Number.isInteger(inc.t)) {
        rec.t = inc.t; // tent tier can change (upgrades)
      }
    } else if (isBuilding && Number.isInteger(inc.b)) {
      const stat = COMBAT.buildingStats[inc.b];
      if (!stat) continue;
      rec = {
        uid,
        b: inc.b,
        x: inc.x,
        y: inc.y,
        dir: typeof inc.dir === "number" ? inc.dir : 0,
        size: stat.size,
        hp: stat.health,
        stat,
        t: Number.isInteger(inc.t) ? inc.t : undefined,
      };
    } else if (!isBuilding) {
      const kind = inc.kind === "tank" || inc.kind === "siege" ? inc.kind : "soldier";
      const stat = COMBAT.units[kind];
      const armor = player.upgrades & COMBAT.upgradeFlags.armor ? COMBAT.powerArmorMult : 1;
      rec = {
        uid,
        x: inc.x,
        y: inc.y,
        dir: typeof inc.dir === "number" ? inc.dir : 0,
        kind,
        size: stat.size,
        stat,
        hp: stat.health * armor,
      };
    } else {
      continue;
    }

    out.push(rec);
  }
  return out;
}

function applyPlayerState(player, msg) {
  if (player.dead) return; // dead players can't rebuild or fight

  if (typeof msg.power === "number") player.power = Math.max(0, msg.power);
  if (typeof msg.u === "number") player.upgrades = msg.u & 15; // armory research mask
  if (Array.isArray(msg.buildings)) {
    player.buildings = syncUnits(player, player.buildings, msg.buildings.slice(0, BUILDING_CAP), true);
  }
  if (Array.isArray(msg.soldiers)) {
    player.soldiers = syncUnits(player, player.soldiers, msg.soldiers.slice(0, SOLDIER_CAP), false);
  }
}

function killUnit(player, uid) {
  if (typeof uid !== "string" && typeof uid !== "number") return;
  player.deadUids.push(uid);
  if (player.deadUids.length > DEAD_UID_CAP) {
    player.deadUids.splice(0, player.deadUids.length - DEAD_UID_CAP);
  }
}

function killPlayer(player) {
  if (player.dead) return;
  player.dead = true;
  player.health = 0;
  player.buildings = [];
  player.soldiers = [];
}

/* ---------- kill attribution ---------- */

/* Attribute damage dealt to a target (unit, building or base record) to its
   attacker, so we can credit the kill to whoever did the most. */
function creditDamage(target, attacker, amount) {
  if (!target || !attacker) return;
  if (!target.dmgBy) target.dmgBy = new Map();
  target.dmgBy.set(attacker.id, (target.dmgBy.get(attacker.id) || 0) + amount);
}

/* When a target dies, credit a kill to the player who dealt it the most
   damage (falls back to nothing when the target was never hit). */
function awardKill(target) {
  if (!target || !target.dmgBy) return;
  let bestId = null;
  let best = -1;
  for (const [id, dmg] of target.dmgBy) {
    if (dmg > best) {
      best = dmg;
      bestId = id;
    }
  }
  const attacker = players.get(bestId);
  if (attacker && !attacker.dead) attacker.kills = (attacker.kills || 0) + 1;
}

/* Damage applied per second while conditions hold. Only unsafe, alive players
   take part; both sides must be unsafe before any damage is dealt. Units carry
   `stat` (their kind's health/damage/size) so tanks and siege tanks fight by
   their own rules instead of COMBAT.soldier's. */
function combatTick(dt) {
  const combatants = [...players.values()].filter((p) => !p.dead);

  // buildings shoot / hammer enemy units
  for (const a of combatants) {
    if (a.safe) continue;
    for (const bd of a.buildings) {
      if (!bd.stat || bd.stat.damage <= 0) continue;
      const ranged = bd.stat.range || 0;
      for (const b of combatants) {
        if (b.id === a.id || b.safe) continue;
        for (const en of b.soldiers) {
          // Cloaking Device: enemy towers can't even see your tanks
          const cloaked = (b.upgrades & COMBAT.upgradeFlags.cloak) !== 0 && en.kind && en.kind !== "soldier";
          if (ranged && cloaked) continue;
          const st = en.stat || COMBAT.soldier;
          const dx = en.x - bd.x;
          const dy = en.y - bd.y;
          const reach = ranged || bd.size + st.size;
          if (dx * dx + dy * dy <= reach * reach) {
            const dmg = bd.stat.damage * dt;
            en.hp -= dmg;
            creditDamage(en, a, dmg);
          }
        }
      }
    }
  }

  // tanks with Panzer Cannons: ranged fire at the nearest enemy
  for (const a of combatants) {
    if (a.safe || !(a.upgrades & COMBAT.upgradeFlags.cannons)) continue;
    for (const s of a.soldiers) {
      if (!s.stat || s.kind === "soldier") continue;
      const R2 = s.stat.range * s.stat.range;
      let best = Infinity;
      let tgt = null;
      for (const b of combatants) {
        if (b.id === a.id || b.safe) continue;
        for (const en of b.soldiers) {
          const dx = en.x - s.x;
          const dy = en.y - s.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) {
            best = d2;
            tgt = en;
          }
        }
        for (const bd of b.buildings) {
          const dx = bd.x - s.x;
          const dy = bd.y - s.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) {
            best = d2;
            tgt = bd;
          }
        }
        const dx = b.x - s.x;
        const dy = b.y - s.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best) {
          best = d2;
          tgt = b;
        }
      }
      if (tgt && best <= R2) {
        const dmg = s.stat.damage * dt;
        if (tgt.hp !== undefined) tgt.hp -= dmg;
        else if (tgt.health !== undefined) tgt.health -= dmg;
        creditDamage(tgt, a, dmg);
      }
    }
  }

  // units: contact damage to enemy buildings, base, and other units
  for (const a of combatants) {
    if (a.safe) continue;
    for (const s of a.soldiers) {
      const st = s.stat || COMBAT.soldier;
      for (const b of combatants) {
        if (b.id === a.id || b.safe || b.dead) continue;

        for (const bd of b.buildings) {
          const dx = s.x - bd.x;
          const dy = s.y - bd.y;
          const r = bd.size + st.size;
          if (dx * dx + dy * dy <= r * r) {
            bd.hp -= st.damage * dt;
            creditDamage(bd, a, st.damage * dt);
          }
        }

        const bx = s.x - b.x;
        const by = s.y - b.y;
        const br = COMBAT.player.baseRadius + st.size;
        if (bx * bx + by * by <= br * br) {
          b.health -= st.damage * dt;
          creditDamage(b, a, st.damage * dt);
        }

        // units fight units; apply once per unordered pair
        if (a.id < b.id) {
          for (const en of b.soldiers) {
            const est = en.stat || COMBAT.soldier;
            const dx = s.x - en.x;
            const dy = s.y - en.y;
            const r = st.size + est.size;
            if (dx * dx + dy * dy <= r * r) {
              const dmgToS = est.damage * dt; // enemy unit (owner b) hits ours
              const dmgToEn = st.damage * dt; // our unit (owner a) hits theirs
              s.hp -= dmgToS;
              en.hp -= dmgToEn;
              creditDamage(s, b, dmgToS);
              creditDamage(en, a, dmgToEn);
            }
          }
        }
      }
    }
  }

  // base defends itself: hits enemy units in attack range
  for (const a of combatants) {
    if (a.safe) continue;
    const r = COMBAT.player.attackRange;
    for (const b of combatants) {
      if (b.id === a.id || b.safe) continue;
      for (const en of b.soldiers) {
        const dx = en.x - a.x;
        const dy = en.y - a.y;
        if (dx * dx + dy * dy <= r * r) {
          en.hp -= COMBAT.player.damage * dt;
          creditDamage(en, a, COMBAT.player.damage * dt);
        }
      }
    }
  }

  // resolve deaths
  for (const p of players.values()) {
    if (p.dead) continue;
    for (let i = p.soldiers.length - 1; i >= 0; i--) {
      if (p.soldiers[i].hp <= 0) {
        awardKill(p.soldiers[i]);
        killUnit(p, p.soldiers[i].uid);
        p.soldiers.splice(i, 1);
      }
    }
    for (let i = p.buildings.length - 1; i >= 0; i--) {
      if (p.buildings[i].hp <= 0) {
        awardKill(p.buildings[i]);
        killUnit(p, p.buildings[i].uid);
        p.buildings.splice(i, 1);
      }
    }
    if (p.health <= 0) {
      awardKill(p);
      killPlayer(p);
    }
  }
}

/* ---------- broadcasting ---------- */

function broadcastToAll() {
  const now = Date.now();

  // safe zones expire on their own if space was never pressed
  for (const p of players.values()) {
    if (!p.pvp && now >= p.safeUntil) p.safe = false;
  }

  combatTick(CONFIG.broadcastMs / 1000);

  const payload = {
    type: "update",
    players: [...players.values()].map(snapshot),
  };

  for (const p of players.values()) send(p.ws, payload);
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

/* ---------- static file server ---------- */

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  });
}

/* ---------- start / export ---------- */

function startServer(port = CONFIG.port) {
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server });

  wss.on("connection", onConnection);

  const timer = setInterval(broadcastToAll, CONFIG.broadcastMs);

  server.listen(port, () => {
    console.log(`Blobl.io server on http://localhost:${port}`);
    console.log(`Open several tabs to test multiplayer (no player limit).`);
  });

  return {
    server,
    wss,
    stop: () => {
      clearInterval(timer);
      for (const p of players.values()) {
        try {
          p.ws.close();
        } catch {}
      }
      players.clear();
      try {
        wss.close();
        server.close();
      } catch {}
    },
  };
}

module.exports = { startServer, CONFIG };

if (require.main === module) startServer();