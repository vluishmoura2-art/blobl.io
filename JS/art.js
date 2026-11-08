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
const CALM_ART = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

/* One jagged rock, as a path. */
const ROCK_RADII = [1, 0.8, 0.97, 0.76, 1, 0.82, 0.94, 0.78];

function traceRock(g, cx, cy, r) {
  g.beginPath();
  ROCK_RADII.forEach((k, i) => {
    const a = (i / ROCK_RADII.length) * Math.PI * 2;
    const px = cx + Math.cos(a) * r * k;
    const py = cy + Math.sin(a) * r * k;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.closePath();
}

function paintRockMarks(g, cx, cy, r) {
  g.strokeStyle = colorWithAlpha(PAPER, 0.7);
  g.lineWidth = 2;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx - r * 0.38, cy - r * 0.16);
  g.lineTo(cx + r * 0.06, cy - r * 0.34);
  g.moveTo(cx - r * 0.2, cy + r * 0.26);
  g.lineTo(cx + r * 0.34, cy + r * 0.06);
  g.stroke();
}

/* A small coral branch, a paper "Y". */
function paintCoral(g, cx, cy, r) {
  g.strokeStyle = PAPER;
  g.lineWidth = 2;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx, cy + r);
  g.lineTo(cx, cy - r * 0.2);
  g.moveTo(cx, cy + r * 0.2);
  g.lineTo(cx - r * 0.6, cy - r * 0.6);
  g.moveTo(cx, cy + r * 0.2);
  g.lineTo(cx + r * 0.6, cy - r * 0.6);
  g.stroke();
}

/* Reef: a jagged rock in the player's color. Path A (coral wall) grows into a
   crown of rocks with coral on top; path B (cutting reef) grows ink spikes. */
function paintReef(g, x, y, s, color, dir, level, path) {
  const lv = level || 1;
  g.save();
  g.translate(x, y);
  g.rotate(dir);

  if (path === "A" && lv >= 2) {
    const rocks = [
      [0.14, -0.1, 0.82],
      [-0.4, 0.36, 0.52],
    ];
    if (lv >= 4) rocks.push([0.36, 0.44, 0.46]);
    for (const [dx, dy, k] of rocks.slice().reverse()) {
      traceRock(g, dx * s, dy * s, s * k);
      inkFill(g, color, 2.5);
    }
    if (lv >= 4) {
      g.beginPath();
      g.arc(0, 0, s * 1.02, 0, Math.PI * 2);
      g.lineWidth = 1.2;
      g.strokeStyle = INK;
      g.stroke();
    }
    paintRockMarks(g, 0.14 * s, -0.1 * s, s * 0.82);
    if (lv >= 3) {
      for (const [dx, dy, k] of rocks) paintCoral(g, dx * s, dy * s, s * k * 0.32);
    }
  } else if (path === "B" && lv >= 2) {
    const spikes = lv >= 4 ? 16 : 8;
    const tip = lv >= 3 ? 1.08 : 0.98;
    g.fillStyle = INK;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + Math.PI / spikes;
      const side = Math.PI / (spikes * 1.6);
      g.beginPath();
      g.moveTo(Math.cos(a) * s * tip, Math.sin(a) * s * tip);
      g.lineTo(Math.cos(a - side) * s * 0.7, Math.sin(a - side) * s * 0.7);
      g.lineTo(Math.cos(a + side) * s * 0.7, Math.sin(a + side) * s * 0.7);
      g.closePath();
      g.fill();
    }
    traceRock(g, 0, 0, s * 0.82);
    inkFill(g, color, 2.5);
    paintRockMarks(g, 0, 0, s * 0.82);
  } else {
    traceRock(g, 0, 0, s);
    inkFill(g, color, 2.5);
    paintRockMarks(g, 0, 0, s);
  }
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

/* Long gun: a square gun deck with a long, thin barrel. Path A (marksman)
   lengthens the barrel, adds a scope and then a tripod; path B (piercing) gets
   a thick pointed barrel, armor plating and a muzzle brake. */
function paintLongGun(g, x, y, s, color, dir, level, path) {
  const lv = level || 1;
  const scope = path === "A";
  const pierce = path === "B";

  g.save();
  g.translate(x, y);
  g.rotate(dir);
  const half = s * 0.7;

  if (scope && lv >= 4) {
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.lineCap = "round";
    g.beginPath();
    for (const a of [Math.PI * 0.72, Math.PI, Math.PI * 1.28]) {
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * s * 1.3, Math.sin(a) * s * 1.3);
    }
    g.stroke();
  }

  g.beginPath();
  g.rect(-half, -half, half * 2, half * 2);
  inkFill(g, PAPER, 2.5);

  if (pierce && lv >= 3) {
    g.save();
    g.beginPath();
    g.rect(-half, -half, half * 2, half * 2);
    g.clip();
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let d = -half * 2; d <= half * 2; d += s * 0.32) {
      g.moveTo(-half + d, half);
      g.lineTo(half + d, -half);
    }
    g.stroke();
    g.restore();
  }

  g.fillStyle = INK;
  const length = s * 1.55 * (scope && lv >= 4 ? 1.3 : scope && lv >= 2 ? 1.15 : 1);
  if (pierce && lv >= 2) {
    const w = s * 0.17;
    g.beginPath();
    g.moveTo(0, -w);
    g.lineTo(length, -w);
    g.lineTo(length + s * 0.3, 0);
    g.lineTo(length, w);
    g.lineTo(0, w);
    g.closePath();
    g.fill();
    if (lv >= 4) {
      g.fillRect(length * 0.72, -w * 1.7, s * 0.12, w * 3.4);
      g.fillRect(length * 0.86, -w * 1.7, s * 0.12, w * 3.4);
    }
  } else {
    g.fillRect(0, -s * 0.12, length, s * 0.24);
    g.fillRect(length - s * 0.15, -s * 0.2, s * 0.17, s * 0.4);
  }

  if (scope && lv >= 3) {
    // the scope sits on the deck's edge, beside the barrel
    const sx = s * 0.3;
    const sy = -half + s * 0.02;
    const r = s * 0.22;
    g.beginPath();
    g.arc(sx, sy, r, 0, Math.PI * 2);
    inkFill(g, PAPER, 2);
    g.beginPath();
    g.moveTo(sx - r * 0.7, sy);
    g.lineTo(sx + r * 0.7, sy);
    g.moveTo(sx, sy - r * 0.7);
    g.lineTo(sx, sy + r * 0.7);
    g.lineWidth = 1.2;
    g.stroke();
  }

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

/* One hut: paper walls, a roof in the player's color and an ink door. */
function paintOneHut(g, x, y, s, color) {
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

/* Hut: always upright, like a symbol printed on the chart. Path A (village)
   grows into a cluster of huts with a flag; path B (sailors' school) gets a bell,
   crossed oars and then a second floor with an anchor on the roof. */
function paintHut(g, x, y, s, color, level, path, time) {
  const lv = level || 1;

  if (path === "A" && lv >= 2) {
    const back = lv >= 3 ? [[-0.44, -0.3], [0.44, -0.3]] : [[0.4, -0.32]];
    for (const [dx, dy] of back) paintOneHut(g, x + dx * s, y + dy * s, s * 0.52, color);
    paintOneHut(g, x, y + s * 0.18, s * 0.74, color);
    if (lv >= 4) {
      const top = y + s * 0.18 - s * 0.74 * 0.92;
      const wave = CALM_ART ? 0 : Math.sin((time || 0) * 3) * 2;
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, top);
      g.lineTo(x, top - s * 0.5);
      g.stroke();
      g.beginPath();
      g.moveTo(x, top - s * 0.5);
      g.lineTo(x + s * 0.42, top - s * 0.42 + wave);
      g.lineTo(x, top - s * 0.3);
      g.closePath();
      inkFill(g, color, 1.5);
    }
    return;
  }

  if (path === "B" && lv >= 4) {
    const w = s * 0.74;
    g.beginPath();
    g.rect(x - w, y - s * 0.42, w * 2, s * 1.2);
    inkFill(g, PAPER, 2.5);
    g.beginPath();
    g.moveTo(x - w * 1.2, y - s * 0.38);
    g.lineTo(x, y - s * 1.08);
    g.lineTo(x + w * 1.2, y - s * 0.38);
    g.closePath();
    inkFill(g, color, 2.5);
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x - w, y + s * 0.16);
    g.lineTo(x + w, y + s * 0.16);
    g.stroke();
    g.fillStyle = INK;
    g.fillRect(x - w * 0.7, y - s * 0.26, s * 0.24, s * 0.24);
    g.fillRect(x + w * 0.7 - s * 0.24, y - s * 0.26, s * 0.24, s * 0.24);
    g.fillRect(x - s * 0.13, y + s * 0.36, s * 0.26, s * 0.42);
    g.strokeStyle = PAPER;
    g.lineWidth = 1.8;
    g.lineCap = "round";
    g.beginPath();
    g.arc(x, y - s * 0.86, s * 0.06, 0, Math.PI * 2);
    g.moveTo(x, y - s * 0.8);
    g.lineTo(x, y - s * 0.52);
    g.moveTo(x - s * 0.12, y - s * 0.7);
    g.lineTo(x + s * 0.12, y - s * 0.7);
    g.moveTo(x - s * 0.18, y - s * 0.6);
    g.quadraticCurveTo(x, y - s * 0.44, x + s * 0.18, y - s * 0.6);
    g.stroke();
    return;
  }

  const wide = path === "B" && lv >= 3 ? 1.12 : 1;

  // crossed oars behind the house, their blades showing on both sides
  if (path === "B" && lv >= 3) {
    g.strokeStyle = INK;
    g.lineWidth = 2.2;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x - s * 1.02, y + s * 0.62);
    g.lineTo(x + s * 1.02, y - s * 0.34);
    g.moveTo(x + s * 1.02, y + s * 0.62);
    g.lineTo(x - s * 1.02, y - s * 0.34);
    g.stroke();
    for (const [bx, by, a] of [
      [x + s * 0.98, y - s * 0.32, -0.44],
      [x - s * 0.98, y - s * 0.32, 0.44],
    ]) {
      g.beginPath();
      g.ellipse(bx, by, s * 0.16, s * 0.08, a, 0, Math.PI * 2);
      inkFill(g, PAPER, 1.5);
    }
  }

  g.save();
  g.translate(x, y);
  g.scale(wide, 1);
  paintOneHut(g, 0, 0, s, color);
  g.restore();

  if (path === "B" && lv >= 2) {
    g.beginPath();
    g.arc(x, y - s * 0.92, s * 0.13, 0, Math.PI * 2);
    inkFill(g, PAPER, 1.8);
  }
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
      paintLongGun(g, x, y, s, color, dir, level, path);
      break;
    case "generator":
      paintWindmill(g, x, y, s, color, (time || 0) * 0.7, level, path);
      break;
    case "house":
      paintHut(g, x, y, s, color, level, path, time);
      break;
    case "armory":
      paintArsenal(g, x, y, s, color);
      break;
    case "tent":
      paintDock(g, x, y, s, color, dir, tier);
      break;
    default:
      paintReef(g, x, y, s, color, dir, level, path);
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

/* `crew` (0..3) draws pale stripes on the hull: a crew from a sailors' school. */
function paintBoat(g, x, y, size, dir, color, kind, cannons, crew) {
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

  if (crew > 0) {
    g.strokeStyle = PAPER;
    g.lineWidth = 2;
    g.beginPath();
    for (let i = 0; i < crew; i++) {
      const sx = -size * 0.72 + i * size * 0.16;
      g.moveTo(sx, -beam * 0.6);
      g.lineTo(sx, beam * 0.6);
    }
    g.stroke();
  }

  for (const at of type.masts) {
    const mx = size * at;
    g.beginPath();
    g.rect(mx - size * 0.06, -beam * 0.9, size * 0.12, beam * 1.8);
    inkFill(g, PAPER, 1.5);
  }
  g.restore();
}
