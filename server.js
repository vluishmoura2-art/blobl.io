"use strict";

/* =========================================================
   hightide.io - multiplayer server

   - No player limit (unlimited connections).
   - New players spawn close together (a ring around the map
     center) so they can see each other right away.
   - The client plays first and reports what it did, 10 times per
     second. The server checks every report against the rules in
     shared/combat.js: it keeps the gold, charges every purchase,
     and refuses buildings and boats that break the rules.
   - It sends every player's state to everyone at ~10 Hz, along
     with what was destroyed (for the explosions).
   - Safe zone: every player spawns safe (safeTime ms). It clears
     when the timer runs out OR when the player presses space.
     Safe players cannot attack or be attacked.
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
  safeTime: 45 * 1000, // ms of safe-zone protection at spawn
  broadcastMs: 100, // state relay rate (10 Hz)
  startPower: COMBAT.startGold,
  map: COMBAT.map,
  spawn: {
    minDist: 400, // spawn ring radius, inner edge
    maxDist: 650, // spawn ring radius, outer edge
    minSeparation: 450, // keep spawns apart so they don't overlap
    attempts: 60,
  },
  palette: [
    "#C8553D", "#2E6F8E", "#3F7D4E", "#C48A1A",
    "#7A4E9E", "#1F8A8A", "#A93F6B", "#54606B",
  ],
};

const CENTER = {
  x: CONFIG.map.width / 2,
  y: CONFIG.map.height / 2,
};

const players = new Map(); // id -> player record
let battleEvents = []; // what was destroyed since the last broadcast
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
    name: "Capitão " + id,
    color: CONFIG.palette[(nextId - 2) % CONFIG.palette.length],
    x: pos.x,
    y: pos.y,
    power: CONFIG.startPower,
    buildings: [],
    soldiers: [],
    health: COMBAT.player.health,
    dead: false,
    deadUids: [], // units combat killed, so a late client update can't resurrect them
    lastStateAt: 0,
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
        player.name = msg.name.trim().slice(0, 16);
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

/* ---------- what a player may do (the server has the last word) ---------- */

const BUILDING_CAP = 100;
const BOAT_CAP = 40;
const DEAD_UID_CAP = 500;
const MIN_STATE_MS = 40; // a real client reports 10 times per second
const GOLD_SLACK = 3; // the client's gold can run slightly ahead of ours
const SPEED_SLACK = 1.25; // room for network jitter on top of a boat's speed
const MOVE_BURST_SECONDS = 0.6; // how far delayed messages may catch up at once

function isUid(uid) {
  return Number.isSafeInteger(uid);
}

function isOnMap(o) {
  return (
    Number.isFinite(o.x) && Number.isFinite(o.y) && o.x >= 0 && o.y >= 0 && o.x <= COMBAT.map.width && o.y <= COMBAT.map.height
  );
}

function spend(player, cost) {
  if (player.power + GOLD_SLACK < cost) return false;
  player.power = Math.max(0, player.power - cost);
  return true;
}

function fitsReach(player, stat, x, y) {
  return COMBAT.isValidDistance(stat, Math.hypot(x - player.x, y - player.y));
}

function overlapsAny(list, x, y, size, skip) {
  return list.some((o) => o !== skip && size + o.size - 0.5 >= Math.hypot(x - o.x, y - o.y));
}

/* Moving buildings is only ever a swap, so either every move in the message is
   legal or none of them happens. */
function applyBuildingMoves(player, kept, sent) {
  const moved = kept.filter((rec) => {
    const inc = sent.get(rec.uid);
    return isOnMap(inc) && Math.hypot(inc.x - rec.x, inc.y - rec.y) > 1;
  });
  if (moved.length === 0) return;

  const before = moved.map((rec) => ({ rec, x: rec.x, y: rec.y }));
  for (const rec of moved) {
    const inc = sent.get(rec.uid);
    rec.x = inc.x;
    rec.y = inc.y;
  }

  const legal = moved.every(
    (rec) => fitsReach(player, rec.stat, rec.x, rec.y) && !overlapsAny(kept, rec.x, rec.y, rec.size, rec)
  );
  if (!legal) {
    for (const { rec, x, y } of before) {
      rec.x = x;
      rec.y = y;
    }
    return;
  }

  for (const rec of moved) rec.dir = Math.atan2(rec.y - player.y, rec.x - player.x);
}

function applyDockUpgrades(player, kept, sent) {
  for (const rec of kept) {
    if (rec.stat.role !== "dock") continue;
    const wanted = sent.get(rec.uid).t;
    while (Number.isInteger(wanted) && rec.t < wanted && COMBAT.tents[rec.t + 1]) {
      if (!spend(player, COMBAT.tents[rec.t + 1].cost)) break;
      rec.t += 1;
    }
  }
}

function addNewBuilding(player, kept, inc) {
  const stat = Number.isInteger(inc.b) ? COMBAT.buildingStats[inc.b] : null;
  if (!stat || !isOnMap(inc) || kept.length >= BUILDING_CAP) return;
  if (stat.limit && kept.filter((rec) => rec.stat === stat).length >= stat.limit) return;
  if (!fitsReach(player, stat, inc.x, inc.y) || overlapsAny(kept, inc.x, inc.y, stat.size)) return;
  if (!spend(player, stat.cost)) return;

  kept.push({
    uid: inc.uid,
    b: inc.b,
    x: inc.x,
    y: inc.y,
    dir: Math.atan2(inc.y - player.y, inc.x - player.x),
    size: stat.size,
    hp: stat.health,
    stat,
    t: stat.role === "dock" ? 1 : undefined,
    tokens: 0, // boats a dock has had time to build
  });
}

function syncBuildings(player, incoming) {
  const sent = new Map();
  for (const inc of incoming.slice(0, BUILDING_CAP)) {
    if (inc && isUid(inc.uid) && !player.deadUids.includes(inc.uid)) sent.set(inc.uid, inc);
  }

  const kept = [];
  const known = new Set();
  for (const rec of player.buildings) {
    known.add(rec.uid);
    if (sent.has(rec.uid)) kept.push(rec);
    else player.power += Math.floor(rec.stat.cost * COMBAT.refundRate); // removed by its owner
  }

  applyBuildingMoves(player, kept, sent);
  applyDockUpgrades(player, kept, sent);
  for (const inc of sent.values()) {
    if (!known.has(inc.uid)) addNewBuilding(player, kept, inc);
  }

  player.buildings = kept;
}

function boatLimit(player, kind) {
  if (kind !== "soldier") return COMBAT.boatLimits[kind];
  const huts = player.buildings.filter((b) => b.stat.role === "hut").length;
  return COMBAT.boatLimits.soldierBase + COMBAT.boatLimits.perHut * huts;
}

/* Every boat comes from a dock that has had time to build it. */
function takeBoatFromDock(player, inc, kind, stat) {
  return player.buildings.find((dock) => {
    if (dock.stat.role !== "dock" || dock.tokens < 1 || COMBAT.tents[dock.t].unit !== kind) return false;
    const launch = dock.size + stat.size + 4 + stat.speed * 0.5 + 10;
    return Math.hypot(inc.x - dock.x, inc.y - dock.y) <= launch;
  });
}

function addNewBoat(player, boats, inc) {
  const kind = inc.kind === "tank" || inc.kind === "siege" ? inc.kind : "soldier";
  const stat = COMBAT.units[kind];
  if (!isOnMap(inc) || boats.length >= BOAT_CAP) return;
  if (boats.filter((b) => b.kind === kind).length >= boatLimit(player, kind)) return;

  const dock = takeBoatFromDock(player, inc, kind, stat);
  if (!dock) return;
  dock.tokens -= 1;

  const armor = player.upgrades & COMBAT.upgradeFlags.armor ? COMBAT.powerArmorMult : 1;
  boats.push({
    uid: inc.uid,
    x: inc.x,
    y: inc.y,
    dir: Number.isFinite(inc.dir) ? inc.dir : 0,
    kind,
    size: stat.size,
    stat,
    hp: stat.health * armor,
    moveBudget: 30,
    movedAt: Date.now(),
  });
}

/* Enemy reefs are solid: a boat stops at the edge and slides around them. */
function pushOutOfEnemyReefs(player, boat) {
  for (const other of players.values()) {
    if (other === player || other.dead) continue;
    for (const reef of other.buildings) {
      if (reef.stat.role !== "reef") continue;
      const reach = reef.size + boat.size;
      const d = Math.hypot(boat.x - reef.x, boat.y - reef.y);
      if (d < reach && d > 0) {
        boat.x = reef.x + ((boat.x - reef.x) / d) * reach;
        boat.y = reef.y + ((boat.y - reef.y) / d) * reach;
      }
    }
  }
}

/* A boat travels at its class's speed, however far the client says it went. */
function moveBoat(player, boat, inc) {
  if (!isOnMap(inc)) return;

  const now = Date.now();
  const elapsed = (now - boat.movedAt) / 1000;
  boat.movedAt = now;

  const boosted = boat.kind !== "soldier" && player.upgrades & COMBAT.upgradeFlags.booster;
  const speed = boat.stat.speed * (boosted ? COMBAT.boosterMult : 1) * SPEED_SLACK;
  boat.moveBudget = Math.min(boat.moveBudget + speed * elapsed, speed * MOVE_BURST_SECONDS + 30);

  const dx = inc.x - boat.x;
  const dy = inc.y - boat.y;
  const wanted = Math.hypot(dx, dy);
  const step = Math.min(wanted, boat.moveBudget);
  if (wanted > 0) {
    boat.x += (dx / wanted) * step;
    boat.y += (dy / wanted) * step;
    boat.moveBudget -= step;
  }
  if (Number.isFinite(inc.dir)) boat.dir = inc.dir;
  pushOutOfEnemyReefs(player, boat);
}

function syncBoats(player, incoming) {
  const sent = new Map();
  for (const inc of incoming.slice(0, BOAT_CAP)) {
    if (inc && isUid(inc.uid) && !player.deadUids.includes(inc.uid)) sent.set(inc.uid, inc);
  }

  const boats = [];
  const known = new Set();
  for (const boat of player.soldiers) {
    known.add(boat.uid);
    if (!sent.has(boat.uid)) continue;
    moveBoat(player, boat, sent.get(boat.uid));
    boats.push(boat);
  }
  for (const inc of sent.values()) {
    if (!known.has(inc.uid)) addNewBoat(player, boats, inc);
  }

  player.soldiers = boats;
}

/* Research is bought in order, at an arsenal, with gold the player really has. */
function syncResearch(player, wanted) {
  if (!Number.isInteger(wanted)) return;
  if (!player.buildings.some((b) => b.stat.role === "arsenal")) return;

  for (const research of COMBAT.armoryResearch) {
    const flag = COMBAT.upgradeFlags[research.key];
    if (player.upgrades & flag) continue;
    if (!(wanted & flag) || !spend(player, research.cost)) return;
    player.upgrades |= flag;
  }
}

function applyPlayerState(player, msg) {
  if (player.dead) return; // dead players can't rebuild or fight

  const now = Date.now();
  if (now - player.lastStateAt < MIN_STATE_MS) return;
  player.lastStateAt = now;

  if (Array.isArray(msg.buildings)) syncBuildings(player, msg.buildings);
  syncResearch(player, msg.u);
  if (Array.isArray(msg.soldiers)) syncBoats(player, msg.soldiers);
}

/* Gold and boats accumulate on the server's own clock. */
function economyTick(dt) {
  for (const p of players.values()) {
    if (p.dead) continue;
    for (const b of p.buildings) {
      if (b.stat.role === "mill") p.power += COMBAT.goldPerMill * dt;
      // a little faster than the client, so a real boat is never refused for being early
      if (b.stat.role === "dock") b.tokens = Math.min(2, b.tokens + dt / (COMBAT.tents[b.t].interval * 0.85));
    }
  }
}

/* ---------- combat (authoritative) ---------- */

function killUnit(player, uid) {
  player.deadUids.push(uid);
  if (player.deadUids.length > DEAD_UID_CAP) {
    player.deadUids.splice(0, player.deadUids.length - DEAD_UID_CAP);
  }
}

function reportDestroyed(type, x, y, size, owner, extra) {
  battleEvents.push({ t: type, x, y, size, color: owner.color, owner: owner.id, ...extra });
}

function killPlayer(player) {
  if (player.dead) return;
  for (const bd of player.buildings) reportDestroyed("building", bd.x, bd.y, bd.size, player);
  for (const s of player.soldiers) reportDestroyed("boat", s.x, s.y, s.size, player);
  player.dead = true;
  player.health = 0;
  player.buildings = [];
  player.soldiers = [];
}

/* ---------- kill attribution ---------- */

/* Attribute damage dealt to a target (unit, building or island record) to its
   attacker, so we can credit the kill to whoever did the most. */
function hit(target, attacker, amount) {
  if (target.hp !== undefined) target.hp -= amount;
  else target.health -= amount;
  if (!target.dmgBy) target.dmgBy = new Map();
  target.dmgBy.set(attacker.id, (target.dmgBy.get(attacker.id) || 0) + amount);
}

/* When a target dies, the player who dealt it the most damage gets the kill and
   its bounty. */
function awardKill(target, bounty) {
  if (!target.dmgBy) return null;
  let bestId = null;
  let best = -1;
  for (const [id, dmg] of target.dmgBy) {
    if (dmg > best) {
      best = dmg;
      bestId = id;
    }
  }
  const attacker = players.get(bestId);
  if (attacker && !attacker.dead) {
    attacker.kills += 1;
    attacker.power += bounty;
  }
  return bestId;
}

/* The nearest enemy boat within range of a point. Cloaked frigates and galleons
   can't be seen by cannons. */
function nearestBoat(x, y, range, enemies, seenByCannons) {
  let target = null;
  let best = range * range;
  for (const enemy of enemies) {
    const cloaked = enemy.upgrades & COMBAT.upgradeFlags.cloak;
    for (const boat of enemy.soldiers) {
      if (seenByCannons && cloaked && boat.kind !== "soldier") continue;
      const d = (boat.x - x) ** 2 + (boat.y - y) ** 2;
      if (d <= best) {
        best = d;
        target = boat;
      }
    }
  }
  return target;
}

/* The nearest of everything a boat's cannons can fire at. */
function nearestTarget(boat, range, enemies) {
  let target = nearestBoat(boat.x, boat.y, range, enemies, false);
  let best = target ? (target.x - boat.x) ** 2 + (target.y - boat.y) ** 2 : range * range;
  for (const enemy of enemies) {
    for (const candidate of [...enemy.buildings, enemy]) {
      const d = (candidate.x - boat.x) ** 2 + (candidate.y - boat.y) ** 2;
      if (d <= best) {
        best = d;
        target = candidate;
      }
    }
  }
  return target;
}

/* The nearest enemy piece this boat is touching. */
function nearestContact(boat, enemies) {
  let target = null;
  let best = Infinity;
  const consider = (candidate, size) => {
    const gap = Math.hypot(candidate.x - boat.x, candidate.y - boat.y) - size - boat.size;
    if (gap <= 0 && gap < best) {
      best = gap;
      target = candidate;
    }
  };
  for (const enemy of enemies) {
    consider(enemy, COMBAT.player.baseRadius);
    for (const bd of enemy.buildings) consider(bd, bd.size);
    for (const other of enemy.soldiers) consider(other, other.size);
  }
  return target;
}

/* Each attacker hits one target at a time. Only unprotected, living players take
   part, on both sides. */
function combatTick(dt) {
  const fighters = [...players.values()].filter((p) => !p.dead && !p.safe);

  for (const a of fighters) {
    const enemies = fighters.filter((b) => b !== a);

    for (const bd of a.buildings) {
      if (bd.stat.role !== "gun") continue;
      const target = nearestBoat(bd.x, bd.y, bd.stat.range, enemies, true);
      if (target) hit(target, a, bd.stat.damage * dt);
    }

    const intruder = nearestBoat(a.x, a.y, COMBAT.player.attackRange, enemies, false);
    if (intruder) hit(intruder, a, COMBAT.player.damage * dt);

    const cannons = a.upgrades & COMBAT.upgradeFlags.cannons;
    for (const boat of a.soldiers) {
      const target =
        cannons && boat.kind !== "soldier" ? nearestTarget(boat, boat.stat.range, enemies) : nearestContact(boat, enemies);
      if (target) hit(target, a, boat.stat.damage * dt);
    }
  }

  // resolve deaths
  for (const p of players.values()) {
    if (p.dead) continue;
    for (let i = p.soldiers.length - 1; i >= 0; i--) {
      const boat = p.soldiers[i];
      if (boat.hp <= 0) {
        awardKill(boat, COMBAT.bounty[boat.kind]);
        reportDestroyed("boat", boat.x, boat.y, boat.size, p);
        killUnit(p, boat.uid);
        p.soldiers.splice(i, 1);
      }
    }
    for (let i = p.buildings.length - 1; i >= 0; i--) {
      const bd = p.buildings[i];
      if (bd.hp <= 0) {
        awardKill(bd, Math.floor(bd.stat.cost * COMBAT.bounty.buildingRate));
        reportDestroyed("building", bd.x, bd.y, bd.size, p);
        killUnit(p, bd.uid);
        p.buildings.splice(i, 1);
      }
    }
    if (p.health <= 0) {
      const killer = awardKill(p, COMBAT.bounty.island);
      killPlayer(p);
      reportDestroyed("base", p.x, p.y, COMBAT.player.baseRadius, p, { name: p.name, killer });
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

  economyTick(CONFIG.broadcastMs / 1000);
  combatTick(CONFIG.broadcastMs / 1000);

  const payload = {
    type: "update",
    players: [...players.values()].map(snapshot),
    events: battleEvents,
  };
  battleEvents = [];

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
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

  wss.on("connection", onConnection);

  const timer = setInterval(broadcastToAll, CONFIG.broadcastMs);

  server.listen(port, () => {
    console.log(`hightide.io server on http://localhost:${port}`);
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