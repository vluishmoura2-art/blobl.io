"use strict";

/* =========================================================
   hightide.io - the game's drawings

   Every piece on the map is drawn here, as flat ink on paper:
   an ink outline, a solid fill and no glow. The same functions
   draw the map pieces, the placement preview and the toolbar
   icons, so a button always shows exactly what it builds.
   ========================================================= */

const INK = "#2B3A42";
const PAPER = "#F3EBD9";
const SEA_LINE = "#A9C0C6";
const SEA_INK = "#5F8088";
const HEAL = "#3F7D4E"; // repairs
const SLOW = "#1F7A7A"; // slowed boats
const SPLASH = "#E8A33A"; // grapeshot impact

/* ---------- COLOR HELPERS ---------- */
function shiftHex(hex, amt) {
  const n = parseInt(String(hex).slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v));
  const r = c(((n >> 16) & 255) + amt);
  const g = c(((n >> 8) & 255) + amt);
  const b = c((n & 255) + amt);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function colorWithAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
}

/* ---------- SEEDED RANDOM ---------- */
function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- SHAPE HELPERS ---------- */
function traceClosedCurve(g, points) {
  const last = points[points.length - 1];
  g.beginPath();
  g.moveTo((last.x + points[0].x) / 2, (last.y + points[0].y) / 2);
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length];
    g.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  });
  g.closePath();
}

function inkFill(g, fill, lineWidth) {
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lineWidth;
  g.strokeStyle = INK;
  g.lineJoin = "round";
  g.stroke();
}

/* ---------- ISLAND (a player's base) ---------- */
const islandShapes = new Map(); // seed -> unit-circle outline

function islandShape(seed) {
  let shape = islandShapes.get(seed);
  if (!shape) {
    const rand = seededRandom(hashSeed(seed));
    shape = [];
    const count = 18;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = 0.88 + rand() * 0.14;
      shape.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    islandShapes.set(seed, shape);
  }
  return shape;
}

function scaledShape(shape, x, y, r) {
  return shape.map((p) => ({ x: x + p.x * r, y: y + p.y * r }));
}

/* Each player's coastline has its own shape, from the seed. */
function paintIsland(g, x, y, r, color, seed) {
  const shape = islandShape(seed);

  traceClosedCurve(g, scaledShape(shape, x, y, r * 1.1));
  g.fillStyle = colorWithAlpha(SEA_LINE, 0.55);
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = SEA_INK;
  g.stroke();

  traceClosedCurve(g, scaledShape(shape, x, y, r));
  inkFill(g, color, 3);

  traceClosedCurve(g, scaledShape(shape, x, y, r * 0.74));
  g.lineWidth = 1.5;
  g.strokeStyle = colorWithAlpha(PAPER, 0.5);
  g.stroke();
}

/* A destroyed island: bare, dashed coast with shipwreck hatching. */
function paintWreck(g, x, y, r, seed) {
  const coast = scaledShape(islandShape(seed), x, y, r);
  g.save();
  traceClosedCurve(g, coast);
  g.fillStyle = "#D3C8AF";
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = "rgba(43, 58, 66, 0.35)";
  g.lineWidth = 2;
  g.beginPath();
  for (let d = -r * 2; d < r * 2; d += 16) {
    g.moveTo(x + d, y - r);
    g.lineTo(x + d + r * 2, y + r);
  }
  g.stroke();
  g.restore();
  traceClosedCurve(g, coast);
  g.setLineDash([14, 10]);
  g.lineWidth = 3;
  g.strokeStyle = INK;
  g.stroke();
  g.restore();
}

/* ---------- BUILDINGS ---------- */

/* Reef: a jagged rock in the player's color. */
function paintReef(g, x, y, s, color, dir) {
  const radii = [1, 0.8, 0.97, 0.76, 1, 0.82, 0.94, 0.78];
  g.save();
  g.translate(x, y);
  g.rotate(dir);
  g.beginPath();
  radii.forEach((r, i) => {
    const a = (i / radii.length) * Math.PI * 2;
    const px = Math.cos(a) * s * r;
    const py = Math.sin(a) * s * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.closePath();
  inkFill(g, color, 2.5);

  g.strokeStyle = colorWithAlpha(PAPER, 0.7);
  g.lineWidth = 2;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(-s * 0.38, -s * 0.16);
  g.lineTo(s * 0.06, -s * 0.34);
  g.moveTo(-s * 0.2, s * 0.26);
  g.lineTo(s * 0.34, s * 0.06);
  g.stroke();
  g.restore();
}

/* Cannon: a round gun deck with a short, wide barrel. Path A (fast battery)
   gets a band, then an ammo crate, then twin barrels; path B (grapeshot) gets a
   flared muzzle, then shot on the deck, then a wide bell with rivets. */
function paintCannon(g, x, y, s, color, dir, level, path) {
  const lv = level || 1;
  const fast = path === "A";
  const grape = path === "B";

  g.save();
  g.translate(x, y);
  g.rotate(dir);

  if (fast && lv >= 3) {
    g.beginPath();
    g.rect(-s * 1.12, -s * 0.26, s * 0.42, s * 0.52);
    inkFill(g, PAPER, 2);
    g.beginPath();
    g.moveTo(-s * 1.12, -s * 0.26);
    g.lineTo(-s * 0.7, s * 0.26);
    g.moveTo(-s * 0.7, -s * 0.26);
    g.lineTo(-s * 1.12, s * 0.26);
    g.lineWidth = 1.5;
    g.stroke();
  }

  g.beginPath();
  g.arc(0, 0, s * 0.92, 0, Math.PI * 2);
  inkFill(g, PAPER, 2.5);

  g.fillStyle = INK;
  if (grape && lv >= 4) {
    g.beginPath();
    g.moveTo(s * 0.15, -s * 0.22);
    g.lineTo(s * 1.08, -s * 0.46);
    g.lineTo(s * 1.08, s * 0.46);
    g.lineTo(s * 0.15, s * 0.22);
    g.closePath();
    g.fill();
  } else {
    const length = fast && lv >= 3 ? s * 1.24 : s * 1.12;
    const barrels = fast && lv >= 4 ? [-0.24, 0.24] : [0];
    const width = barrels.length > 1 ? s * 0.28 : s * 0.4;
    for (const offset of barrels) {
      const cy = offset * s;
      g.fillRect(0, cy - width / 2, length, width);
      if (fast) {
        g.fillStyle = PAPER;
        g.fillRect(length * 0.58, cy - width / 2, s * 0.1, width);
        g.fillStyle = INK;
      }
      if (grape) {
        g.beginPath();
        g.moveTo(length * 0.72, cy - width / 2);
        g.lineTo(length + s * 0.04, cy - width * 0.95);
        g.lineTo(length + s * 0.04, cy + width * 0.95);
        g.lineTo(length * 0.72, cy + width / 2);
        g.closePath();
        g.fill();
      } else {
        g.fillRect(length - s * 0.18, cy - width * 0.7, s * 0.22, width * 1.4);
      }
    }
  }

  if (grape && lv >= 4) {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 2 + Math.PI / 4;
      g.beginPath();
      g.arc(Math.cos(a) * s * 0.76, Math.sin(a) * s * 0.76, Math.max(1.5, s * 0.07), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();

  g.beginPath();
  g.arc(x, y, s * 0.54, 0, Math.PI * 2);
  inkFill(g, color, 2.5);

  if (grape && lv >= 3) {
    g.fillStyle = PAPER;
    for (const [dx, dy] of [
      [-0.18, -0.14],
      [0.16, -0.06],
      [-0.04, 0.2],
    ]) {
      g.beginPath();
      g.arc(x + dx * s, y + dy * s, Math.max(2, s * 0.09), 0, Math.PI * 2);
      g.fill();
    }
  }
}

/* Long gun: a square gun deck with a long, thin barrel. */
function paintLongGun(g, x, y, s, color, dir) {
  g.save();
  g.translate(x, y);
  g.rotate(dir);
  const half = s * 0.7;
  g.beginPath();
  g.rect(-half, -half, half * 2, half * 2);
  inkFill(g, PAPER, 2.5);

  g.fillStyle = INK;
  g.fillRect(0, -s * 0.12, s * 1.55, s * 0.24);
  g.fillRect(s * 1.4, -s * 0.2, s * 0.17, s * 0.4);

  const inner = s * 0.4;
  g.beginPath();
  g.rect(-inner, -inner, inner * 2, inner * 2);
  inkFill(g, color, 2.5);
  g.restore();
}

/* A gear outline, used for the repair workshop's hub. */
function traceGear(g, x, y, r, teeth) {
  g.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const radius = i % 2 === 0 ? r : r * 0.78;
    g.lineTo(x + Math.cos(a0) * radius, y + Math.sin(a0) * radius);
    g.lineTo(x + Math.cos(a1) * radius, y + Math.sin(a1) * radius);
  }
  g.closePath();
}

/* Windmill: the sails keep turning while it makes gold. Path A (gold works)
   adds sails and spins faster; path B (repair workshop) gets a gear hub and, at
   the top level, green crosses on its sails. */
function paintWindmill(g, x, y, s, color, turn, level, path) {
  const lv = level || 1;
  const gold = path === "A";
  const repair = path === "B";
  const sails = gold ? (lv >= 4 ? 8 : 6) : 4;
  const spin = gold ? 1 + 0.25 * (lv - 1) : 1;

  g.beginPath();
  g.arc(x, y, s * 0.62, 0, Math.PI * 2);
  inkFill(g, PAPER, 2.5);

  g.save();
  g.translate(x, y);
  g.rotate(turn * spin);
  for (let i = 0; i < sails; i++) {
    g.rotate((Math.PI * 2) / sails);
    g.beginPath();
    g.rect(s * 0.16, -s * 0.03, s * 0.84, s * 0.26);
    inkFill(g, gold && lv >= 4 && i % 2 === 0 ? color : PAPER, 2);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(s * 1, 0);
    g.lineWidth = 2.5;
    g.strokeStyle = INK;
    g.stroke();

    if (repair && lv >= 4) {
      g.strokeStyle = HEAL;
      g.lineWidth = Math.max(2, s * 0.08);
      g.beginPath();
      g.moveTo(s * 0.86, s * 0.1 - s * 0.12);
      g.lineTo(s * 0.86, s * 0.1 + s * 0.12);
      g.moveTo(s * 0.74, s * 0.1);
      g.lineTo(s * 0.98, s * 0.1);
      g.stroke();
    }
  }
  g.restore();

  if (repair && lv >= 2) {
    traceGear(g, x, y, s * (lv >= 4 ? 0.42 : 0.36), 8);
    inkFill(g, color, 2);
  } else {
    g.beginPath();
    g.arc(x, y, s * 0.3, 0, Math.PI * 2);
    inkFill(g, color, 2.5);
  }
}

/* Hut: always upright, like a symbol printed on the chart. */
function paintHut(g, x, y, s, color) {
  const w = s * 0.72;
  g.beginPath();
  g.rect(x - w, y - s * 0.1, w * 2, s * 0.86);
  inkFill(g, PAPER, 2.5);

  g.beginPath();
  g.moveTo(x - w * 1.28, y - s * 0.06);
  g.lineTo(x, y - s * 0.92);
  g.lineTo(x + w * 1.28, y - s * 0.06);
  g.closePath();
  inkFill(g, color, 2.5);

  g.fillStyle = INK;
  g.fillRect(x - s * 0.17, y + s * 0.28, s * 0.34, s * 0.48);
}

/* Arsenal: a disc carrying a large anchor. */
function paintArsenal(g, x, y, s, color) {
  g.beginPath();
  g.arc(x, y, s * 0.96, 0, Math.PI * 2);
  inkFill(g, color, 3);

  g.beginPath();
  g.arc(x, y, s * 0.78, 0, Math.PI * 2);
  g.lineWidth = 1.5;
  g.strokeStyle = colorWithAlpha(PAPER, 0.55);
  g.stroke();

  g.strokeStyle = PAPER;
  g.lineWidth = Math.max(2.5, s * 0.1);
  g.lineCap = "round";
  g.beginPath();
  g.arc(x, y - s * 0.46, s * 0.13, 0, Math.PI * 2);
  g.moveTo(x, y - s * 0.33);
  g.lineTo(x, y + s * 0.54);
  g.moveTo(x - s * 0.24, y - s * 0.12);
  g.lineTo(x + s * 0.24, y - s * 0.12);
  g.moveTo(x - s * 0.5, y + s * 0.1);
  g.quadraticCurveTo(x - s * 0.42, y + s * 0.5, x, y + s * 0.54);
  g.quadraticCurveTo(x + s * 0.42, y + s * 0.5, x + s * 0.5, y + s * 0.1);
  g.stroke();
}

/* Dock: a pier reaching out to sea, with a boathouse on land. The boathouse
   grows with each tier and carries one marker per tier. */
function paintDock(g, x, y, s, color, dir, tier) {
  const level = tier || 1;
  g.save();
  g.translate(x, y);
  g.rotate(dir);

  const w = s * 0.34;
  g.beginPath();
  g.rect(-s * 0.15, -w, s * 1.1, w * 2);
  inkFill(g, PAPER, 2.5);
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  g.beginPath();
  for (let px = s * 0.1; px < s * 0.9; px += s * 0.2) {
    g.moveTo(px, -w);
    g.lineTo(px, w);
  }
  g.stroke();

  const depth = s * (0.62 + level * 0.05);
  const span = s * (0.62 + level * 0.09);
  g.beginPath();
  g.rect(-s * 0.95, -span, depth + s * 0.32, span * 2);
  inkFill(g, color, 2.5);

  g.fillStyle = PAPER;
  const gap = (span * 2) / (level + 1);
  for (let i = 1; i <= level; i++) {
    g.beginPath();
    g.arc(-s * 0.6, -span + gap * i, Math.max(2, s * 0.09), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/* Draws any building from its definition. The toolbar, the placement preview
   and every player's pieces all come through here. */
function paintBuilding(g, building, x, y, s, color, dir, tier, time, level, path) {
  switch (building.design) {
    case "turret":
      paintCannon(g, x, y, s, color, dir, level, path);
      break;
    case "sniper":
      paintLongGun(g, x, y, s, color, dir);
      break;
    case "generator":
      paintWindmill(g, x, y, s, color, (time || 0) * 0.7, level, path);
      break;
    case "house":
      paintHut(g, x, y, s, color);
      break;
    case "armory":
      paintArsenal(g, x, y, s, color);
      break;
    case "tent":
      paintDock(g, x, y, s, color, dir, tier);
      break;
    default:
      paintReef(g, x, y, s, color, dir);
  }
}

/* Level marks on the island side of a building: one per level above the first.
   Path A uses round marks and path B diamonds, so the path reads without color. */
function paintLevelPips(g, x, y, s, radialDir, level, path) {
  const marks = (level || 1) - 1;
  if (marks <= 0) return;

  const inward = radialDir + Math.PI;
  const cx = x + Math.cos(inward) * (s + 9);
  const cy = y + Math.sin(inward) * (s + 9);
  const side = inward + Math.PI / 2;

  for (let i = 0; i < marks; i++) {
    const offset = (i - (marks - 1) / 2) * 10;
    const px = cx + Math.cos(side) * offset;
    const py = cy + Math.sin(side) * offset;
    g.beginPath();
    if (path === "B") {
      g.moveTo(px, py - 4.5);
      g.lineTo(px + 4.5, py);
      g.lineTo(px, py + 4.5);
      g.lineTo(px - 4.5, py);
      g.closePath();
      g.fillStyle = INK;
      g.fill();
    } else {
      g.arc(px, py, 3.5, 0, Math.PI * 2);
      inkFill(g, PAPER, 1.5);
    }
  }
}

/* ---------- BOATS ---------- */
/* A hull seen from above, bow along `dir`. Boat classes differ by beam and
   number of masts: dinghy 1, frigate 2, galleon 3. */
const BOAT_CLASS = {
  soldier: { beam: 0.42, masts: [0] },
  tank: { beam: 0.46, masts: [0.28, -0.32] },
  siege: { beam: 0.54, masts: [0.42, -0.02, -0.46] },
};

function paintBoat(g, x, y, size, dir, color, kind, cannons) {
  const type = BOAT_CLASS[kind] || BOAT_CLASS.soldier;
  const beam = size * type.beam;

  g.save();
  g.translate(x, y);
  g.rotate(dir);

  if (cannons) {
    g.fillStyle = INK;
    for (const at of [-0.3, 0.2]) {
      g.fillRect(size * at, -beam - size * 0.14, size * 0.12, beam * 2 + size * 0.28);
    }
  }

  g.beginPath();
  g.moveTo(size, 0);
  g.quadraticCurveTo(size * 0.35, -beam * 1.3, -size * 0.55, -beam);
  g.lineTo(-size * 0.9, -beam * 0.62);
  g.lineTo(-size * 0.9, beam * 0.62);
  g.lineTo(-size * 0.55, beam);
  g.quadraticCurveTo(size * 0.35, beam * 1.3, size, 0);
  g.closePath();
  inkFill(g, color, 2);

  for (const at of type.masts) {
    const mx = size * at;
    g.beginPath();
    g.rect(mx - size * 0.06, -beam * 0.9, size * 0.12, beam * 1.8);
    inkFill(g, PAPER, 1.5);
  }
  g.restore();
}
