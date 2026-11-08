"use strict";

/* =========================================================
   hightide.io - local game state, map rendering and input

   Scene:
     - A nautical chart: paper, contour bands, soundings, compass roses
     - Your island stays still; only the camera moves (WASD)
     - Buildings go anywhere around the island, in polar coordinates, with
       their distance from the center limited by building type
     - Docks sit on the outer ring; everything else stays within reach

   Drawings of the pieces live in art.js.
   ========================================================= */

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

/* ---------- STYLE ---------- */
const STYLE = {
  tableTop: "#CFC2A5", // what lies beyond the edges of the chart
  fill: "#C8553D", // the player's color (see setPlayerColor)
};

/* ---------- PLACEMENT RULES ---------- */
const PLACE = { startSize: COMBAT.place.baseRadius, buildRange: COMBAT.place.buildRange };

/* Building definitions. Index order matches the number keys 1..7. Prices and
   stats come from shared/combat.js, so they always match the server's. */
const BUILDINGS = [
  { name: "Recife", desc: "Bloqueia a passagem dos barcos inimigos.", design: "wall" },
  { name: "Canhão", desc: "Atira no barco inimigo mais próximo.", design: "turret" },
  { name: "Moinho", desc: "Rende 1 de ouro por segundo.", design: "generator" },
  { name: "Cabana", desc: "Aumenta em 2 o limite de botes.", design: "house" },
  { name: "Canhão longo", desc: "Alcance maior e tiro muito mais forte.", design: "sniper" },
  { name: "Arsenal", desc: "Com esta ferramenta, clique nele para pesquisar.", design: "armory" },
  { name: "Cais", desc: "Produz botes. Com esta ferramenta, clique nele para evoluir.", design: "tent" },
].map((definition, i) => ({ ...definition, ...COMBAT.buildingStats[i] }));

/* ---------- GOLD ---------- */
const POWER = {
  start: COMBAT.startGold,
};

const state = {
  power: POWER.start,
  playerHp: COMBAT.player.health,
  upgrades: 0, // armory research bitmask (see COMBAT.upgradeFlags)
  kills: 0, // kills credited by the server (drives achievements)
  joinedAt: 0, // when this match started (ms)
  orderedFleet: false, // has sent boats somewhere at least once
  lastSpendAt: -Infinity, // when gold, research or a swap last changed here (ms)
};

/* ---------- UNITS (soldiers / tanks / siege tanks) ---------- */
const UPGRADES = COMBAT.upgradeFlags;
const TENT_TIERS = COMBAT.tents; // index 1..4
const UNIT_STATS = COMBAT.units;

const TANK_CAP = COMBAT.boatLimits.tank;
const SIEGE_CAP = COMBAT.boatLimits.siege;

const BOAT_NAMES = { soldier: "botes", tank: "fragatas", siege: "galeões" };

function hasUpgrade(key) {
  return (state.upgrades & UPGRADES[key]) !== 0;
}

function canAffordCost(cost) {
  return state.power >= cost;
}

const placement = {
  active: null, // index into BUILDINGS, or null when nothing is selected
  mouseX: null, // mouse position relative to the canvas (screen space)
  mouseY: null,
  placed: [], // { building, x, y } in world coords
};

/* ---------- BOATS (built by docks, moved by left-click) ---------- */
const FLEET_SPREAD = 18; // target jitter, so boats don't stack on one spot

const soldiers = []; // { x, y, dir, tx, ty, origin, ox, oy, uid, hp }

/* ---------- UNIT IDS (stable identity, so the server can track hp) ---------- */
let uidCounter = 0;

function nextUid() {
  return ++uidCounter;
}

/* True once the server says our base was destroyed (input is blocked) */
function isEliminated() {
  return typeof net === "object" && net !== null && net.dead === true;
}

/* ---------- ACTION MODES (swap / delete) ---------- */
let actionMode = null; // null | "swap" | "delete"

/* Swap-mode drag state: the building lifted under the cursor. It keeps its real
   position until the drop, so the server never sees it mid-drag and letting go
   over empty space simply puts it back. */
const drag = { active: false, building: null };

/* ---------- MAP (large world) ---------- */
const MAP = COMBAT.map;

/* ---------- PLAYER / BASE (fixed in world space) ---------- */
const PLAYER = {
  x: MAP.width / 2,
  y: MAP.height / 2,
};

/* ---------- CAMERA (the only thing that moves) ---------- */
const CAMERA = {
  speed: 900, // world px per second while a key is held
};

const camera = {
  x: PLAYER.x,
  y: PLAYER.y,
  // desired position: input nudges these, the real camera eases toward them so
  // movement carries weight instead of snapping (see updateCamera)
  tx: PLAYER.x,
  ty: PLAYER.y,
};

/* Movement keys currently held down (normalized to lowercase) */
const keys = new Set();

/* Which keys move the camera, and in what direction */
const MOVE_KEYS = {
  w: { x: 0, y: -1 },
  a: { x: -1, y: 0 },
  s: { x: 0, y: 1 },
  d: { x: 1, y: 0 },
  arrowup: { x: 0, y: -1 },
  arrowleft: { x: -1, y: 0 },
  arrowdown: { x: 0, y: 1 },
  arrowright: { x: 1, y: 0 },
};

let lastTime = 0;

/* ---------- HELPERS ---------- */
function viewSize() {
  const dpr = window.devicePixelRatio || 1;
  return { w: canvas.width / dpr, h: canvas.height / dpr };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/* Screen (canvas) point -> world point, via the camera */
function screenToWorld(sx, sy, w, h) {
  return { x: sx - w / 2 + camera.x, y: sy - h / 2 + camera.y };
}

/* ---------- RESIZE (device-pixel-ratio aware) ---------- */
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  draw();
}

/* ---------- CAMERA UPDATE (WASD steers the camera) ---------- */
/* Input pushes a target point; the camera then eases toward it (exponential
   smoothing) so starts, stops and turns feel fluid and weighted. */
function updateCamera(dt) {
  let dx = 0;
  let dy = 0;

  for (const key of keys) {
    const dir = MOVE_KEYS[key];
    if (dir) {
      dx += dir.x;
      dy += dir.y;
    }
  }

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    camera.tx += (dx / len) * CAMERA.speed * dt;
    camera.ty += (dy / len) * CAMERA.speed * dt;
  }

  camera.tx = clamp(camera.tx, 0, MAP.width);
  camera.ty = clamp(camera.ty, 0, MAP.height);

  // frame-rate independent lerp toward the target (~16/s catch-up rate)
  const ease = 1 - Math.exp(-dt * 16);
  camera.x += (camera.tx - camera.x) * ease;
  camera.y += (camera.ty - camera.y) * ease;
}

/* ---------- PLACEMENT MATH ---------- */

/* Resolve the final build spot: free angle, distance clamped by type. */
function resolvePlacement(building, worldX, worldY) {
  const dx = worldX - PLAYER.x;
  const dy = worldY - PLAYER.y;
  const dir = Math.atan2(dy, dx);
  const dist = COMBAT.resolveDistance(building, Math.hypot(dx, dy));

  return {
    x: PLAYER.x + dist * Math.cos(dir),
    y: PLAYER.y + dist * Math.sin(dir),
    dir,
    dist,
  };
}

/* Overlap test: any own building (type != 1) whose circles intersect blocks it. */
function placementValid(x, y, size, ignore) {
  for (const p of placement.placed) {
    if (p.building.type === 1) continue; // mobile units never block
    if (ignore && ignore.includes(p)) continue;
    if (size + p.building.size >= distance(x, y, p.x, p.y)) return false;
  }
  return true;
}

/* Building-count limit (armory x1, tent x3). */
function limitReached(building) {
  if (!building.limit) return false;
  let n = 0;
  for (const p of placement.placed) if (p.building === building) n++;
  return n >= building.limit;
}

/* The building the selected tool would upgrade at a point: a dock with the dock
   tool, the arsenal with its tool, or any upgradable building with its own. */
function upgradeTarget(world) {
  const hit = buildingAt(world.x, world.y);
  if (!hit || hit.building !== BUILDINGS[placement.active]) return null;
  return hit.building.design === "tent" || hit.building.design === "armory" || canUpgrade(hit) ? hit : null;
}

/* The ghost the player is currently aiming (or null). The aim point is eased
   each frame (see updateFx), so the preview trails the cursor elastically. */
function currentGhost(w, h) {
  if (placement.active === null || placement.mouseX === null) return null;

  const building = BUILDINGS[placement.active];
  if (upgradeTarget(screenToWorld(placement.mouseX, placement.mouseY, w, h))) return null;
  const world =
    FX.aim && FX.aim.x != null ? FX.aim : screenToWorld(placement.mouseX, placement.mouseY, w, h);
  const pos = resolvePlacement(building, world.x, world.y);

  return {
    building,
    x: pos.x,
    y: pos.y,
    valid:
      placementValid(pos.x, pos.y, building.size) && canAfford(building) && !limitReached(building),
  };
}

/* Place the active building at the resolved (clamped, collision-checked) spot. */
function placeBuilding(screenX, screenY, w, h) {
  if (placement.active === null) return;

  const building = BUILDINGS[placement.active];
  if (limitReached(building)) {
    denyFx("Limite atingido: máximo de " + building.limit + " (" + building.name + ")");
    return;
  }
  if (!canAfford(building)) {
    denyFx(missingGold(building.cost));
    return;
  }

  const world = screenToWorld(screenX, screenY, w, h);
  const pos = resolvePlacement(building, world.x, world.y);

  if (!placementValid(pos.x, pos.y, building.size)) {
    denyFx("Não cabe aqui: já tem uma construção nesse lugar");
    return;
  }

  placement.placed.push({
    building,
    x: pos.x,
    y: pos.y,
    dir: pos.dir,
    uid: nextUid(),
    hp: building.health,
    born: FX.t, // spawn timer drives the squash-and-stretch pop
    tier: building.design === "tent" ? 1 : undefined, // tent upgrade tier (1..4)
    level: 1, // upgrade level (1..4), see upgrades.js
    path: null, // "A" or "B" once upgraded
    invested: building.cost, // everything paid for it, for the refund
  });
  state.power -= building.cost;
  state.lastSpendAt = performance.now();
  refreshPowerUI();
  addShake(2.5);
  burst(pos.x, pos.y, STYLE.fill, 14, 130);
}

/* ---------- TENT UPGRADES + ARMORY RESEARCH ---------- */

/* Buying juice: the little "snap" flash + tremor shared by upgrades. */
function purchaseFx(x, y) {
  addShake(2.5);
  burst(x, y, STYLE.fill, 14, 130);
}

function denyFx(reason) {
  addShake(1.2);
  showToast(reason, "bad");
}

function missingGold(cost) {
  return "Ouro insuficiente: faltam " + Math.ceil(cost - state.power);
}

/* With the Tent tool selected, clicking an existing tent buys its next tier:
   greater barracks -> tank factory -> siege foundry. */
function upgradeTent(p) {
  if (!TENT_TIERS) return;
  const next = TENT_TIERS[p.tier + 1];
  if (!next) {
    denyFx("Este cais já está no nível máximo");
    return;
  }
  if (!canAffordCost(next.cost)) {
    denyFx(missingGold(next.cost));
    return;
  }
  p.tier += 1;
  p.invested = (p.invested || p.building.cost) + next.cost;
  showToast(next.name + " pronto: produz " + BOAT_NAMES[next.unit], "good");
  state.power -= next.cost;
  state.lastSpendAt = performance.now();
  refreshPowerUI();
  purchaseFx(p.x, p.y);
}

/* With the Armory tool selected, clicking the armory buys the next research in
   the fixed order: Power Armor -> Booster Engines -> Panzer Cannons -> Cloak. */
function researchArmory(p) {
  const next = (COMBAT.armoryResearch || []).find((r) => !hasUpgrade(r.key));
  if (!next) {
    denyFx("Todas as pesquisas já foram feitas");
    return;
  }
  if (!canAffordCost(next.cost)) {
    denyFx(missingGold(next.cost));
    return;
  }
  state.upgrades |= UPGRADES[next.key];
  showToast(next.name + ": " + next.desc, "good");
  state.power -= next.cost;
  state.lastSpendAt = performance.now();
  refreshPowerUI();
  purchaseFx(p.x, p.y);
}

/* ---------- POWER / COST ---------- */
function canAfford(building) {
  return state.power >= building.cost;
}

function countGenerators() {
  let n = 0;
  for (const p of placement.placed) {
    if (p.building.design === "generator") n++;
  }
  return n;
}

function refreshPowerUI() {
  const el = document.getElementById("power-value");
  if (!el) return;

  const shown = String(Math.floor(state.power));
  if (el.textContent !== shown) el.textContent = shown;

  for (const tool of TOOL_BUTTONS) {
    const building = BUILDINGS[tool.building];
    const button = document.getElementById(tool.id);
    if (!button) continue;

    const full = limitReached(building);
    button.classList.toggle("unavailable", full || !canAfford(building));
    const cost = button.querySelector(".tool-cost");
    const label = full ? "máx." : String(building.cost);
    if (cost.textContent !== label) cost.textContent = label;
  }
}

/* Gold per second from every windmill, at its level. */
function goldIncome() {
  let total = 0;
  for (const p of placement.placed) total += pieceStats(p).gold || 0;
  return total;
}

/* What the player needs to read at a glance: income and fleet limits. */
function refreshHud() {
  const rate = "+" + goldIncome().toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "/s";
  const rateEl = document.getElementById("power-rate");
  if (rateEl.textContent !== rate) rateEl.textContent = rate;

  const parts = ["Botes " + countUnits("soldier") + "/" + soldierLimit()];
  const tier = placement.placed.reduce((top, p) => Math.max(top, p.tier || 0), 0);
  if (tier >= 3 || countUnits("tank") > 0) parts.push("Fragatas " + countUnits("tank") + "/" + TANK_CAP);
  if (tier >= 4 || countUnits("siege") > 0) parts.push("Galeões " + countUnits("siege") + "/" + SIEGE_CAP);
  const fleet = parts.join(" · ");
  const fleetEl = document.getElementById("fleet");
  if (fleetEl.textContent !== fleet) fleetEl.textContent = fleet;
}

/* Windmills add gold every second (more when upgraded on the gold path) */
function updatePower(dt) {
  const income = goldIncome();
  if (income === 0) return;

  state.power += income * dt;
  refreshPowerUI();
}

/* ---------- SOLDIERS ---------- */
/* Huts raise how many dinghies you can field. */
function countHouses() {
  let n = 0;
  for (const p of placement.placed) if (p.building.design === "house") n++;
  return n;
}

function soldierLimit() {
  return COMBAT.boatLimits.soldierBase + COMBAT.boatLimits.perHut * countHouses();
}

function spawnUnit(tent) {
  const cfg = TENT_TIERS[Math.min(tent.tier || 1, TENT_TIERS.length - 1)];
  const stat = UNIT_STATS[cfg.unit];
  const dx = PLAYER.x - tent.x;
  const dy = PLAYER.y - tent.y;
  const len = Math.hypot(dx, dy) || 1;
  const dist = tent.building.size + stat.size + 4; // just outside the tent

  soldiers.push({
    x: tent.x + (dx / len) * dist,
    y: tent.y + (dy / len) * dist,
    dir: Math.atan2(dy, dx), // face toward the base
    tx: null,
    ty: null,
    origin: tent,
    ox: (Math.random() * 2 - 1) * FLEET_SPREAD,
    oy: (Math.random() * 2 - 1) * FLEET_SPREAD,
    uid: nextUid(),
    kind: cfg.unit,
    hp: stat.health * (hasUpgrade("armor") ? COMBAT.powerArmorMult : 1),
  });
}

/* Tents produce their tier's unit over time: soldiers honor the house-driven
   cap, while tanks and siege tanks have their own field caps. */
function updateTents(dt) {
  for (const p of placement.placed) {
    if (p.building.design !== "tent") continue;

    const cfg = TENT_TIERS[Math.min(p.tier || 1, TENT_TIERS.length - 1)];
    p.spawnTimer = (p.spawnTimer || 0) + dt;
    while (p.spawnTimer >= cfg.interval) {
      p.spawnTimer -= cfg.interval;
      if (cfg.unit === "soldier" && countUnits("soldier") < soldierLimit()) spawnUnit(p);
      else if (cfg.unit === "tank" && countUnits("tank") < TANK_CAP) spawnUnit(p);
      else if (cfg.unit === "siege" && countUnits("siege") < SIEGE_CAP) spawnUnit(p);
    }
  }
}

function countUnits(kind) {
  let n = 0;
  for (const s of soldiers) if ((s.kind || "soldier") === kind) n++;
  return n;
}

/* Enemy reefs are solid: a boat stops at the edge and slides around them. */
function slideAroundEnemyReefs(boat, size) {
  for (const rp of net.players.values()) {
    if (rp.id === net.id || rp.dead) continue;
    for (const b of rp.buildings) {
      const def = BUILDINGS[b.b];
      if (!def || def.design !== "wall") continue;
      const reach = def.size + size;
      const d = Math.hypot(boat.x - b.x, boat.y - b.y);
      if (d < reach && d > 0) {
        boat.x = b.x + ((boat.x - b.x) / d) * reach;
        boat.y = b.y + ((boat.y - b.y) / d) * reach;
      }
    }
  }
}

/* Boats sail toward their target (or stay put when tx is null). Frigates and
   galleons are slower unless the sail research is done. */
function updateSoldiers(dt) {
  for (const s of soldiers) {
    let moving = 0;

    if (s.tx !== null) {
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);

      if (d <= 0.5) {
        s.tx = null;
        s.ty = null;
      } else {
        const kind = s.kind || "soldier";
        const base = UNIT_STATS[kind].speed;
        const boosted = kind !== "soldier" && hasUpgrade("booster") ? base * COMBAT.boosterMult : base;
        const speed = s.slowUntil > performance.now() ? boosted * COMBAT.slowFactor : boosted;

        s.dir = Math.atan2(dy, dx);
        const step = Math.min(speed * dt, d);
        s.x += Math.cos(s.dir) * step;
        s.y += Math.sin(s.dir) * step;
        slideAroundEnemyReefs(s, UNIT_STATS[kind].size);
        moving = 1;

        if (step >= d) {
          s.tx = null;
          s.ty = null;
        }
      }
    }

    // eased "is moving" flag, so a wake only forms once a boat is under way
    const move = s.move || 0;
    s.move = move + (moving - move) * (1 - Math.exp(-dt * 12));

    // a moving boat leaves small ripples behind it
    if (moving && s.move > 0.25 && FX.wake.length < 200 && Math.random() < 0.25) {
      const tail = s.dir + Math.PI;
      const stat = UNIT_STATS[s.kind || "soldier"];
      FX.wake.push({
        x: s.x + Math.cos(tail) * stat.size,
        y: s.y + Math.sin(tail) * stat.size,
        r: 2,
        life: 1,
      });
    }
  }
}

/* Left-click order: send every unit to the clicked world point */
function commandSoldiers(worldX, worldY) {
  if (soldiers.length === 0) {
    showToast("Você ainda não tem barcos: construa um cais");
    return;
  }
  FX.orders.push({ x: worldX, y: worldY, life: 1 });
  state.orderedFleet = true;
  for (const s of soldiers) {
    s.tx = worldX + s.ox;
    s.ty = worldY + s.oy;
  }
}

function drawSoldiers() {
  const cannons = hasUpgrade("cannons");
  for (const s of soldiers) {
    const kind = s.kind || "soldier";
    const stat = UNIT_STATS[kind];
    paintBoat(ctx, s.x, s.y, stat.size, s.dir, STYLE.fill, kind, cannons && kind !== "soldier");
    drawHitFlash(pieceKey(net.id, s.uid), s.x, s.y, stat.size * 0.8);
    if (s.hp !== undefined) {
      const max = stat.health * (hasUpgrade("armor") ? COMBAT.powerArmorMult : 1);
      drawObjectHp(s.x, s.y - stat.size - 8, stat.size * 1.6, s.hp, max);
    }
  }
}

/* ---------- HEALTH BARS ---------- */
/* Small bar above a damaged piece; hidden while it has full health. */
function drawObjectHp(x, y, w, hp, max) {
  if (!(max > 0) || hp >= max) return;

  const h = 6;
  const x0 = x - w / 2;
  const frac = Math.max(0, Math.min(1, hp / max));

  ctx.fillStyle = PAPER;
  ctx.fillRect(x0, y, w, h);
  ctx.fillStyle = frac > 0.35 ? "#3F7D4E" : "#B23A2E";
  ctx.fillRect(x0, y, w * frac, h);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = INK;
  ctx.strokeRect(x0, y, w, h);
}

/* ---------- GAME FEEL ---------- */
const CALM_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FX = {
  wake: [], // ripples behind moving boats
  orders: [], // marks where the fleet was just sent
  bursts: [], // particles on place / swap / delete
  shake: 0, // remaining screen tremor magnitude (world px)
  ghostAge: 0, // seconds since a tool was selected (ghost fade-in)
  aim: null, // eased aim point for the placement ghost
  t: 0,
};

/* A short screen tremor; draw() offsets the world by the remaining magnitude. */
function addShake(mag) {
  if (!CALM_MOTION) FX.shake = Math.max(FX.shake, mag);
}

/* Radial burst of short-lived particles. */
function burst(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.3 + Math.random() * 0.7);
    FX.bursts.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      r: 1.5 + Math.random() * 2.5,
      life: 1,
      fade: 2.2 + Math.random() * 1.6,
      color,
    });
  }
  if (FX.bursts.length > 240) FX.bursts.splice(0, FX.bursts.length - 240);
}

function updateFx(dt) {
  const { w, h } = viewSize();

  FX.shake = Math.max(0, FX.shake - dt * 26);
  if (FX.ghostAge < 2) FX.ghostAge += dt;

  for (let i = FX.bursts.length - 1; i >= 0; i--) {
    const p = FX.bursts[i];
    p.life -= dt * p.fade;
    if (p.life <= 0) {
      FX.bursts.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  for (let i = FX.wake.length - 1; i >= 0; i--) {
    const p = FX.wake[i];
    p.life -= dt * 1.5;
    p.r += dt * 16;
    if (p.life <= 0) FX.wake.splice(i, 1);
  }

  for (let i = FX.orders.length - 1; i >= 0; i--) {
    FX.orders[i].life -= dt * 1.4;
    if (FX.orders[i].life <= 0) FX.orders.splice(i, 1);
  }

  if (placement.mouseX !== null) {
    const m = screenToWorld(placement.mouseX, placement.mouseY, w, h);
    if (!FX.aim) FX.aim = { x: m.x, y: m.y };
    const ease = 1 - Math.pow(0.001, dt);
    FX.aim.x += (m.x - FX.aim.x) * ease;
    FX.aim.y += (m.y - FX.aim.y) * ease;
  }
}

function drawEffects() {
  // the mark where the fleet was sent: an ink X inside a closing ring
  for (const p of FX.orders) {
    const arm = 8;
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(p.x - arm, p.y - arm);
    ctx.lineTo(p.x + arm, p.y + arm);
    ctx.moveTo(p.x + arm, p.y - arm);
    ctx.lineTo(p.x - arm, p.y + arm);
    ctx.moveTo(p.x + 12 + 16 * p.life, p.y);
    ctx.arc(p.x, p.y, 12 + 16 * p.life, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.lineWidth = 1.5;
  for (const p of FX.wake) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.strokeStyle = colorWithAlpha(SEA_INK, p.life * 0.6);
    ctx.stroke();
  }

  for (const p of FX.bursts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* True when the crosshair sits on an attackable target: an enemy island, boat
   or building, or one of our own buildings in delete mode. */
function crosshairHot(worldX, worldY) {
  if (actionMode === "delete" && buildingAt(worldX, worldY)) return true;

  if (net.players instanceof Map) {
    for (const rp of net.players.values()) {
      if (rp.id === net.id || rp.dead) continue;

      if (Math.hypot(rp.x - worldX, rp.y - worldY) <= PLACE.startSize + 6) return true;
      for (const s of rp.soldiers) {
        const stat = UNIT_STATS[s.kind] || COMBAT.soldier;
        if (Math.hypot(s.x - worldX, s.y - worldY) <= stat.size + 6) return true;
      }
      for (const b of rp.buildings) {
        const bd = BUILDINGS[b.b];
        if (bd && Math.hypot(b.x - worldX, b.y - worldY) <= bd.size + 6) return true;
      }
    }
  }
  return false;
}

/* Ink reticle at the cursor; turns red over an enemy or a delete target. */
function drawCrosshair(w, h) {
  if (placement.mouseX === null) return;

  const world = screenToWorld(placement.mouseX, placement.mouseY, w, h);
  const color = crosshairHot(world.x, world.y) ? "#B23A2E" : INK;
  const r = 8;

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(world.x, world.y, r, 0, Math.PI * 2);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.moveTo(world.x + Math.cos(a) * (r - 3), world.y + Math.sin(a) * (r - 3));
    ctx.lineTo(world.x + Math.cos(a) * (r + 5), world.y + Math.sin(a) * (r + 5));
  }
  ctx.stroke();
}

/* ---------- THE CHART (map background) ---------- */
/* The whole map is painted once onto its own canvas; each frame only copies
   the visible part. The seed keeps it identical for every player. */
const chart = document.createElement("canvas");
const CHART_FONT = "'IM Fell English', Georgia, serif";

function paintCompassRose(g, x, y, r) {
  g.save();
  g.translate(x, y);

  g.strokeStyle = "rgba(43, 58, 66, 0.1)";
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a) * 3200, Math.sin(a) * 3200);
  }
  g.stroke();

  g.strokeStyle = "rgba(43, 58, 66, 0.55)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.moveTo(r * 0.82, 0);
  g.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  g.stroke();

  for (let i = 0; i < 8; i++) {
    const long = i % 2 === 0;
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const tip = long ? r * 0.98 : r * 0.58;
    const side = a + Math.PI / 2;
    const base = r * 0.12;
    const halves = [
      [1, "rgba(43, 58, 66, 0.7)"],
      [-1, PAPER],
    ];
    for (const [dir, fill] of halves) {
      g.beginPath();
      g.moveTo(Math.cos(a) * tip, Math.sin(a) * tip);
      g.lineTo(0, 0);
      g.lineTo(Math.cos(side) * base * dir, Math.sin(side) * base * dir);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = "rgba(43, 58, 66, 0.7)";
      g.stroke();
    }
  }

  g.fillStyle = "rgba(43, 58, 66, 0.75)";
  g.font = "22px " + CHART_FONT;
  g.textAlign = "center";
  g.textBaseline = "bottom";
  g.fillText("N", 0, -r - 3);
  g.restore();
}

function buildChart() {
  chart.width = MAP.width;
  chart.height = MAP.height;
  const g = chart.getContext("2d");
  const rand = seededRandom(1498);
  const cx = MAP.width / 2;
  const cy = MAP.height / 2;

  g.fillStyle = PAPER;
  g.fillRect(0, 0, MAP.width, MAP.height);

  // depth bands: flat tints with an irregular contour, shallowest at the center
  const bands = [
    [1320, "#EEE9D8"],
    [1020, "#E8E7D8"],
    [740, "#E1E4D7"],
  ];
  for (const [radius, fill] of bands) {
    const points = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const r = radius * (0.92 + rand() * 0.14);
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    traceClosedCurve(g, points);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = SEA_LINE;
    g.stroke();
  }

  // latitude / longitude lines, with their labels
  g.strokeStyle = "rgba(95, 128, 136, 0.3)";
  g.lineWidth = 1;
  g.beginPath();
  for (let v = 250; v < MAP.width; v += 250) {
    g.moveTo(v, 0);
    g.lineTo(v, MAP.height);
    g.moveTo(0, v);
    g.lineTo(MAP.width, v);
  }
  g.stroke();

  g.font = "italic 15px " + CHART_FONT;
  g.fillStyle = "rgba(95, 128, 136, 0.8)";
  g.textAlign = "left";
  g.textBaseline = "bottom";
  for (let v = 250; v < MAP.width; v += 250) {
    const degrees = v / 50 + "°";
    for (let along = 500; along < MAP.width; along += 1000) {
      g.fillText(degrees, v + 5, along);
      g.fillText(degrees, along + 5, v - 2);
    }
  }

  const roses = [
    [620, 640, 90],
    [2380, 760, 70],
    [760, 2380, 70],
    [2340, 2300, 90],
  ];
  for (const [x, y, r] of roses) paintCompassRose(g, x, y, r);

  // depth soundings and little wave marks scattered over the water
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(95, 128, 136, 0.65)";
  g.font = "italic 14px " + CHART_FONT;
  for (let i = 0; i < 520; i++) {
    g.fillText(String(3 + Math.floor(rand() * 90)), rand() * MAP.width, rand() * MAP.height);
  }

  g.strokeStyle = "rgba(95, 128, 136, 0.5)";
  g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i < 240; i++) {
    const x = rand() * MAP.width;
    const y = rand() * MAP.height;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 6, y - 6, x + 12, y);
    g.quadraticCurveTo(x + 18, y + 6, x + 24, y);
  }
  g.stroke();

  // the chart's printed frame, with alternating scale marks
  g.lineWidth = 3;
  g.strokeStyle = INK;
  g.strokeRect(1.5, 1.5, MAP.width - 3, MAP.height - 3);
  g.fillStyle = INK;
  for (let v = 0, dark = true; v < MAP.width; v += 50, dark = !dark) {
    if (!dark) continue;
    g.fillRect(v, 3, 50, 8);
    g.fillRect(v, MAP.height - 11, 50, 8);
    g.fillRect(3, v, 8, 50);
    g.fillRect(MAP.width - 11, v, 8, 50);
  }
}

function drawChart(w, h) {
  const x = Math.max(0, Math.floor(camera.x - w / 2 - 10));
  const y = Math.max(0, Math.floor(camera.y - h / 2 - 10));
  const cw = Math.min(MAP.width - x, Math.ceil(w + 20));
  const ch = Math.min(MAP.height - y, Math.ceil(h + 20));
  if (cw > 0 && ch > 0) ctx.drawImage(chart, x, y, cw, ch, x, y, cw, ch);
}

/* ---------- DRAW ---------- */
function draw(time = performance.now()) {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = viewSize();
  FX.t = time / 1000;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = STYLE.tableTop;
  ctx.fillRect(0, 0, w, h);

  const ghost = currentGhost(w, h);

  // screen tremor: the world jitters but the reticle stays glued to the mouse
  const sx = Math.round((Math.random() * 2 - 1) * FX.shake);
  const sy = Math.round((Math.random() * 2 - 1) * FX.shake);

  // World space: everything below is drawn relative to the camera
  ctx.save();
  ctx.translate(w / 2 - camera.x + sx, h / 2 - camera.y + sy);

  drawChart(w, h);
  drawRemotePlayers();
  drawRangeIndicators();
  drawBase();
  drawBuildings();
  drawSoldiers();
  drawEffects();
  drawBattle();
  drawGhost(ghost);
  drawUpgradeHint(w, h);
  ctx.translate(-sx, -sy);
  drawCrosshair(w, h);

  ctx.restore();
}

/* The limit of where you can build, printed like a chart boundary. It darkens
   while a building tool is selected. */
function drawRangeIndicators() {
  // repair workshops show their reach to their owner
  ctx.save();
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = colorWithAlpha(HEAL, 0.6);
  for (const p of placement.placed) {
    const stats = pieceStats(p);
    if (!stats.repairRange || pieceLevel(p) < 3) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, stats.repairRange, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.setLineDash([12, 9]);
  ctx.lineWidth = placement.active === null ? 1.5 : 2.5;
  ctx.strokeStyle = colorWithAlpha(INK, placement.active === null ? 0.3 : 0.75);
  ctx.beginPath();
  ctx.arc(PLAYER.x, PLAYER.y, PLACE.buildRange, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* A player's name printed on their island, with their insignia below it. The
   font shrinks so even a 16-letter name fits the island. */
function drawBaseLabel(x, y, name, tagId) {
  if (!name) return;
  name = String(name);

  const maxWidth = PLACE.startSize * 1.35;
  let size = 30;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 " + size + "px 'Alegreya Sans', system-ui, sans-serif";
  while (size > 10 && ctx.measureText(name).width > maxWidth) {
    size -= 1;
    ctx.font = "800 " + size + "px 'Alegreya Sans', system-ui, sans-serif";
  }

  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.22);
  ctx.strokeStyle = INK;
  ctx.strokeText(name, x, y);
  ctx.fillStyle = PAPER;
  ctx.fillText(name, x, y);
  ctx.restore();

  if (tagId) drawBaseTag(x, y + size * 0.5 + 14, tagId);
}

/* A printed label on the chart: paper plate, ink border, ink text. */
function drawPlate(x, y, text, color) {
  ctx.save();
  ctx.font = "800 13px 'Alegreya Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const w = ctx.measureText(text).width + 16;
  const h = 21;
  ctx.fillStyle = PAPER;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color || INK;
  ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = color || INK;
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function drawBaseTag(x, y, tagId) {
  const label = getAchievementName(tagId);
  if (label) drawPlate(x, y, label);
}

/* The tide: one ripple slowly leaving the coast, every few seconds. */
function drawTide(x, y, seed) {
  const phase = ((FX.t + (hashSeed(seed) % 50) / 10) % 6) / 6;
  traceClosedCurve(ctx, scaledShape(islandShape(seed), x, y, PLACE.startSize * (1.12 + 0.22 * phase)));
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = colorWithAlpha(SEA_INK, 0.7 * (1 - phase));
  ctx.stroke();
}

function drawBase() {
  const seed = net.id || "local";
  const r = PLACE.startSize;

  if (isEliminated()) {
    paintWreck(ctx, PLAYER.x, PLAYER.y, r, seed);
    return;
  }

  drawTide(PLAYER.x, PLAYER.y, seed);
  paintIsland(ctx, PLAYER.x, PLAYER.y, r, STYLE.fill, seed);
  drawHitFlash(pieceKey(seed, "island"), PLAYER.x, PLAYER.y, r);
  drawHealMark(pieceKey(seed, "island"), PLAYER.x, PLAYER.y, r);
  drawObjectHp(PLAYER.x, PLAYER.y - r - 14, r * 1.8, state.playerHp, COMBAT.player.health);
  drawBaseLabel(PLAYER.x, PLAYER.y, PROFILE.name, PROFILE.tag);
}

/* Radial angle from the island's center to a building */
function buildingDir(p) {
  return Math.atan2(p.y - PLAYER.y, p.x - PLAYER.x);
}

function drawBuildings() {
  for (const p of placement.placed) {
    if (p !== drag.building) drawPlacedBuilding(p);
  }

  // the lifted building follows the cursor, on top of everything else
  if (drag.active && placement.placed.includes(drag.building)) {
    const { w, h } = viewSize();
    const at = screenToWorld(placement.mouseX, placement.mouseY, w, h);
    drawPlacedBuilding({ ...drag.building, x: at.x, y: at.y });
  }
}

function drawPlacedBuilding(p) {
  // a new piece overshoots its size a little, then settles within ~0.3s
  const age = (p.born === undefined ? 1 : FX.t - p.born) || 0;
  const st = Math.min(1, age / 0.3);
  const pop = 1 + 0.28 * Math.sin(st * Math.PI) * (1 - st * 0.72);

  const key = pieceKey(net.id, p.uid);
  const radial = buildingDir(p);
  paintBuilding(ctx, p.building, p.x, p.y, p.building.size * pop, STYLE.fill, aimOf(key, radial), p.tier, FX.t, p.level, p.path);
  paintLevelPips(ctx, p.x, p.y, p.building.size, radial, p.level, p.path);
  drawHitFlash(key, p.x, p.y, p.building.size);
  drawHealMark(key, p.x, p.y, p.building.size);

  if (p.building.health && p.hp !== undefined) {
    drawObjectHp(p.x, p.y - p.building.size - 10, Math.max(28, p.building.size * 1.4), p.hp, pieceStats(p).health);
  }
}

/* Placement preview: the real piece, faded, inside its true footprint. The
   outline turns red when it can't be built; cannons also show their range. */
function drawGhost(ghost) {
  if (!ghost) return;

  const b = ghost.building;
  const fade = Math.min(1, (FX.ghostAge || 0) * 7);
  const color = ghost.valid ? INK : "#B23A2E";

  ctx.save();
  ctx.globalAlpha = fade;
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;

  if (b.range) {
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, b.range, 0, Math.PI * 2);
    ctx.globalAlpha = fade * 0.55;
    ctx.stroke();
    ctx.globalAlpha = fade;
  }

  ctx.beginPath();
  ctx.arc(ghost.x, ghost.y, b.size, 0, Math.PI * 2);
  ctx.fillStyle = ghost.valid ? "rgba(243, 235, 217, 0.5)" : "rgba(178, 58, 46, 0.25)";
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.globalAlpha = fade * 0.65;
  paintBuilding(ctx, b, ghost.x, ghost.y, b.size, STYLE.fill, Math.atan2(ghost.y - PLAYER.y, ghost.x - PLAYER.x), 1, FX.t);
  ctx.restore();
}

/* With a building's own tool selected, hovering one of those buildings shows its
   next upgrade and the price. */
function drawUpgradeHint(w, h) {
  if (placement.mouseX === null || placement.active === null) return;

  const hit = upgradeTarget(screenToWorld(placement.mouseX, placement.mouseY, w, h));
  if (!hit) return;

  let label;
  let cost = null;
  if (hit.building.design === "tent") {
    const next = TENT_TIERS[(hit.tier || 1) + 1];
    label = next ? next.name : "Nível máximo";
    cost = next ? next.cost : null;
  } else if (hit.building.design === "armory") {
    const next = COMBAT.armoryResearch.find((r) => !hasUpgrade(r.key));
    label = next ? next.name : "Tudo pesquisado";
    cost = next ? next.cost : null;
  } else if (pieceLevel(hit) === 1) {
    label = "Clique para escolher a evolução";
  } else {
    const next = nextLevelOf(hit, hit.path);
    label = next ? hit.building.paths[hit.path].name + ", nível " + (pieceLevel(hit) + 1) : "Nível máximo";
    cost = next ? next.cost : null;
  }

  const y = hit.y - hit.building.size - 18;
  if (cost === null) drawPlate(hit.x, y, label);
  else drawPlate(hit.x, y, label + " · " + cost + " de ouro", canAffordCost(cost) ? INK : "#B23A2E");
}

/* ---------- LOOP ---------- */
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.05);
  lastTime = time;

  updateCamera(dt);
  updatePower(dt);
  updateTents(dt);
  updateSoldiers(dt);
  updateFx(dt);
  updateBattle(dt);
  if (typeof netUpdate === "function") netUpdate(dt);
  refreshHud();
  placeUpgradeChoice();
  draw(time);

  requestAnimationFrame(loop);
}

/* ---------- SELECTION ---------- */
/* Which tool each button toggles (index into BUILDINGS) */
const TOOL_BUTTONS = [
  { id: "wall-button", building: 0 }, // Wall
  { id: "turret-button", building: 1 }, // Simple Turret
  { id: "generator-button", building: 2 }, // Generator
  { id: "house-button", building: 3 }, // House
  { id: "sniper-button", building: 4 }, // Sniper Turret
  { id: "armory-button", building: 5 }, // Armory (research)
  { id: "tent-button", building: 6 }, // Tent
];

/* Mode buttons toggle actionMode instead of a building tool */
const MODE_BUTTONS = [
  { id: "swap-button", mode: "swap" },
  { id: "delete-button", mode: "delete" },
];

function toggleActionMode(mode) {
  closeUpgradeChoice();
  if (actionMode === mode) {
    actionMode = null;
  } else {
    actionMode = mode;
    placement.active = null; // building tools and action modes are exclusive
    drag.active = false;
    drag.building = null;
  }
  FX.ghostAge = 0;
  updateToolButtons();
  draw();
}

function updateToolButtons() {
  for (const tool of TOOL_BUTTONS) {
    const button = document.getElementById(tool.id);
    if (!button) continue;

    const on = placement.active === tool.building;
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", String(on));
  }

  for (const tool of MODE_BUTTONS) {
    const button = document.getElementById(tool.id);
    if (!button) continue;

    const on = actionMode === tool.mode;
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", String(on));
  }
}

function selectBuilding(index) {
  closeUpgradeChoice();
  actionMode = null; // picking a building turns off swap/delete
  drag.active = false;
  drag.building = null;
  placement.active = placement.active === index ? null : index;
  FX.ghostAge = 0;
  updateToolButtons();
  draw();
}

function deselectBuilding() {
  closeUpgradeChoice();
  placement.active = null;
  actionMode = null;
  drag.active = false;
  drag.building = null;
  FX.ghostAge = 0;
  updateToolButtons();
  draw();
}

/* ---------- INPUT (WASD steer camera, 1..7 pick building, Esc clears) ---------- */
window.addEventListener("keydown", (e) => {
  // the menu's fields and browser shortcuts (Ctrl+S, ...) keep their keys
  if (!gameStarted || e.ctrlKey || e.metaKey || e.altKey) return;
  if (handleChoiceKey(e)) return; // the upgrade panel answers 1, 2 and Esc first

  const key = e.key.toLowerCase();

  if (key in MOVE_KEYS) {
    keys.add(key);
    e.preventDefault();
    return;
  }

  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= BUILDINGS.length) {
    selectBuilding(n - 1);
    e.preventDefault();
    return;
  }

  if (e.key === " ") {
    e.preventDefault(); // space = opt into PvP (drops your safe zone)
    if (typeof onSpaceForPvp === "function") onSpaceForPvp();
    return;
  }

  if (key === "h") {
    camera.tx = PLAYER.x; // back to your own island
    camera.ty = PLAYER.y;
    return;
  }

  if (e.key === "Escape") deselectBuilding();
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

window.addEventListener("blur", () => {
  keys.clear();
  drag.active = false;
  drag.building = null;
});

/* World-space position under the mouse (canvas client coords) */
function worldFromEvent(e) {
  const { w, h } = viewSize();
  const rect = canvas.getBoundingClientRect();
  return screenToWorld(e.clientX - rect.left, e.clientY - rect.top, w, h);
}

/* Building whose footprint covers a world point (pad slightly for easier hits) */
function buildingAt(worldX, worldY, exclude) {
  let hit = null;
  let best = Infinity;

  for (const p of placement.placed) {
    if (p === exclude) continue;

    const d = Math.hypot(p.x - worldX, p.y - worldY);
    const reach = p.building.size + 10;
    if (d <= reach && d < best) {
      best = d;
      hit = p;
    }
  }

  return hit;
}

/* Aim the ghost at the mouse (a building lifted in swap mode follows it too) */
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  placement.mouseX = e.clientX - rect.left;
  placement.mouseY = e.clientY - rect.top;
});

/* Swap mode: pick up a building to start the drag */
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0 || actionMode !== "swap" || isEliminated()) return;

  const world = worldFromEvent(e);
  const hit = buildingAt(world.x, world.y);
  if (hit) {
    drag.active = true;
    drag.building = hit;
  }
});

/* Exchange two buildings' spots. Each is re-resolved by its own type, so a swap
   obeys the same range and overlap rules as placing; if it can't, nothing moves. */
function swapBuildings(a, b) {
  const aPos = resolvePlacement(a.building, b.x, b.y);
  const bPos = resolvePlacement(b.building, a.x, a.y);
  const pair = [a, b];
  const fits =
    placementValid(aPos.x, aPos.y, a.building.size, pair) &&
    placementValid(bPos.x, bPos.y, b.building.size, pair) &&
    distance(aPos.x, aPos.y, bPos.x, bPos.y) > a.building.size + b.building.size;

  if (!fits) {
    denyFx("Essas construções não cabem trocadas");
    return;
  }

  Object.assign(a, { x: aPos.x, y: aPos.y, dir: aPos.dir });
  Object.assign(b, { x: bPos.x, y: bPos.y, dir: bPos.dir });
  state.lastSpendAt = performance.now();
  addShake(3.5);
  burst(a.x, a.y, STYLE.fill, 10, 120);
  burst(b.x, b.y, STYLE.fill, 10, 120);
  if (typeof unlockAchievement === "function") unlockAchievement("flexible");
}

/* Swap mode: drop the building. Listens on the window so letting go over the
   HUD or outside the page still ends the drag. */
window.addEventListener("mouseup", (e) => {
  if (e.button !== 0 || !drag.active) return;

  const lifted = drag.building;
  const world = worldFromEvent(e);
  const target = buildingAt(world.x, world.y, lifted);
  drag.active = false;
  drag.building = null;

  if (target && placement.placed.includes(lifted)) swapBuildings(lifted, target);
  draw();
});

/* Left-click: place a building, delete one, or order the soldiers to move */
canvas.addEventListener("click", (e) => {
  const { w, h } = viewSize();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  if (isEliminated()) return; // base destroyed: no more orders
  if (closeUpgradeChoice()) return; // a click outside the panel just closes it

  if (placement.active !== null) {
    // A building's own tool, clicked on one of those buildings, upgrades it.
    const target = upgradeTarget(screenToWorld(sx, sy, w, h));
    if (target && target.building.design === "tent") upgradeTent(target);
    else if (target && target.building.design === "armory") researchArmory(target);
    else if (target) upgradePiece(target);
    else placeBuilding(sx, sy, w, h);
  } else if (actionMode === "delete") {
    const world = screenToWorld(sx, sy, w, h);
    const hit = buildingAt(world.x, world.y);
    if (hit) {
      placement.placed = placement.placed.filter((p) => p !== hit);
      state.power += Math.floor((hit.invested || hit.building.cost) * COMBAT.refundRate);
      state.lastSpendAt = performance.now();
      refreshPowerUI();
      burst(hit.x, hit.y, INK, 10, 90);
      addShake(1.5);
    }
  } else if (actionMode === "swap") {
    // handled by the drag handlers
  } else {
    const world = screenToWorld(sx, sy, w, h);
    commandSoldiers(world.x, world.y);
  }

  draw();
});

/* Toolbar icons use the same drawing as the piece itself, so they recolor with
   the flag and always show exactly what gets built. */
function paintToolIcons() {
  for (const tool of TOOL_BUTTONS) {
    const icon = document.querySelector("#" + tool.id + " canvas");
    if (!icon) continue;

    const building = BUILDINGS[tool.building];
    const g = icon.getContext("2d");
    const box = icon.width / 2;
    const scale = box / (building.design === "sniper" ? 58 : 44);
    g.setTransform(scale, 0, 0, scale, box, box);
    g.clearRect(-box / scale, -box / scale, (box * 2) / scale, (box * 2) / scale);
    const shift = building.design === "sniper" ? -10 : 0;
    paintBuilding(g, building, shift, 0, building.size, STYLE.fill, building.design === "house" ? 0 : -0.5, 2, 0.5);
  }
}

function initToolButtons() {
  for (const tool of TOOL_BUTTONS) {
    const button = document.getElementById(tool.id);
    if (!button) continue;

    const building = BUILDINGS[tool.building];
    const stats = [building.cost + " de ouro", (building.health || 0) + " de vida"];
    if (building.range) stats.push(building.range + " de alcance");
    if (building.limit) stats.push("máximo " + building.limit);
    button.querySelector(".tool-cost").textContent = building.cost;
    button.querySelector(".tool-name").textContent = building.name;
    const paths = building.paths;
    button.querySelector(".tool-desc").textContent =
      building.desc + (paths ? " Evolui como " + paths.A.name + " ou " + paths.B.name + "." : "");
    button.querySelector(".tool-stats").textContent = stats.join(" · ");
    button.setAttribute("aria-label", building.name + ", " + stats.join(", "));
    button.addEventListener("click", () => selectBuilding(tool.building));
  }

  for (const tool of MODE_BUTTONS) {
    const button = document.getElementById(tool.id);
    if (button) button.addEventListener("click", () => toggleActionMode(tool.mode));
  }

  paintToolIcons();
}

/* ---------- PLAYER PROFILE + START MENU ---------- */
/* Filled in by the menu; the name shows on the leaderboard and the color
   replaces every red part of your units (base, buildings, soldiers). */
const PROFILE = {
  name: "Capitão",
  color: STYLE.fill,
  tag: null, // id of the earned achievement shown under the base name
};

let gameStarted = false;

/* Everything in the player's color reads STYLE.fill when it is drawn, so this
   single change recolors the island, the pieces, the boats and the HUD. */
function setPlayerColor(hex) {
  PROFILE.color = hex;
  STYLE.fill = hex;
  document.documentElement.style.setProperty("--player-color", hex);
  paintToolIcons();
}

/* Back to a clean slate; the previous match's pieces never carry over. */
function resetMatch() {
  state.power = POWER.start;
  state.playerHp = COMBAT.player.health;
  state.upgrades = 0;
  state.kills = 0;
  state.orderedFleet = false;
  state.lastSpendAt = -Infinity;

  closeUpgradeChoice();
  placement.placed = [];
  placement.active = null;
  soldiers.length = 0;
  actionMode = null;
  drag.active = false;
  drag.building = null;

  for (const list of [FX.wake, FX.orders, FX.bursts]) list.length = 0;
  FX.shake = 0;
  resetBattle();

  net.dead = false;
  net.mySafe = true;
  net.myPvp = false;
  net.players = new Map();
  document.getElementById("toasts").textContent = "";

  updateToolButtons();
  refreshPowerUI();
  refreshIslandHealth();
}

function setPlayButton(busy) {
  const play = document.getElementById("menu-play");
  play.disabled = busy;
  play.textContent = busy ? "Conectando..." : "Zarpar";
}

function hideEndScreen() {
  document.getElementById("eliminated").classList.remove("show");
}

function enterMatch() {
  gameStarted = true;
  hideEndScreen();
  document.getElementById("menu").classList.add("hidden");
  setPlayButton(false);
}

const SERVER_DOWN = "Não foi possível falar com o servidor. Tente de novo em instantes.";

/* The menu stays up until the server has welcomed the player. */
function startGame() {
  if (gameStarted || document.getElementById("menu-play").disabled) return;

  PROFILE.name = document.getElementById("menu-name").value.trim() || "Capitão";
  PROFILE.tag = document.getElementById("menu-tag").value || null;
  setPlayerColor(document.getElementById("menu-color").value);

  document.getElementById("menu-status").textContent = "";
  setPlayButton(true);
  joinMatch(enterMatch, () => {
    setPlayButton(false);
    document.getElementById("menu-status").textContent = SERVER_DOWN;
  });
}

function showEndScreen(title, text) {
  document.getElementById("eliminated-title").textContent = title;
  document.getElementById("eliminated-sub").textContent = text;
  document.getElementById("end-again").disabled = false;
  document.getElementById("end-again").textContent = "Zarpar de novo";
  document.getElementById("eliminated").classList.add("show");
  document.getElementById("end-again").focus();
}

function playAgain() {
  const again = document.getElementById("end-again");
  again.disabled = true;
  again.textContent = "Conectando...";
  joinMatch(enterMatch, () => {
    again.disabled = false;
    again.textContent = "Tentar de novo";
    document.getElementById("eliminated-sub").textContent = SERVER_DOWN;
  });
}

function backToMenu() {
  closeConnection();
  net.online = false;
  gameStarted = false;
  resetMatch();
  hideEndScreen();
  populateTagMenu(); // conquests from the last match can be worn now
  document.getElementById("menu").classList.remove("hidden");
}

function bindEndScreen() {
  document.getElementById("end-again").addEventListener("click", playAgain);
  document.getElementById("end-menu").addEventListener("click", backToMenu);
}

/* Share the link: with no bots, a friend is how a match gets started. */
function bindInvite() {
  document.getElementById("invite").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      showToast("Link copiado: envie para um amigo", "good");
    } catch {
      showToast("Envie este link: " + location.href);
    }
  });
}

/* Flag colors are a fixed set, all chosen to stay readable on the paper chart. */
const FLAG_COLORS = ["#C8553D", "#2E6F8E", "#3F7D4E", "#C48A1A", "#7A4E9E", "#1F8A8A", "#A93F6B", "#54606B"];

function bindFlagPicker() {
  const picker = document.getElementById("menu-flags");
  const input = document.getElementById("menu-color");

  FLAG_COLORS.forEach((color, i) => {
    const flag = document.createElement("button");
    flag.type = "button";
    flag.className = "flag";
    flag.style.setProperty("--flag", color);
    flag.setAttribute("aria-label", "Bandeira " + (i + 1));
    flag.setAttribute("aria-pressed", String(i === 0));
    flag.addEventListener("click", () => {
      input.value = color;
      for (const other of picker.children) other.setAttribute("aria-pressed", String(other === flag));
    });
    picker.appendChild(flag);
  });
}

function bindMenu() {
  const play = document.getElementById("menu-play");
  const nameInput = document.getElementById("menu-name");

  bindFlagPicker();
  bindEndScreen();
  bindInvite();
  if (play) play.addEventListener("click", startGame);
  if (nameInput) {
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") startGame();
    });
  }
}

/* ---------- BOOT ---------- */
window.addEventListener("resize", resize);
if (document.fonts) document.fonts.ready.then(buildChart); // redraw labels in their real font

window.addEventListener("DOMContentLoaded", () => {
  buildChart();
  resize();
  refreshIslandHealth();
  initToolButtons();
  refreshPowerUI();
  bindMenu();
  requestAnimationFrame(loop);
});
