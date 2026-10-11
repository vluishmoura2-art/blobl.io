"use strict";

/* =========================================================
   Blobl.io - map + camera + Bloble.io building placement

   Scene:
     - A large map with a white background and black border
     - Gray grid tiled across the map
     - Gray circular "area" border around the play field
     - A red base circle (radius = Bloble startSize)
     - Buildings placed freely in polar coordinates around the base,
       using the rules recovered from Bloble.io's js/game.js

   Rules honored:
     - The player/base does NOT move (fixed in world space)
     - Only the camera moves (WASD steers it)

   Placement (ported from Bloble.io js/game.js `updateGameLoop` / `sendUnit`):
     Bloble sends a building as polar coords around the base:
         socket.emit("1", angle, distance, buildingIndex)
     The client resolves the final spot from the mouse direction and clamps
     the distance by the building's `type`:
       type 0 (Turret/Generator/House/Sniper/Armory):
           distance clamped to [startSize + size, buildRange - size - 0.15]
       type 2 (Barracks):
           distance forced to buildRange + size
       type 3 (Wall):
           distance clamped to [startSize + size, buildRange + size]
     Collision (types 0/2/3): reject when size_a + size_b >= centerDistance
     (i.e. it overlaps another of your buildings). Mobile units (type 1) never
     block placement. Valid spot = gray ghost, overlap = red ghost.

   startSize and buildRange are server-side values (not present in the client
   source). 100 / 275 are inferred from the popular auto-build scripts, which
   sit on the boundary radii: Barracks at buildRange + 34 = 309, turret ring at
   buildRange - 29.15 = 245.85. Adjust PLACE below if better data appears.
   ========================================================= */

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

/* ---------- STYLE (map / base design) ---------- */
const STYLE = {
  background: "#ffffff",

  grid: {
    size: 50, // spacing between grid lines
    color: "#dde3ec", // soft, light grid so it doesn't fight the action
    lineWidth: 0.8,
  },

  area: {
    margin: 48, // gap between the arena edge and the canvas edge
    border: "#6b788c",
    borderWidth: 6,
  },

  circle: {
    fill: "#e03b3b",
    border: "#ff5a5a",
    borderWidth: 8,
  },
};

/* ---------- PLACEMENT RULES (Bloble.io units) ---------- */
const PLACE = {
  startSize: 100, // base radius (server value; inferred)
  buildRange: 275, // max build distance from base (server value; inferred)
  epsilon: 0.15, // exact fudge factor used by game.js
  gap: 8, // fixed breathing room so orbitals don't kiss the base rim

  validFill: "rgba(120, 128, 140, 0.26)", // gray ghost (placeable)
  invalidFill: "rgba(255, 0, 0, 0.12)", // red ghost (overlap)
  indicator: "rgba(0, 0, 0, 0.08)", // build-limit ring color (indicatorColor)
  dashed: [55, 12], // dash pattern used by Bloble for its rings
};

/* Turret barrel length, as a multiple of the body radius */
const BARREL = {
  simple: 1.1,
  sniper: 1.45, // "slightly longer barrel"
};

/* Building definitions (sizes/types from Bloble.io js/shareData.js).
   Index order matches Bloble's number keys 1..7. */
const BUILDINGS = [
  { name: "Wall", type: 3, size: 30, cost: 20 },
  { name: "Simple Turret", type: 0, size: 29, range: 180, cost: 25, design: "turret", barrel: BARREL.simple },
  { name: "Generator", type: 0, size: 32, cost: 50, design: "generator" },
  { name: "House", type: 0, size: 30, cost: 60, design: "house" },
  { name: "Sniper Turret", type: 0, size: 32, range: 240, cost: 80, design: "turret", barrel: BARREL.sniper },
  { name: "Armory", type: 0, size: 40, cost: 100 },
  { name: "Tent", type: 2, size: 34, cost: 150, design: "tent" },
];

/* Combat stats live in shared/combat.js so the server sees the same numbers.
   Merge health/damage/range into each building definition. */
if (typeof COMBAT !== "undefined" && Array.isArray(COMBAT.buildingStats)) {
  for (let i = 0; i < BUILDINGS.length; i++) {
    const stat = COMBAT.buildingStats[i];
    if (!stat) continue;
    if (stat.health !== undefined) BUILDINGS[i].health = stat.health;
    if (stat.damage !== undefined) BUILDINGS[i].damage = stat.damage;
    if (stat.range !== undefined) BUILDINGS[i].range = stat.range;
  }
}

/* Placed-building look (unchanged wall design: red bg, gray border) */
const BUILD_STYLE = {
  fill: "#e03b3b",
  border: "#6b788c",
  borderWidth: 3,
};

/* Turret pipe (barrel) color - Bloble's turretColor */
const PIPE = { color: "#A8A8A8" };

/* ---------- POWER / COST SYSTEM ---------- */
const POWER = {
  start: 200, // starting power
  perGenerator: 1, // power per second, for each placed generator (Bloble pts)
};

const state = {
  power: POWER.start,
  playerHp: typeof COMBAT !== "undefined" ? COMBAT.player.health : 500,
};

const placement = {
  active: null, // index into BUILDINGS, or null when nothing is selected
  mouseX: null, // mouse position relative to the canvas (screen space)
  mouseY: null,
  placed: [], // { building, x, y } in world coords
};

/* ---------- SOLDIERS (produced by tents, moved by left-click) ---------- */
const SOLDIER = {
  size: 18, // Bloble Soldier size
  borderWidth: 2,
  speed: 150, // world units per second
  interval: 3.5, // seconds between spawns, per tent (Bloble barracks reload)
  baseLimit: 3, // how many soldiers you may field with 0 houses
  perHouse: 2, // each house raises the soldier limit by this much
  spread: 18, // target jitter, so soldiers don't stack into one triangle
};

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

/* Swap-mode drag state: the building lifted under the cursor */
const drag = { active: false, building: null };

/* ---------- MAP (large world) ---------- */
const MAP = {
  width: 3000,
  height: 3000,
  background: "#ffffff",
  border: "#000000",
  borderWidth: 12,
};

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
    camera.x += (dx / len) * CAMERA.speed * dt;
    camera.y += (dy / len) * CAMERA.speed * dt;
  }

  camera.x = clamp(camera.x, 0, MAP.width);
  camera.y = clamp(camera.y, 0, MAP.height);
}

/* ---------- PLACEMENT MATH (faithful to game.js) ---------- */

/* Resolve the final build spot: free angle, distance clamped by type. */
function resolvePlacement(building, worldX, worldY) {
  const dx = worldX - PLAYER.x;
  const dy = worldY - PLAYER.y;
  const dir = Math.atan2(dy, dx);
  let dist = Math.hypot(dx, dy);

  const { startSize, buildRange, epsilon, gap } = PLACE;

  if (building.type === 0) {
    if (dist - building.size < startSize + gap) {
      dist = building.size + startSize + gap;
    } else if (dist + building.size > buildRange - epsilon) {
      dist = buildRange - building.size - epsilon;
    }
  } else if (building.type === 2) {
    dist = building.size + buildRange;
  } else if (building.type === 3) {
    if (dist - building.size < startSize + gap) {
      dist = building.size + startSize + gap;
    } else if (dist + building.size > buildRange + 2 * building.size) {
      dist = buildRange + building.size;
    }
  }

  return {
    x: PLAYER.x + dist * Math.cos(dir),
    y: PLAYER.y + dist * Math.sin(dir),
    dir,
    dist,
  };
}

/* Overlap test: any own building (type != 1) whose circles intersect blocks it. */
function placementValid(x, y, size) {
  for (const p of placement.placed) {
    if (p.building.type === 1) continue; // mobile units never block
    if (size + p.building.size >= distance(x, y, p.x, p.y)) return false;
  }
  return true;
}

/* The ghost the player is currently aiming (or null). The aim point is eased
   each frame (see updateFx), so the preview trails the cursor elastically. */
function currentGhost(w, h) {
  if (placement.active === null || placement.mouseX === null) return null;

  const building = BUILDINGS[placement.active];
  const world =
    FX.aim && FX.aim.x != null ? FX.aim : screenToWorld(placement.mouseX, placement.mouseY, w, h);
  const pos = resolvePlacement(building, world.x, world.y);

  return {
    building,
    x: pos.x,
    y: pos.y,
    valid: placementValid(pos.x, pos.y, building.size) && canAfford(building),
  };
}

/* Place the active building at the resolved (clamped, collision-checked) spot. */
function placeBuilding(screenX, screenY, w, h) {
  if (placement.active === null) return;

  const building = BUILDINGS[placement.active];
  if (!canAfford(building)) return;

  const world = screenToWorld(screenX, screenY, w, h);
  const pos = resolvePlacement(building, world.x, world.y);

  if (!placementValid(pos.x, pos.y, building.size)) return;

  placement.placed.push({
    building,
    x: pos.x,
    y: pos.y,
    dir: pos.dir,
    uid: nextUid(),
    hp: building.health,
  });
  state.power -= building.cost;
  refreshPowerUI();
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
}

/* Each generator adds POWER.perGenerator power per second */
function updatePower(dt) {
  const gens = countGenerators();
  if (gens === 0) return;

  state.power += gens * POWER.perGenerator * dt;
  refreshPowerUI();
}

/* ---------- SOLDIERS ---------- */
/* Houses raise how many soldiers you can field: 3 with none, +2 each after. */
function countHouses() {
  let n = 0;
  for (const p of placement.placed) if (p.building.design === "house") n++;
  return n;
}

function soldierLimit() {
  return SOLDIER.baseLimit + SOLDIER.perHouse * countHouses();
}

function spawnSoldier(tent) {
  const dx = PLAYER.x - tent.x;
  const dy = PLAYER.y - tent.y;
  const len = Math.hypot(dx, dy) || 1;
  const dist = tent.building.size + SOLDIER.size + 4; // just outside the tent

  soldiers.push({
    x: tent.x + (dx / len) * dist,
    y: tent.y + (dy / len) * dist,
    dir: Math.atan2(dy, dx), // face toward the base
    tx: null,
    ty: null,
    origin: tent,
    ox: (Math.random() * 2 - 1) * SOLDIER.spread,
    oy: (Math.random() * 2 - 1) * SOLDIER.spread,
    uid: nextUid(),
    hp: COMBAT.soldier.health,
  });
}

/* Tents produce soldiers over time, until the house-driven limit is reached */
function updateTents(dt) {
  for (const p of placement.placed) {
    if (p.building.design !== "tent") continue;

    p.spawnTimer = (p.spawnTimer || 0) + dt;
    while (p.spawnTimer >= SOLDIER.interval) {
      p.spawnTimer -= SOLDIER.interval;
      if (soldiers.length < soldierLimit()) spawnSoldier(p);
    }
  }
}

/* Soldiers walk toward their target (or stand still when tx is null) */
function updateSoldiers(dt) {
  for (const s of soldiers) {
    if (s.tx === null) continue;

    const dx = s.tx - s.x;
    const dy = s.ty - s.y;
    const d = Math.hypot(dx, dy);

    if (d <= 0.5) {
      s.tx = null;
      s.ty = null;
      continue;
    }

    s.dir = Math.atan2(dy, dx);
    const step = Math.min(SOLDIER.speed * dt, d);
    s.x += Math.cos(s.dir) * step;
    s.y += Math.sin(s.dir) * step;

    if (step >= d) {
      s.tx = null;
      s.ty = null;
    }
  }
}

/* Left-click order: send every soldier to the clicked world point */
function commandSoldiers(worldX, worldY) {
  for (const s of soldiers) {
    s.tx = worldX + s.ox;
    s.ty = worldY + s.oy;
  }
}

/* Soldier: triangle (apex points along `dir`) with a gray border.
   `fill` is overridable so each player's units use their own color. */
function paintSoldier(g, cx, cy, size, dir, fill) {
  g.save();
  g.translate(cx, cy);
  g.rotate(dir + Math.PI / 2);

  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * ((Math.PI * 2) / 3);
    const px = Math.cos(a) * size;
    const py = Math.sin(a) * size;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();

  g.fillStyle = fill || BUILD_STYLE.fill;
  g.fill();
  g.lineWidth = SOLDIER.borderWidth;
  g.strokeStyle = BUILD_STYLE.border;
  g.stroke();

  g.restore();
}

function drawSoldiers() {
  for (const s of soldiers) {
    paintSoldier(ctx, s.x, s.y, SOLDIER.size, s.dir);
    if (s.hp !== undefined) {
      drawObjectHp(s.x, s.y - SOLDIER.size - 8, SOLDIER.size * 1.6, s.hp, COMBAT.soldier.health);
    }
  }
}

/* ---------- HEALTH BARS ---------- */
/* Small bar centered above an object; green while healthy, red when low.
   Drawn only while the object is damaged (hp < max). */
function drawObjectHp(x, y, w, hp, max) {
  if (!(max > 0) || hp >= max) return;

  const h = 5;
  const x0 = x - w / 2;
  const frac = Math.max(0, Math.min(1, hp / max));

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(x0, y, w, h);
  ctx.fillStyle = frac > 0.35 ? "#2fcf4f" : "#e03939";
  ctx.fillRect(x0, y, w * frac, h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
  ctx.strokeRect(x0, y, w, h);
}

/* ---------- AMBIENCE (background effects) ---------- */
/* Floating bubbles + a slowly drifting gradient so the arena doesn't read as
   a flat white form. Everything is clipped to the map and very subtle. */
const FX = {
  particles: [],
  trail: [], // wake particles streaming off the base while the camera moves
  aim: null, // spring-eased aim point for the placement ghost
  t: 0,
  prevCamX: null,
  prevCamY: null,
};

function colorWithAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

function spawnParticle() {
  return {
    fx: Math.random(),
    r: 2 + Math.random() * 6,
    speed: 7 + Math.random() * 12,
    wobble: 0.5 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.05 + Math.random() * 0.11,
  };
}

function ensureParticles(w, h) {
  const target = Math.round(w * h / 52000) + 6;
  while (FX.particles.length < target) FX.particles.push(spawnParticle());
  if (FX.particles.length > target) FX.particles.length = target;
}

function drawAmbience(time, w, h) {
  const t = time / 1000;
  FX.t = t;
  ensureParticles(w, h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, MAP.width, MAP.height);
  ctx.clip();

  // gently drifting gradient overlay (cool tint, very low opacity)
  const sx = w / 2 + Math.cos(t * 0.12) * w * 0.3;
  const sy = h / 2 + Math.sin(t * 0.09) * h * 0.28;
  const gx = camera.x + (sx - w / 2);
  const gy = camera.y + (sy - h / 2);
  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 0.85);
  grad.addColorStop(0, "rgba(186, 208, 240, 0.18)");
  grad.addColorStop(0.6, "rgba(224, 234, 248, 0.07)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(camera.x - w / 2, camera.y - h / 2, w, h);

  // floating bubbles drifting up, looping forever
  for (const p of FX.particles) {
    const py = h + 24 - ((t * p.speed + p.phase * 40) % (h + 48));
    const px = p.fx * w + Math.sin(t * p.wobble + p.phase * 2.3) * 14;
    ctx.beginPath();
    ctx.arc(camera.x + (px - w / 2), camera.y + (py - h / 2), p.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(130, 150, 178, " + p.alpha.toFixed(3) + ")";
    ctx.fill();
  }

  // wake particles trailing behind the moving core
  for (const p of FX.trail) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = colorWithAlpha(BUILD_STYLE.fill, Math.max(0, p.life) * 0.26);
    ctx.fill();
  }

  ctx.restore();
}

/* ---------- GAME FEEL (elastic aim + wake + crosshair) ---------- */

/* Springs the placement ghost toward the cursor and emits wake particles
   streaming off the base rim while the camera moves (the fixed base appears
   to glide through the world). */
function updateFx(dt) {
  const { w, h } = viewSize();

  if (placement.mouseX !== null) {
    const m = screenToWorld(placement.mouseX, placement.mouseY, w, h);
    if (!FX.aim) FX.aim = { x: m.x, y: m.y };
    const ease = 1 - Math.pow(0.001, dt); // ~14/s spring
    FX.aim.x += (m.x - FX.aim.x) * ease;
    FX.aim.y += (m.y - FX.aim.y) * ease;
  }

  if (FX.prevCamX === null) {
    FX.prevCamX = camera.x;
    FX.prevCamY = camera.y;
    return;
  }

  const vx = camera.x - FX.prevCamX;
  const vy = camera.y - FX.prevCamY;
  FX.prevCamX = camera.x;
  FX.prevCamY = camera.y;

  const vmag = Math.hypot(vx, vy);
  if (vmag > 6) {
    const wake = Math.atan2(vy, vx); // the base's "back" faces the camera motion
    const n = Math.min(3, 1 + Math.floor(vmag / 9));
    for (let i = 0; i < n; i++) {
      FX.trail.push({
        x: PLAYER.x + Math.cos(wake) * (PLACE.startSize + 10) + (Math.random() - 0.5) * 16,
        y: PLAYER.y + Math.sin(wake) * (PLACE.startSize + 10) + (Math.random() - 0.5) * 16,
        vx: Math.cos(wake) * (16 + Math.random() * 30) + (Math.random() - 0.5) * 22,
        vy: Math.sin(wake) * (16 + Math.random() * 30) + (Math.random() - 0.5) * 22,
        r: 1.5 + Math.random() * 2.5,
        life: 1,
        fade: 2.4 + Math.random() * 1.6,
      });
    }
  }

  for (let i = FX.trail.length - 1; i >= 0; i--) {
    const p = FX.trail[i];
    p.life -= dt * p.fade;
    if (p.life <= 0) {
      FX.trail.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  if (FX.trail.length > 120) FX.trail.splice(0, FX.trail.length - 120);
}

/* True when the crosshair sits on an attackable target: an enemy base, soldier
   or building (from the relay), or one of our own buildings in delete mode. */
function crosshairHot(worldX, worldY) {
  if (actionMode === "delete" && buildingAt(worldX, worldY)) return true;

  if (typeof net === "object" && net && net.players instanceof Map) {
    for (const rp of net.players.values()) {
      if (rp.id === net.id) continue;

      if (Math.hypot(rp.x - worldX, rp.y - worldY) <= PLACE.startSize + 6) return true;
      if (Array.isArray(rp.soldiers)) {
        for (const s of rp.soldiers) {
          if (Math.hypot(s.x - worldX, s.y - worldY) <= SOLDIER.size + 6) return true;
        }
      }
      if (Array.isArray(rp.buildings)) {
        for (const b of rp.buildings) {
          const bd = BUILDINGS[b.b];
          if (bd && Math.hypot(b.x - worldX, b.y - worldY) <= (bd.size || 20) + 6) return true;
        }
      }
    }
  }
  return false;
}

/* Stylized reticle at the cursor: thin ring, diagonal ticks and a glowing
   center dot. Turns red when it's over an enemy or a delete target. */
function drawCrosshair(w, h) {
  if (placement.mouseX === null) return;

  const world = screenToWorld(placement.mouseX, placement.mouseY, w, h);
  const hot = crosshairHot(world.x, world.y);
  const rgb = hot ? "255, 84, 84" : "236, 241, 249";
  const ringR = 9;

  ctx.save();
  ctx.strokeStyle = "rgba(" + rgb + ", 0.9)";
  ctx.shadowColor = "rgba(" + rgb + ", 0.9)";
  ctx.shadowBlur = hot ? 10 : 5;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.arc(world.x, world.y, ringR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 1.5;
  const t0 = ringR + 1;
  const t1 = ringR + 7;
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(world.x + Math.cos(a) * t0, world.y + Math.sin(a) * t0);
    ctx.lineTo(world.x + Math.cos(a) * t1, world.y + Math.sin(a) * t1);
    ctx.stroke();
  }

  ctx.fillStyle = hot ? "rgba(255, 96, 96, 0.95)" : "rgba(244, 248, 252, 0.95)";
  ctx.beginPath();
  ctx.arc(world.x, world.y, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ---------- DRAW ---------- */
function draw(time = performance.now()) {
  const dpr = window.devicePixelRatio || 1;
  const { w, h } = viewSize();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Canvas backdrop
  ctx.fillStyle = STYLE.background;
  ctx.fillRect(0, 0, w, h);

  const ghost = currentGhost(w, h);

  // World space: everything below is drawn relative to the camera
  ctx.save();
  ctx.translate(w / 2 - camera.x, h / 2 - camera.y);

  drawMap();
  drawGrid();
  drawAmbience(time, w, h);
  if (typeof drawRemotePlayers === "function") drawRemotePlayers();
  drawArea(w, h);
  drawRangeIndicators();
  drawBase();
  drawBuildings();
  drawSoldiers();
  drawGhost(ghost);
  drawCrosshair(w, h);

  ctx.restore();
}

/* Large map: white background + black border */
function drawMap() {
  ctx.fillStyle = MAP.background;
  ctx.fillRect(0, 0, MAP.width, MAP.height);

  ctx.lineWidth = MAP.borderWidth;
  ctx.strokeStyle = MAP.border;
  ctx.strokeRect(0, 0, MAP.width, MAP.height);
}

/* Gray grid tiled across the map */
function drawGrid() {
  const { size, color, lineWidth } = STYLE.grid;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, MAP.width, MAP.height);
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  for (let x = 0; x <= MAP.width; x += size) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, MAP.height);
  }
  for (let y = 0; y <= MAP.height; y += size) {
    ctx.moveTo(0, y);
    ctx.lineTo(MAP.width, y);
  }
  ctx.stroke();

  ctx.restore();
}

/* Gray circular "area" border around the play field (soft pulsing glow) */
function drawArea(w, h) {
  const { margin, border, borderWidth } = STYLE.area;
  const r = Math.min(w, h) / 2 - margin;
  const pulse = 0.5 + 0.5 * Math.sin(FX.t * 1.1);

  ctx.beginPath();
  ctx.arc(PLAYER.x, PLAYER.y, r, 0, Math.PI * 2);
  ctx.save();
  ctx.shadowColor = border;
  ctx.shadowBlur = 10 + 6 * pulse;
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.restore();
}

/* Bloble-style dotted rings: base edge (startSize) + build limit (buildRange) */
function drawRangeIndicators() {
  ctx.save();
  ctx.setLineDash(PLACE.dashed);
  ctx.lineWidth = 2;
  ctx.strokeStyle = PLACE.indicator;

  ctx.beginPath();
  ctx.arc(PLAYER.x, PLAYER.y, PLACE.buildRange, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(PLAYER.x, PLAYER.y, PLACE.startSize, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/* Red base circle (radius = Bloble startSize) with a soft pulsing aura */
function drawBase() {
  const { fill, border, borderWidth } = STYLE.circle;
  const t = FX.t; // seconds, shared with the ambience pass
  const pulse = 0.5 + 0.5 * Math.sin(t * 2);

  // glowing aura behind the base
  const glowR = PLACE.startSize * 1.5 + 12 * pulse;
  const aura = ctx.createRadialGradient(PLAYER.x, PLAYER.y, PLACE.startSize * 0.55, PLAYER.x, PLAYER.y, glowR);
  aura.addColorStop(0, colorWithAlpha(fill, 0.22 + 0.08 * pulse));
  aura.addColorStop(1, colorWithAlpha(fill, 0));
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(PLAYER.x, PLAYER.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  // the circle itself, with a soft outer glow that breathes
  ctx.save();
  ctx.shadowColor = fill;
  ctx.shadowBlur = 16 + 8 * pulse;
  ctx.beginPath();
  ctx.arc(PLAYER.x, PLAYER.y, PLACE.startSize, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = border;
  ctx.stroke();
  ctx.restore();

  if (state.playerHp !== undefined) {
    drawObjectHp(PLAYER.x, PLAYER.y - PLACE.startSize - 12, PLACE.startSize * 1.8, state.playerHp, COMBAT.player.health);
  }
}

/* Turret: colored body circle + gray pipe (barrel) pointing outward.
   `barrel` is the pipe length as a multiple of the body radius.
   `fill` is overridable (per-player color in multiplayer). */
function paintTurret(g, cx, cy, size, dir, barrel, fill) {
  // Body circle (same design as a wall)
  g.beginPath();
  g.arc(cx, cy, size, 0, Math.PI * 2);
  g.fillStyle = fill || BUILD_STYLE.fill;
  g.fill();
  g.lineWidth = BUILD_STYLE.borderWidth;
  g.strokeStyle = BUILD_STYLE.border;
  g.stroke();

  // Pipe + hub, aimed along `dir`
  g.save();
  g.translate(cx, cy);
  g.rotate(dir);

  const len = size * (barrel || BARREL.simple); // pipe reaches just past the body edge
  const w = size * 0.5;

  g.fillStyle = PIPE.color;
  g.strokeStyle = BUILD_STYLE.border;
  g.lineWidth = BUILD_STYLE.borderWidth;

  g.beginPath();
  g.rect(0, -w / 2, len, w);
  g.fill();
  g.stroke();

  g.beginPath();
  g.arc(0, 0, size * 0.4, 0, Math.PI * 2);
  g.fillStyle = PIPE.color;
  g.fill();
  g.stroke();

  g.restore();
}

/* Regular polygon (Bloble's renderAgon: first vertex points right) */
function paintAgon(g, cx, cy, radius, sides, fill, border, lineWidth) {
  const step = (Math.PI * 2) / sides;

  g.beginPath();
  g.moveTo(cx + radius, cy);
  for (let i = 1; i < sides; i++) {
    const a = step * i;
    g.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
  }
  g.closePath();

  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (border) {
    g.lineWidth = lineWidth;
    g.strokeStyle = border;
    g.stroke();
  }
}

/* Polygon building: colored body + gray border, with an inner gray shape.
   `fill` is overridable (per-player color in multiplayer). `rotate` turns the
   whole shape so a vertex follows the radius (orbital alignment). */
function paintAgonBuilding(g, cx, cy, size, sides, fill, rotate) {
  g.save();
  if (rotate) {
    g.translate(cx, cy);
    g.rotate(rotate);
    g.translate(-cx, -cy);
  }
  paintAgon(g, cx, cy, size, sides, fill || BUILD_STYLE.fill, BUILD_STYLE.border, BUILD_STYLE.borderWidth);
  paintAgon(g, cx, cy, size * 0.55, sides, PIPE.color, BUILD_STYLE.border, BUILD_STYLE.borderWidth);
  g.restore();
}

/* Generator: colored hexagon with an inner gray hexagon */
function paintGenerator(g, cx, cy, size, fill, rotate) {
  paintAgonBuilding(g, cx, cy, size, 6, fill, rotate);
}

/* House: same design as the generator, but a pentagon */
function paintHouse(g, cx, cy, size, fill, rotate) {
  paintAgonBuilding(g, cx, cy, size, 5, fill, rotate);
}

/* Square centered on (cx, cy); `half` is the half-width (Bloble's size) */
function paintSquare(g, cx, cy, half, fill, border, lineWidth) {
  g.beginPath();
  g.rect(cx - half, cy - half, half * 2, half * 2);

  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (border) {
    g.lineWidth = lineWidth;
    g.strokeStyle = border;
    g.stroke();
  }
}

/* Tent: colored square with an inner gray square (Bloble barracks detail) */
function paintTent(g, cx, cy, size, fill, rotate) {
  g.save();
  if (rotate) {
    g.translate(cx, cy);
    g.rotate(rotate);
    g.translate(-cx, -cy);
  }
  paintSquare(g, cx, cy, size, fill || BUILD_STYLE.fill, BUILD_STYLE.border, BUILD_STYLE.borderWidth);
  paintSquare(g, cx, cy, size * 0.55, PIPE.color, BUILD_STYLE.border, BUILD_STYLE.borderWidth);
  g.restore();
}

/* Radial angle from the base center to a building, so every orbital follows
   the radius (recomputed live, so swaps keep them radially aligned) */
function buildingDir(p) {
  return Math.atan2(p.y - PLAYER.y, p.x - PLAYER.x);
}

/* Placed buildings: walls are plain circles, turrets get the pipe.
   A faint rod links each orbital to the base so they read as coupled modules. */
function drawBuildings() {
  // orbital connector rods: base rim -> building center
  const rodColor = colorWithAlpha(BUILD_STYLE.fill, 0.1);
  const rimX = (a) => PLAYER.x + Math.cos(a) * (PLACE.startSize + 3);
  const rimY = (a) => PLAYER.y + Math.sin(a) * (PLACE.startSize + 3);
  ctx.lineWidth = 2;
  for (const p of placement.placed) {
    const a = buildingDir(p);
    ctx.beginPath();
    ctx.moveTo(rimX(a), rimY(a));
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = rodColor;
    ctx.stroke();
  }

  for (const p of placement.placed) {
    const dir = buildingDir(p);
    if (p.building.design === "turret") {
      paintTurret(ctx, p.x, p.y, p.building.size, dir, p.building.barrel);
    } else if (p.building.design === "generator") {
      paintGenerator(ctx, p.x, p.y, p.building.size, undefined, dir);
    } else if (p.building.design === "tent") {
      paintTent(ctx, p.x, p.y, p.building.size, undefined, dir);
    } else if (p.building.design === "house") {
      paintHouse(ctx, p.x, p.y, p.building.size, undefined, dir);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.building.size, 0, Math.PI * 2);
      ctx.fillStyle = BUILD_STYLE.fill;
      ctx.fill();
      ctx.lineWidth = BUILD_STYLE.borderWidth;
      ctx.strokeStyle = BUILD_STYLE.border;
      ctx.stroke();
    }

    if (p.building.health && p.hp !== undefined) {
      drawObjectHp(p.x, p.y - p.building.size - 8, Math.max(28, p.building.size * 1.4), p.hp, p.building.health);
    }
  }
}

/* Placement ghost: gray when valid, red when it would overlap.
   The footprint (size + 30) matches the wall preview so every tool
   reads the same; a faint dashed ring shows a turret's range. */
function drawGhost(ghost) {
  if (!ghost) return;

  const b = ghost.building;

  if (b.range) {
    ctx.save();
    ctx.setLineDash(PLACE.dashed);
    ctx.lineWidth = 2;
    ctx.strokeStyle = PLACE.indicator;
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, b.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(ghost.x, ghost.y, b.size + 30, 0, Math.PI * 2);
  ctx.fillStyle = ghost.valid ? PLACE.validFill : PLACE.invalidFill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ghost.valid ? "#9aa3b0" : "#ff0000";
  ctx.stroke();
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
  if (typeof netUpdate === "function") netUpdate(dt);
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
  { id: "tent-button", building: 6 }, // Tent
];

/* Mode buttons toggle actionMode instead of a building tool */
const MODE_BUTTONS = [
  { id: "swap-button", mode: "swap" },
  { id: "delete-button", mode: "delete" },
];

function toggleActionMode(mode) {
  if (actionMode === mode) {
    actionMode = null;
  } else {
    actionMode = mode;
    placement.active = null; // building tools and action modes are exclusive
    drag.active = false;
    drag.building = null;
  }
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
  actionMode = null; // picking a building turns off swap/delete
  drag.active = false;
  drag.building = null;
  placement.active = placement.active === index ? null : index;
  updateToolButtons();
  draw();
}

function deselectBuilding() {
  placement.active = null;
  actionMode = null;
  drag.active = false;
  drag.building = null;
  updateToolButtons();
  draw();
}

/* ---------- INPUT (WASD steer camera, 1..7 pick building, Esc clears) ---------- */
window.addEventListener("keydown", (e) => {
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

  if (e.key === "Escape") deselectBuilding();
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

window.addEventListener("blur", () => keys.clear());

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

/* Aim the ghost at the mouse; in swap mode the grabbed building follows */
canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  placement.mouseX = e.clientX - rect.left;
  placement.mouseY = e.clientY - rect.top;

  if (actionMode === "swap" && drag.active) {
    const world = worldFromEvent(e);
    drag.building.x = world.x;
    drag.building.y = world.y;
  }
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

/* Swap mode: drop the building; swap it with what is underneath */
canvas.addEventListener("mouseup", (e) => {
  if (e.button !== 0 || !drag.active) return;

  const world = worldFromEvent(e);
  const target = buildingAt(world.x, world.y, drag.building);
  const p = drag.building;

  if (target) {
    [p.x, target.x] = [target.x, p.x];
    [p.y, target.y] = [target.y, p.y];
    [p.dir, target.dir] = [target.dir, p.dir];
  }

  drag.active = false;
  drag.building = null;
  draw();
});

/* Left-click: place a building, delete one, or order the soldiers to move */
canvas.addEventListener("click", (e) => {
  const { w, h } = viewSize();
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  if (isEliminated()) return; // base destroyed: no more orders

  if (placement.active !== null) {
    placeBuilding(sx, sy, w, h);
  } else if (actionMode === "delete") {
    const world = screenToWorld(sx, sy, w, h);
    const hit = buildingAt(world.x, world.y);
    if (hit) {
      placement.placed = placement.placed.filter((p) => p !== hit);
      state.power += hit.building.cost; // refund, so deleting is free to try
      refreshPowerUI();
    }
  } else if (actionMode === "swap") {
    // handled by the drag handlers
  } else {
    const world = screenToWorld(sx, sy, w, h);
    commandSoldiers(world.x, world.y);
  }

  draw();
});

/* ---------- TOOL BUTTON ICONS (canvas) ---------- */
/* Prepare a 48x48 button icon canvas and hand back its context */
function iconContext(id) {
  const icon = document.getElementById(id);
  if (!icon) return null;

  const size = 48;
  const dpr = window.devicePixelRatio || 1;
  icon.width = size * dpr;
  icon.height = size * dpr;

  const ictx = icon.getContext("2d");
  ictx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ictx.clearRect(0, 0, size, size);
  return { ictx, size };
}

/* Wall icon: a red circle with a gray border */
function drawWallIcon() {
  const icon = iconContext("wall-icon");
  if (!icon) return;

  const { ictx, size } = icon;
  ictx.beginPath();
  ictx.arc(size / 2, size / 2, size * 0.32, 0, Math.PI * 2);
  ictx.fillStyle = BUILD_STYLE.fill;
  ictx.fill();
  ictx.lineWidth = 3;
  ictx.strokeStyle = BUILD_STYLE.border;
  ictx.stroke();
}

/* Turret icon: same red circle, with the gray pipe pointing up */
function drawTurretIcon() {
  const icon = iconContext("turret-icon");
  if (!icon) return;

  const { ictx, size } = icon;
  paintTurret(ictx, size / 2, size / 2, size * 0.3, -Math.PI / 2, BARREL.simple);
}

/* Sniper icon: like the turret, with the longer barrel */
function drawSniperIcon() {
  const icon = iconContext("sniper-icon");
  if (!icon) return;

  const { ictx, size } = icon;
  paintTurret(ictx, size / 2, size / 2, size * 0.3, -Math.PI / 2, BARREL.sniper);
}

/* Generator icon: the red hexagon with its inner gray hexagon */
function drawGeneratorIcon() {
  const icon = iconContext("generator-icon");
  if (!icon) return;

  const { ictx, size } = icon;
  paintGenerator(ictx, size / 2, size / 2, size * 0.36);
}

/* House icon: the red pentagon with its inner gray pentagon */
function drawHouseIcon() {
  const icon = iconContext("house-icon");
  if (!icon) return;

  const { ictx, size } = icon;
  paintHouse(ictx, size / 2, size / 2, size * 0.36);
}

/* Tent icon: the red square with its inner gray square */
function drawTentIcon() {
  const icon = iconContext("tent-icon");
  if (!icon) return;

  const { ictx, size } = icon;
  paintTent(ictx, size / 2, size / 2, size * 0.34);
}

/* Swap icon: two opposing arrows (exchange) */
function drawSwapIcon() {
  const icon = iconContext("swap-icon");
  if (!icon) return;

  const { ictx } = icon;
  ictx.lineWidth = 3.5;
  ictx.strokeStyle = "#e9eef6";
  ictx.lineCap = "round";
  ictx.lineJoin = "round";

  ictx.beginPath();
  // top arrow pointing right
  ictx.moveTo(8, 16);
  ictx.lineTo(36, 16);
  ictx.moveTo(28, 9);
  ictx.lineTo(36, 16);
  ictx.lineTo(28, 23);
  // bottom arrow pointing left
  ictx.moveTo(40, 32);
  ictx.lineTo(12, 32);
  ictx.moveTo(20, 25);
  ictx.lineTo(12, 32);
  ictx.lineTo(20, 39);
  ictx.stroke();
}

/* Delete icon: a trash can */
function drawDeleteIcon() {
  const icon = iconContext("delete-icon");
  if (!icon) return;

  const { ictx } = icon;
  ictx.lineWidth = 3;
  ictx.strokeStyle = "#e9eef6";
  ictx.lineCap = "round";
  ictx.lineJoin = "round";

  ictx.strokeRect(21, 7, 6, 5); // handle

  ictx.beginPath(); // lid
  ictx.moveTo(11, 15);
  ictx.lineTo(37, 15);
  ictx.stroke();

  ictx.beginPath(); // body
  ictx.moveTo(15, 18);
  ictx.lineTo(33, 18);
  ictx.lineTo(31, 40);
  ictx.lineTo(17, 40);
  ictx.closePath();
  ictx.stroke();
}

function initToolButtons() {
  for (const tool of TOOL_BUTTONS) {
    const button = document.getElementById(tool.id);
    if (!button) continue;

    const building = BUILDINGS[tool.building];
    const parts = [building.name + " - " + building.cost + " power"];
    if (building.health) parts.push(building.health + " hp");
    if (building.damage) parts.push(building.damage + " dmg");
    button.title = parts.join(" | ");
    button.addEventListener("click", () => selectBuilding(tool.building));
  }

  for (const tool of MODE_BUTTONS) {
    const button = document.getElementById(tool.id);
    if (!button) continue;

    button.title = tool.mode === "swap" ? "Swap - drag buildings to exchange" : "Delete - click a building to remove";
    button.addEventListener("click", () => toggleActionMode(tool.mode));
  }
}

/* ---------- PLAYER PROFILE + START MENU ---------- */
/* Filled in by the menu; the name shows on the leaderboard and the color
   replaces every red part of your units (base, buildings, soldiers). */
const PROFILE = {
  name: "Player",
  color: BUILD_STYLE.fill,
};

let gameStarted = false;

/* A lighter tint of the base color, used for the base's border ring */
function lightenHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v));
  const r = c(((n >> 16) & 255) + amt);
  const g = c(((n >> 8) & 255) + amt);
  const b = c((n & 255) + amt);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* Recolor everything that used to be red. The paint functions read
   BUILD_STYLE.fill and STYLE.circle.* at draw time, so a single swap here
   recolors the base, every building, and every soldier. */
function setPlayerColor(hex) {
  PROFILE.color = hex;
  BUILD_STYLE.fill = hex;
  STYLE.circle.fill = hex;
  STYLE.circle.border = lightenHex(hex, 45);

  // let the CSS HUD mirror the chosen color (selected buttons, focus rings, ...)
  document.documentElement.style.setProperty("--player-color", hex);

  // tool icons use the player color too
  drawWallIcon();
  drawTurretIcon();
  drawSniperIcon();
  drawGeneratorIcon();
  drawHouseIcon();
  drawTentIcon();
}

function startGame() {
  if (gameStarted) return;
  gameStarted = true;

  const nameInput = document.getElementById("menu-name");
  const colorInput = document.getElementById("menu-color");
  PROFILE.name = (nameInput && nameInput.value.trim()) || "Player";

  const menu = document.getElementById("menu");
  if (menu) menu.classList.add("hidden");

  setPlayerColor(colorInput ? colorInput.value : BUILD_STYLE.fill);

  // connect to the multiplayer relay now that we know who we are
  if (typeof initNet === "function") initNet();

  draw();
}

function bindMenu() {
  const play = document.getElementById("menu-play");
  const nameInput = document.getElementById("menu-name");

  if (play) play.addEventListener("click", startGame);
  if (nameInput) {
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") startGame();
    });
  }
}

/* ---------- BOOT ---------- */
window.addEventListener("resize", resize);

window.addEventListener("DOMContentLoaded", () => {
  resize();
  drawWallIcon();
  drawTurretIcon();
  drawGeneratorIcon();
  drawHouseIcon();
  drawSniperIcon();
  drawTentIcon();
  drawSwapIcon();
  drawDeleteIcon();
  initToolButtons();
  refreshPowerUI();
  bindMenu();
  requestAnimationFrame(loop);
});
