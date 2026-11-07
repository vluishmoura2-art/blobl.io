"use strict";

/* =========================================================
   Maré Alta - multiplayer client

   Talks to server.js over a WebSocket:
     - receives its spawn point (base position) + everyone else
     - reports what the player did (buildings, boats, research) at 10 Hz
     - renders other players (base, buildings, soldiers, safe zone)
     - drives the leaderboard (sorted by gold)
     - space toggles PvP on for yourself (drops the safe zone)

   The game is online only: a match starts when the server welcomes
   the player, and ends if the connection drops.
   ========================================================= */

/* The server that delivered the page is the one that runs the game. */
const HOST = (location.protocol === "https:" ? "wss://" : "ws://") + location.host;

const JOIN_TIMEOUT = 10000; // ms to wait for the server's welcome

const net = {
  id: null,
  online: false,
  dead: false, // the server destroyed our base
  players: new Map(), // id -> snapshot (includes ourself)
  mySafe: true,
  myPvp: false,
  mySafeRemaining: 0,
};

/* How long a sent unit may wait for its first appearance in a snapshot. */
const ACK_TIMEOUT = 5000; // ms

let netWs = null;
let netSendTimer = 0;
let netHadSession = false;

/* ---------- connection ---------- */

let joinTimer = 0;
let onMatchJoined = null;

function closeConnection() {
  clearTimeout(joinTimer);
  if (!netWs) return;
  netWs.onopen = netWs.onmessage = netWs.onerror = netWs.onclose = null;
  netWs.close();
  netWs = null;
}

/* Tries to join a new match. Exactly one of the two callbacks will run. */
function joinMatch(onJoined, onFailed) {
  closeConnection();
  netHadSession = false;
  onMatchJoined = onJoined;

  try {
    netWs = new WebSocket(HOST);
  } catch {
    onFailed();
    return;
  }

  const giveUp = () => {
    closeConnection();
    net.online = false;
    onFailed();
  };
  joinTimer = setTimeout(giveUp, JOIN_TIMEOUT);

  netWs.onopen = () => setStatus("Conectado, aguardando a ilha...");
  netWs.onmessage = (ev) => netMessage(ev.data);
  netWs.onclose = () => {
    if (!netHadSession) {
      giveUp();
      return;
    }
    netWs = null;
    net.online = false;
    setStatus("Desconectado");
    if (!net.dead) showConnectionLost();
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
    clearTimeout(joinTimer);
    resetMatch();
    net.id = msg.id;
    net.online = true;
    netHadSession = true;

    // Our base is at the spawn point the server assigned us
    PLAYER.x = msg.x;
    PLAYER.y = msg.y;
    camera.x = msg.x;
    camera.y = msg.y;
    camera.tx = msg.x;
    camera.ty = msg.y;

    net.mySafe = msg.safe;
    net.myPvp = false;
    net.mySafeRemaining = Math.max(0, msg.safeUntil - Date.now());

    net.players = new Map();
    for (const p of msg.players) net.players.set(p.id, p);

    reconcileSelf(msg.players.find((p) => p.id === net.id));

    // tell the server our chosen name + base color (leaderboard + hues)
    if (typeof PROFILE === "object") {
      netSend({ type: "identity", name: PROFILE.name, color: PROFILE.color, tag: PROFILE.tag || null });
    }

    state.joinedAt = performance.now();
    refreshLeaderboard();
    refreshPowerUI();
    onMatchJoined();
    draw();
  } else if (msg.type === "update") {
    syncMotion(msg.players);
    syncHits(msg.players);
    if (Array.isArray(msg.events)) handleBattleEvents(msg.events);

    net.players = new Map();
    for (const p of msg.players) net.players.set(p.id, p);

    const me = net.players.get(net.id);
    if (me) reconcileSelf(me);

    refreshLeaderboard();
  }
}

/* ---------- self reconciliation (the server has the last word) ---------- */

const SETTLE_MS = 1000; // time for a purchase or a swap to reach the server and come back
const BOAT_DRIFT = 120; // a boat this far from the server's position gets corrected (allows for slow connections)

/* Apply the server's view of our own game: gold, research, hp and positions. A
   recent purchase or swap hasn't come back yet, so it isn't corrected yet. */
function reconcileSelf(me) {
  if (!me) return;

  const wasSafe = net.mySafe;
  net.mySafe = me.safe;
  net.myPvp = me.pvp;
  net.mySafeRemaining = Math.max(0, me.safeUntil - Date.now());

  // "Passive": the safe-zone timer ran out on its own (space was never pressed)
  if (wasSafe && !me.safe && !me.pvp) {
    unlockAchievement("passive");
    showToast("Fim da proteção: agora sua ilha pode ser atacada", "bad");
  }

  // kill count relayed by the server drives the kill-milestone achievements
  if (typeof me.kills === "number" && typeof state === "object" && state) {
    state.kills = me.kills;
  }

  if (typeof me.health === "number") {
    const prev = state.playerHp;
    state.playerHp = Math.max(0, Math.min(me.health, COMBAT.player.health));
    if (prev - state.playerHp > 0.5) {
      addShake(2);
      notifyIslandHit();
    }
    refreshIslandHealth();
  }

  if (me.dead && !net.dead) {
    net.dead = true;
    showEliminated();
  }
  if (!me.dead) net.dead = false;

  refreshPowerUI();

  const now = performance.now();
  const settled = now - state.lastSpendAt > SETTLE_MS;

  if (settled) {
    if (Math.abs(me.power - state.power) > 2) state.power = me.power;
    state.upgrades = me.u;
  }

  const serverB = new Map();
  if (Array.isArray(me.buildings)) {
    for (const rb of me.buildings) serverB.set(rb.uid, rb);
  }
  placement.placed = placement.placed.filter((p) => {
    const rb = serverB.get(p.uid);
    if (rb) {
      p.hp = rb.hp;
      if (settled && rb.t) p.tier = rb.t;
      if (settled) {
        p.x = rb.x;
        p.y = rb.y;
      }
    }
    return survivesSnapshot(p, !!rb, now);
  });

  const serverS = new Map();
  if (Array.isArray(me.soldiers)) {
    for (const rs of me.soldiers) serverS.set(rs.uid, rs);
  }
  for (let i = soldiers.length - 1; i >= 0; i--) {
    const s = soldiers[i];
    const rs = serverS.get(s.uid);
    if (rs) {
      s.hp = rs.hp;
      if (Math.hypot(rs.x - s.x, rs.y - s.y) > BOAT_DRIFT) {
        s.x = rs.x;
        s.y = rs.y;
      }
    }
    if (!survivesSnapshot(s, !!rs, now)) soldiers.splice(i, 1);
  }
}

/* A unit the server has listed and then dropped was killed in combat. One it
   has never listed may still be on its way, however slow the connection or the
   frame rate, so it stays until the first-appearance limit runs out; a piece
   the server refused disappears then. */
function survivesSnapshot(unit, reported, now) {
  if (reported) {
    unit.acked = true;
    return true;
  }
  if (unit.acked) return false;
  return !(unit.sentAt && now - unit.sentAt > ACK_TIMEOUT);
}

function showEliminated() {
  const seconds = Math.round((performance.now() - state.joinedAt) / 1000);
  const killer = net.players.get(battle.sunkBy);
  const minutes = Math.floor(seconds / 60);
  const time = minutes > 0 ? minutes + " min " + (seconds % 60) + " s" : seconds + " s";
  const targets = state.kills === 1 ? "1 alvo" : state.kills + " alvos";

  showEndScreen(
    "Naufragou",
    (killer ? "Sua ilha foi afundada por " + killer.name + ". " : "Sua ilha foi destruída. ") +
      "Você resistiu por " + time + " e destruiu " + targets + "."
  );
  draw();
}

function showConnectionLost() {
  showEndScreen("Conexão perdida", "A partida terminou porque a ligação com o servidor caiu.");
}

/* ---------- outgoing state (10 Hz) ---------- */

function netUpdate(dt) {
  if (net.dead || !net.online || !netWs || netWs.readyState !== 1) return;

  netSendTimer += dt;
  if (netSendTimer < 0.1) return;
  netSendTimer = 0;

  const now = performance.now();
  for (const unit of placement.placed) unit.sentAt ??= now;
  for (const unit of soldiers) unit.sentAt ??= now;

  netSend({
    type: "state",
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
  const wasSafe = net.mySafe;
  net.mySafe = false;
  netSend({ type: "pvp" });
  if (wasSafe) showToast("PvP ativo: agora você pode atacar e ser atacado", "bad");
  if (typeof addShake === "function") addShake(2.5);
  if (typeof burst === "function") burst(PLAYER.x, PLAYER.y, PROFILE.color, 16, 150);
  if (typeof unlockAchievement === "function") unlockAchievement("pvp");
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
        drawPlate(PLAYER.x, PLAYER.y - PLACE.startSize - 40, "Protegido: " + Math.ceil(net.mySafeRemaining / 1000) + " s", SAFE_COLOR);
      } else if (net.myPvp) {
        drawPlate(PLAYER.x, PLAYER.y - PLACE.startSize - 40, "PvP ativo", "#B23A2E");
      }
      continue;
    }

    drawRemotePlayer(rp);
  }
}

function drawRemotePlayer(rp) {
  const r = PLACE.startSize;

  if (rp.dead) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    paintWreck(ctx, rp.x, rp.y, r, rp.id);
    drawBaseLabel(rp.x, rp.y, rp.name, null);
    ctx.restore();
    return;
  }

  const color = rp.color;
  const armored = (rp.u & COMBAT.upgradeFlags.armor) !== 0;
  const cannons = (rp.u & COMBAT.upgradeFlags.cannons) !== 0;
  const cloaked = (rp.u & COMBAT.upgradeFlags.cloak) !== 0;

  drawTide(rp.x, rp.y, rp.id);
  paintIsland(ctx, rp.x, rp.y, r, color, rp.id);
  drawHitFlash(pieceKey(rp.id, "island"), rp.x, rp.y, r);
  drawObjectHp(rp.x, rp.y - r - 14, r * 1.8, rp.health, COMBAT.player.health);

  for (const rb of rp.buildings) {
    const b = BUILDINGS[rb.b];
    if (!b) continue;
    const key = pieceKey(rp.id, rb.uid);
    paintBuilding(ctx, b, rb.x, rb.y, b.size, color, aimOf(key, rb.dir || 0), rb.t || 1, FX.t);
    drawHitFlash(key, rb.x, rb.y, b.size);
    drawObjectHp(rb.x, rb.y - b.size - 10, Math.max(28, b.size * 1.4), rb.hp, b.health);
  }

  for (const s of rp.soldiers) {
    const kind = s.kind || "soldier";
    const stat = COMBAT.units[kind] || COMBAT.soldier;
    const at = boatPosition(rp.id, s);

    ctx.save();
    // fog curtain: enemy captains see a pale shape, enemy cannons see nothing
    if (cloaked && kind !== "soldier") ctx.globalAlpha = 0.35;
    paintBoat(ctx, at.x, at.y, stat.size, at.dir, color, kind, cannons && kind !== "soldier");
    ctx.restore();
    drawHitFlash(pieceKey(rp.id, s.uid), at.x, at.y, stat.size * 0.8);

    drawObjectHp(at.x, at.y - stat.size - 8, stat.size * 1.6, s.hp, stat.health * (armored ? COMBAT.powerArmorMult : 1));
  }

  if (rp.safe) drawSafeRing(rp.x, rp.y);
  drawBaseLabel(rp.x, rp.y, rp.name, rp.tag || null);
}

/* A protected island: a teal dashed line printed around its coast. */
const SAFE_COLOR = "#1F7A7A";

function drawSafeRing(x, y) {
  ctx.save();
  ctx.setLineDash([16, 8]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = SAFE_COLOR;
  ctx.beginPath();
  ctx.arc(x, y, PLACE.startSize + 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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
    .map((p, i) => {
      const you = p.id === net.id;
      const cls = (you ? " you" : "") + (p.dead ? " dead" : "");
      const rank = '<span class="lb-rank">' + (i + 1) + "</span>";
      return (
        '<div class="lb-row' + cls + '">' +
        rank +
        '<span class="lb-flag" style="background:' + p.color + '"></span>' +
        '<span class="lb-name">' + escapeHtml(p.name) + "</span>" +
        '<span class="lb-power">' +
        Math.floor(p.power || 0) +
        "</span>" +
        "</div>"
      );
    })
    .join("");

  list.innerHTML = rows || '<div class="lb-row">Sem jogadores</div>';

  const others = [...net.players.values()].some((p) => p.id !== net.id && !p.dead);
  document.getElementById("alone").classList.toggle("visible", net.online && !others);

  const n = net.players.size;
  setStatus(net.online ? n + (n === 1 ? " capitão online" : " capitães online") : "Desconectado");
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