"use strict";

/* =========================================================
   Blobl.io - multiplayer client

   Talks to server.js over a WebSocket:
     - receives its spawn point (base position) + everyone else
     - relays its own state (power, buildings, soldiers) at 10 Hz
     - renders other players (base, buildings, soldiers, safe zone)
     - drives the leaderboard (sorted by power)
     - space toggles PvP on for yourself (drops the safe zone)

   Fully optional: if the server is unreachable the game keeps
   working as the existing single-player build.
   ========================================================= */

/* On the public site (https) the WS goes to the same host on the default secure
   port (443) - Render proxies wss to the app's internal PORT. Only the local
   http dev server talks to node on :8080 directly. */
const HOST =
  (location.protocol === "https:" ? "wss://" : "ws://") +
  (location.hostname || "localhost") +
  (location.protocol === "https:" ? "" : ":" + (window.BLOB_PORT || 8080));

const net = {
  id: null,
  online: false,
  dead: false, // the server destroyed our base
  players: new Map(), // id -> snapshot (includes ourself)
  mySafe: true,
  myPvp: false,
  mySafeRemaining: 0,
};

/* Units the server hasn't confirmed yet (or just killed). A unit that stops
   appearing in snapshots is removed only after GRACE, so a newly-sent unit
   isn't culled during the round-trip delay. */
const GRACE = 350; // ms
let pendingRemove = new Map(); // uid -> removal due timestamp

let netWs = null;
let netSendTimer = 0;
let netHadSession = false;

/* ---------- connection ---------- */

function initNet() {
  netWs = new WebSocket(HOST);

  netWs.onopen = () => {
    setStatus("Connected - waiting for spawn...");
  };

  netWs.onmessage = (ev) => netMessage(ev.data);

  netWs.onerror = () => {
    if (!netHadSession) setStatus("Server unreachable");
  };

  netWs.onclose = () => {
    netWs = null;
    net.online = false;
    setStatus(netHadSession ? "Lost connection - reload to rejoin" : "Offline");
  };
}

function netMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === "welcome") {
    net.id = msg.id;
    net.online = true;
    netHadSession = true;

    // Our base is at the spawn point the server assigned us
    PLAYER.x = msg.x;
    PLAYER.y = msg.y;
    camera.x = msg.x;
    camera.y = msg.y;

    net.mySafe = msg.safe;
    net.myPvp = false;
    net.mySafeRemaining = Math.max(0, msg.safeUntil - Date.now());

    net.players = new Map();
    for (const p of msg.players) net.players.set(p.id, p);

    reconcileSelf(msg.players.find((p) => p.id === net.id));

    // tell the server our chosen name + base color (leaderboard + hues)
    if (typeof PROFILE === "object") {
      netSend({ type: "identity", name: PROFILE.name, color: PROFILE.color });
    }

    refreshLeaderboard();
    refreshPowerUI();
    draw();
  } else if (msg.type === "update") {
    net.players = new Map();
    for (const p of msg.players) net.players.set(p.id, p);

    const me = net.players.get(net.id);
    if (me) reconcileSelf(me);

    refreshLeaderboard();
  }
}

/* ---------- self reconciliation (server is authoritative on hp) ---------- */

/* Apply the server's view of our own units: adopt hp, drop anything the server
   stopped reporting (combat kills) after a short grace period, and surface a
   base-health bar + the eliminated overlay. */
function reconcileSelf(me) {
  if (!me) return;

  net.mySafe = me.safe;
  net.myPvp = me.pvp;
  net.mySafeRemaining = Math.max(0, me.safeUntil - Date.now());

  if (typeof me.health === "number") {
    const prev = state.playerHp;
    state.playerHp = Math.max(0, Math.min(me.health, COMBAT.player.health));
    if (prev - state.playerHp > 0.5) {
      if (typeof Sfx !== "undefined") Sfx.play("hit", 0.6);
      if (typeof addShake === "function") addShake(3);
    }
  }

  if (me.dead && !net.dead) {
    net.dead = true;
    showEliminated();
  }
  if (!me.dead) net.dead = false;

  const now = performance.now();

  const serverB = new Map();
  if (Array.isArray(me.buildings)) {
    for (const rb of me.buildings) serverB.set(rb.uid, rb);
  }
  for (const p of placement.placed) {
    const rb = serverB.get(p.uid);
    if (rb) {
      p.hp = rb.hp;
      pendingRemove.delete(p.uid);
    } else if (!pendingRemove.has(p.uid)) {
      pendingRemove.set(p.uid, now + GRACE);
    }
  }
  placement.placed = placement.placed.filter((p) => !(pendingRemove.has(p.uid) && pendingRemove.get(p.uid) < now));

  const serverS = new Map();
  if (Array.isArray(me.soldiers)) {
    for (const rs of me.soldiers) serverS.set(rs.uid, rs);
  }
  for (const s of soldiers) {
    const rs = serverS.get(s.uid);
    if (rs) {
      s.hp = rs.hp;
      pendingRemove.delete(s.uid);
    } else if (!pendingRemove.has(s.uid)) {
      pendingRemove.set(s.uid, now + GRACE);
    }
  }
  for (let i = soldiers.length - 1; i >= 0; i--) {
    const s = soldiers[i];
    if (pendingRemove.has(s.uid) && pendingRemove.get(s.uid) < now) soldiers.splice(i, 1);
  }
}

function showEliminated() {
  const el = document.getElementById("eliminated");
  if (el) el.classList.add("show");
  if (typeof Sfx !== "undefined") Sfx.play("eliminated");
  if (typeof addShake === "function") addShake(6);
  if (typeof burst === "function") {
    burst(PLAYER.x, PLAYER.y, PROFILE ? PROFILE.color : "#e03b3b", 30, 200);
    burst(PLAYER.x, PLAYER.y, "#ffffff", 14, 120);
  }
  if (typeof draw === "function") draw();
}

/* ---------- outgoing state (10 Hz) ---------- */

function netUpdate(dt) {
  if (net.dead || !net.online || !netWs || netWs.readyState !== 1) return;

  netSendTimer += dt;
  if (netSendTimer < 0.1) return;
  netSendTimer = 0;

  netSend({
    type: "state",
    power: state.power,
    u: state.upgrades || 0, // armory research bitmask
    buildings: placement.placed.map((p) => ({
      b: BUILDINGS.indexOf(p.building),
      x: p.x,
      y: p.y,
      dir: p.dir,
      uid: p.uid,
      t: p.building.design === "tent" ? p.tier || 1 : undefined,
    })),
    soldiers: soldiers.map((s) => ({ x: s.x, y: s.y, dir: s.dir, uid: s.uid, kind: s.kind || "soldier" })),
  });
}

function netSend(obj) {
  if (netWs && netWs.readyState === 1) netWs.send(JSON.stringify(obj));
}

/* ---------- PvP toggle (space) ---------- */

function onSpaceForPvp() {
  if (!net.online || net.dead) return;

  net.myPvp = true;
  net.mySafe = false;
  netSend({ type: "pvp" });
  if (typeof Sfx !== "undefined") Sfx.play("pvp");
  if (typeof addShake === "function") addShake(2.5);
  if (typeof burst === "function") burst(PLAYER.x, PLAYER.y, PROFILE ? PROFILE.color : "#e03b3b", 16, 150);
  draw();
}

/* ---------- rendering other players ---------- */

function drawRemotePlayers() {
  if (net.players.size === 0) return;

  for (const rp of net.players.values()) {
    if (rp.id === net.id) {
      if (net.dead) continue; // eliminated overlay is shown instead
      // our own safe-zone / PvP indicator
      if (net.mySafe) {
        drawSafeRing(PLAYER.x, PLAYER.y);
        drawStatusLabel(PLAYER.x, PLAYER.y - PLACE.startSize - 34, "SAFE " + Math.ceil(net.mySafeRemaining / 1000) + "s", "#2fcf4f");
      } else if (net.myPvp) {
        drawStatusLabel(PLAYER.x, PLAYER.y - PLACE.startSize - 34, "PvP ON", "#e03939");
      }
      continue;
    }

    drawRemotePlayer(rp);
  }
}

function drawRemotePlayer(rp) {
  const color = rp.color || "#e03b3b";
  const t = performance.now() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + (rp.id || 0) * 7);
  const armored = (rp.u & COMBAT.upgradeFlags.armor) !== 0;
  const cannons = (rp.u & COMBAT.upgradeFlags.cannons) !== 0;
  const cloaked = (rp.u & COMBAT.upgradeFlags.cloak) !== 0;

  // base circle
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14 + 8 * pulse;
  ctx.beginPath();
  ctx.arc(rp.x, rp.y, PLACE.startSize, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = shadeColor(color, 45);
  ctx.stroke();
  ctx.restore();

  if (typeof rp.health === "number") {
    drawObjectHp(rp.x, rp.y - PLACE.startSize - 12, PLACE.startSize * 1.8, rp.health, COMBAT.player.health);
  }

  // buildings (tents carry their upgrade tier, the armory its research hub)
  if (Array.isArray(rp.buildings)) {
    for (const rb of rp.buildings) paintRemoteBuilding(color, rb);
  }

  // units: soldiers, tanks and siege tanks with their own sizes
  if (Array.isArray(rp.soldiers)) {
    for (const s of rp.soldiers) {
      const kind = s.kind || "soldier";
      const stat = COMBAT.units[kind] || COMBAT.soldier;

      ctx.save();
      if (cloaked && kind !== "soldier") {
        // Cloaking Device: enemy players see a ghost, enemy towers see nothing
        ctx.globalAlpha = 0.28 + 0.14 * Math.sin(t * 3.2 + s.uid);
      }
      paintSoldier(ctx, s.x, s.y, stat.size, s.dir || 0, color, kind);
      if (cannons && kind !== "soldier") {
        paintUnitCannon(ctx, s.x, s.y, stat.size, s.dir || 0);
      }
      ctx.restore();

      if (typeof s.hp === "number") {
        const max = stat.health * (armored ? COMBAT.powerArmorMult : 1);
        drawObjectHp(s.x, s.y - stat.size - 8, stat.size * 1.6, s.hp, max);
      }
    }
  }

  // safe zone ring (over everything so it stays visible)
  if (rp.safe) drawSafeRing(rp.x, rp.y);

  // name tag
  ctx.font = "700 13px 'Nunito', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.strokeText(rp.name, rp.x, rp.y - PLACE.startSize - 18);
  ctx.fillStyle = color;
  ctx.fillText(rp.name, rp.x, rp.y - PLACE.startSize - 18);
}

function paintRemoteBuilding(color, rb) {
  const b = BUILDINGS[rb.b];
  if (!b) return;

  if (b.design === "turret") {
    paintTurret(ctx, rb.x, rb.y, b.size, rb.dir || 0, b.barrel, color);
  } else if (b.design === "generator") {
    paintGenerator(ctx, rb.x, rb.y, b.size, color);
  } else if (b.design === "house") {
    paintHouse(ctx, rb.x, rb.y, b.size, color);
  } else if (b.design === "tent") {
    paintTent(ctx, rb.x, rb.y, b.size, color, rb.dir || 0, rb.t || 1);
  } else if (b.design === "armory") {
    paintArmory(ctx, rb.x, rb.y, b.size, color, rb.dir || 0);
  } else {
    // default: plain circle (wall and everything else)
    ctx.beginPath();
    ctx.arc(rb.x, rb.y, b.size, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = BUILD_STYLE.borderWidth;
    ctx.strokeStyle = BUILD_STYLE.border;
    ctx.stroke();
  }

  if (typeof rb.hp === "number" && b.health) {
    drawObjectHp(rb.x, rb.y - b.size - 8, Math.max(28, b.size * 1.4), rb.hp, b.health);
  }
}

/* Green dashed ring marking a protected base */
function drawSafeRing(x, y) {
  ctx.save();
  ctx.setLineDash(PLACE.dashed);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#2fcf4f";
  ctx.beginPath();
  ctx.arc(x, y, PLACE.startSize + 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawStatusLabel(x, y, text, color) {
  ctx.font = "800 14px 'Nunito', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/* ---------- leaderboard ---------- */

function setStatus(text) {
  const el = document.getElementById("connection-status");
  if (el) el.textContent = text;
}

function refreshLeaderboard() {
  const list = document.getElementById("leaderboard-list");
  if (!list) return;

  const rows = [...net.players.values()]
    .sort((a, b) => (b.power || 0) - (a.power || 0))
    .map((p) => {
      const you = p.id === net.id;
      const cls = (you ? " you" : "") + (p.dead ? " dead" : "");
      return (
        '<div class="lb-row' + cls + '">' +
        '<span class="lb-dot" style="background:' + p.color + '"></span>' +
        '<span class="lb-name">' + escapeHtml(p.name) + "</span>" +
        '<span class="lb-power">' + Math.floor(p.power || 0) + "</span>" +
        "</div>"
      );
    })
    .join("");

  list.innerHTML = rows || '<div class="lb-row">No players</div>';

  const n = net.players.size;
  setStatus(net.online ? "Online - " + n + " player" + (n === 1 ? "" : "s") : "Offline");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v));
  const r = c(((n >> 16) & 255) + amt);
  const g = c(((n >> 8) & 255) + amt);
  const b = c((n & 255) + amt);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}