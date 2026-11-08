"use strict";

/* =========================================================
   hightide.io - what a battle looks like

   The server decides all damage. This file only shows it: it
   aims the cannons, fires the shots, smooths other players'
   boats and draws the explosions the server reports. The aim
   and shot rules mirror combatTick in server.js, so a cannon
   fires at the boats that really are in its range.
   ========================================================= */

const SHOT = {
  speed: 760, // world units per second
  cooldown: { turret: 0.6, sniper: 1.4, island: 0.8, tank: 1.0, siege: 1.4 },
  radius: { turret: 3, sniper: 3.5, island: 3, tank: 3, siege: 4.5 },
  maxInFlight: 200,
};

const battle = {
  shots: [],
  blasts: [],
  guns: new Map(), // shooter key -> { dir, cool, frame }
  motion: new Map(), // boat key -> motion between two snapshots
  health: new Map(), // piece key -> last known hp
  hits: new Map(), // piece key -> time of the last hit
  heals: new Map(), // piece key -> time it was last repaired
  rings: [], // grapeshot impacts
  lines: [], // marksman aim lines and piercing shot trails
  coins: [], // gold rising from upgraded windmills
  coinTimers: new Map(), // windmill uid -> seconds until its next coin
  frame: 0,
  lastAttackNotice: -Infinity,
  sunkBy: null, // who sank our island
};

function resetBattle() {
  battle.shots.length = 0;
  battle.blasts.length = 0;
  battle.guns.clear();
  battle.motion.clear();
  battle.health.clear();
  battle.hits.clear();
  battle.heals.clear();
  battle.rings.length = 0;
  battle.lines.length = 0;
  battle.coins.length = 0;
  battle.coinTimers.clear();
  battle.lastAttackNotice = -Infinity;
  battle.sunkBy = null;
}

const MOTION_MS = 120; // a little over one snapshot interval

function pieceKey(ownerId, uid) {
  return ownerId + ":" + uid;
}

/* ---------- SMOOTH MOVEMENT OF OTHER PLAYERS' BOATS ---------- */

function motionNow(entry, now) {
  const t = Math.min(1, (now - entry.at) / MOTION_MS);
  return {
    x: entry.fromX + (entry.toX - entry.fromX) * t,
    y: entry.fromY + (entry.toY - entry.fromY) * t,
    dir: entry.dir,
  };
}

/* Called for each snapshot. A boat glides from where it is drawn right now to
   the position the server just reported, instead of jumping there. */
function syncMotion(players) {
  const now = performance.now();
  const seen = new Set();

  for (const p of players) {
    if (p.id === net.id) continue;
    for (const s of p.soldiers) {
      const key = pieceKey(p.id, s.uid);
      seen.add(key);
      const entry = battle.motion.get(key);
      if (entry) {
        const at = motionNow(entry, now);
        Object.assign(entry, { fromX: at.x, fromY: at.y, toX: s.x, toY: s.y, at: now, dir: s.dir || 0 });
      } else {
        battle.motion.set(key, { fromX: s.x, fromY: s.y, toX: s.x, toY: s.y, at: now, dir: s.dir || 0 });
      }
    }
  }

  for (const key of battle.motion.keys()) {
    if (!seen.has(key)) battle.motion.delete(key);
  }
}

/* Where to draw another player's boat this frame. */
function boatPosition(ownerId, boat) {
  const entry = battle.motion.get(pieceKey(ownerId, boat.uid));
  return entry ? motionNow(entry, performance.now()) : { x: boat.x, y: boat.y, dir: boat.dir || 0 };
}

/* ---------- HIT FLASHES ---------- */

function trackHit(key, hp) {
  const before = battle.health.get(key);
  if (before !== undefined && hp < before) battle.hits.set(key, performance.now());
  if (before !== undefined && hp > before + 0.01) battle.heals.set(key, performance.now());
  battle.health.set(key, hp);
}

/* Compares each snapshot with the previous one to find what just took damage. */
function syncHits(players) {
  const seen = new Set();
  const track = (key, hp) => {
    seen.add(key);
    trackHit(key, hp);
  };

  for (const p of players) {
    track(pieceKey(p.id, "island"), p.health);
    for (const b of p.buildings) track(pieceKey(p.id, b.uid), b.hp);
    for (const s of p.soldiers) track(pieceKey(p.id, s.uid), s.hp);
  }

  for (const key of battle.health.keys()) {
    if (!seen.has(key)) {
      battle.health.delete(key);
      battle.hits.delete(key);
      battle.heals.delete(key);
    }
  }
}

/* A pale flash over a piece that was just hit. */
function drawHitFlash(key, x, y, r) {
  const at = battle.hits.get(key);
  if (at === undefined) return;

  const age = (performance.now() - at) / 140;
  if (age >= 1) return;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = colorWithAlpha(PAPER, 0.6 * (1 - age));
  ctx.fill();
}

/* A green cross over a piece that is being repaired. */
function drawHealMark(key, x, y, r) {
  const at = battle.heals.get(key);
  if (at === undefined) return;

  const age = (performance.now() - at) / 600;
  if (age >= 1) return;

  const cx = x + r * 0.7;
  const cy = y - r * 0.7 - age * 8;
  ctx.save();
  ctx.globalAlpha = 1 - age;
  ctx.strokeStyle = HEAL;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 5, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.stroke();
  ctx.restore();
}

/* The area a cutting reef slows down: a teal dashed circle everyone can see. */
function drawSlowZone(x, y, stats) {
  if (!stats.slowRange) return;
  ctx.save();
  ctx.setLineDash([9, 7]);
  ctx.lineWidth = stats.slowMul <= 0.5 ? 3 : 2;
  ctx.strokeStyle = colorWithAlpha(SLOW, 0.7);
  ctx.beginPath();
  ctx.arc(x, y, stats.slowRange, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* True when one of our scoped long guns can see this spot through the fog. */
function revealedByScope(x, y) {
  return placement.placed.some((p) => {
    const stats = pieceStats(p);
    return stats.seesCloak && Math.hypot(p.x - x, p.y - y) <= stats.range;
  });
}

/* A dashed ink ring around a cloaked boat that our scope has spotted. */
function drawScopeMark(x, y, size) {
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(x, y, size + 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/* ---------- AIMING AND SHOOTING ---------- */

/* The same view of every player, whether it comes from the local game or from
   the server's snapshot. */
function collectSides() {
  const sides = [];

  for (const rp of net.players.values()) {
    if (rp.dead) continue;
    const mine = rp.id === net.id;
    const flags = mine ? state.upgrades : rp.u;

    const buildings = mine
      ? placement.placed.map((p) => ({ uid: p.uid, x: p.x, y: p.y, def: p.building, stats: pieceStats(p), rest: buildingDir(p) }))
      : rp.buildings
          .filter((b) => BUILDINGS[b.b])
          .map((b) => ({
            uid: b.uid,
            x: b.x,
            y: b.y,
            def: BUILDINGS[b.b],
            stats: COMBAT.levelStats(BUILDINGS[b.b], b.lv || 1, b.p || null),
            rest: Math.atan2(b.y - rp.y, b.x - rp.x),
          }));

    const boats = (mine ? soldiers : rp.soldiers).map((s) => {
      const kind = s.kind || "soldier";
      const at = mine ? s : boatPosition(rp.id, s);
      return { uid: s.uid, x: at.x, y: at.y, kind, stat: COMBAT.units[kind] };
    });

    sides.push({
      id: rp.id,
      x: mine ? PLAYER.x : rp.x,
      y: mine ? PLAYER.y : rp.y,
      safe: mine ? net.mySafe : rp.safe,
      cloaked: (flags & COMBAT.upgradeFlags.cloak) !== 0,
      cannons: (flags & COMBAT.upgradeFlags.cannons) !== 0,
      buildings,
      boats,
    });
  }

  return sides;
}

function gunState(key, rest) {
  let gun = battle.guns.get(key);
  if (!gun) {
    gun = { dir: rest, cool: Math.random() * 0.4, frame: 0 };
    battle.guns.set(key, gun);
  }
  gun.frame = battle.frame;
  return gun;
}

/* Which way a cannon points right now; anything else keeps its own direction. */
function aimOf(key, fallback) {
  const gun = battle.guns.get(key);
  return gun ? gun.dir : fallback;
}

function turnToward(current, wanted, amount) {
  const diff = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
  return current + diff * amount;
}

function fireShot(x, y, target, kind, splash) {
  if (battle.shots.length >= SHOT.maxInFlight) return;

  const dist = Math.hypot(target.x - x, target.y - y);
  battle.shots.push({
    x,
    y,
    dx: (target.x - x) / (dist || 1),
    dy: (target.y - y) / (dist || 1),
    left: dist,
    r: splash ? 2 : SHOT.radius[kind],
    splash: splash || 0, // grapeshot: a cluster of balls that opens a ring on impact
  });
}

/* The boats a gun can see, nearest first. */
function boatsInRange(x, y, range, enemies, ignoreCloaked) {
  const found = [];
  for (const side of enemies) {
    for (const boat of side.boats) {
      if (ignoreCloaked && side.cloaked && boat.kind !== "soldier") continue;
      const d = (boat.x - x) ** 2 + (boat.y - y) ** 2;
      if (d <= range * range) found.push({ boat, d });
    }
  }
  return found.sort((a, b) => a.d - b.d).map((f) => f.boat);
}

function nearestBoat(x, y, range, enemies, ignoreCloaked) {
  let best = null;
  let bestDist = range * range;

  for (const side of enemies) {
    for (const boat of side.boats) {
      if (ignoreCloaked && side.cloaked && boat.kind !== "soldier") continue;
      const d = (boat.x - x) ** 2 + (boat.y - y) ** 2;
      if (d <= bestDist) {
        bestDist = d;
        best = boat;
      }
    }
  }
  return best;
}

/* Frigates and galleons with on-board cannons also fire at buildings and islands. */
function nearestAnything(x, y, range, enemies) {
  let best = nearestBoat(x, y, range, enemies, false);
  let bestDist = best ? (best.x - x) ** 2 + (best.y - y) ** 2 : range * range;

  for (const side of enemies) {
    for (const target of [...side.buildings, side]) {
      const d = (target.x - x) ** 2 + (target.y - y) ** 2;
      if (d <= bestDist) {
        bestDist = d;
        best = target;
      }
    }
  }
  return best;
}

function updateGuns(side, enemies, dt) {
  for (const building of side.buildings) {
    const design = building.def && building.def.design;
    if (design !== "turret" && design !== "sniper") continue;

    const stats = building.stats;
    const gun = gunState(pieceKey(side.id, building.uid), building.rest);
    const ignoreCloaked = !stats.seesCloak;
    const targets = side.safe
      ? []
      : boatsInRange(building.x, building.y, stats.range, enemies, ignoreCloaked).slice(0, stats.targets || 1);
    const target = targets[0] || null;
    const wanted = target ? Math.atan2(target.y - building.y, target.x - building.x) : building.rest;

    gun.dir = turnToward(gun.dir, wanted, 1 - Math.exp(-dt * 9));
    gun.cool -= dt;

    const onTarget = Math.abs(Math.atan2(Math.sin(wanted - gun.dir), Math.cos(wanted - gun.dir))) < 0.2;
    if (target && onTarget && gun.cool <= 0) {
      // more damage per second reads as a faster rate of fire
      gun.cool = SHOT.cooldown[design] * (building.def.damage / stats.damage);
      const reach = building.def.size * (design === "sniper" ? 1.55 : 1.12);
      const side90 = gun.dir + Math.PI / 2;
      targets.forEach((aim, i) => {
        const offset = targets.length > 1 ? (i === 0 ? -0.24 : 0.24) * building.def.size : 0;
        const muzzleX = building.x + Math.cos(gun.dir) * reach + Math.cos(side90) * offset;
        const muzzleY = building.y + Math.sin(gun.dir) * reach + Math.sin(side90) * offset;
        fireShot(muzzleX, muzzleY, aim, design, stats.splash);
        burst(muzzleX, muzzleY, INK, 4, 60);
        // the top marksman shows its aim for a moment
        if (stats.seesCloak && stats.damage > building.def.damage) {
          battle.lines.push({ x1: muzzleX, y1: muzzleY, x2: aim.x, y2: aim.y, life: 1, fade: 6.5, dotted: true });
        }
        // a piercing shot leaves a trail through the target to the boat behind it
        if (stats.pierce) {
          const behind = boatsInRange(aim.x, aim.y, stats.pierce, enemies, ignoreCloaked).find(
            (b) => b !== aim && (b.x - aim.x) * (aim.x - building.x) + (b.y - aim.y) * (aim.y - building.y) > 0
          );
          if (behind) battle.lines.push({ x1: aim.x, y1: aim.y, x2: behind.x, y2: behind.y, life: 1, fade: 3.3, dotted: false });
        }
      });
    }
  }
}

function updateIslandAndBoatFire(side, enemies, dt) {
  if (side.safe) return;

  // the island defends its own coast
  const island = gunState(pieceKey(side.id, "island"), 0);
  island.cool -= dt;
  const intruder = nearestBoat(side.x, side.y, COMBAT.player.attackRange, enemies, false);
  if (intruder && island.cool <= 0) {
    island.cool = SHOT.cooldown.island;
    const a = Math.atan2(intruder.y - side.y, intruder.x - side.x);
    fireShot(side.x + Math.cos(a) * PLACE.startSize, side.y + Math.sin(a) * PLACE.startSize, intruder, "island");
  }

  if (!side.cannons) return;
  for (const boat of side.boats) {
    if (boat.kind === "soldier") continue;
    const gun = gunState(pieceKey(side.id, boat.uid), 0);
    gun.cool -= dt;
    const target = gun.cool <= 0 ? nearestAnything(boat.x, boat.y, boat.stat.range, enemies) : null;
    if (target) {
      gun.cool = SHOT.cooldown[boat.kind];
      fireShot(boat.x, boat.y, target, boat.kind);
    }
  }
}

/* Boats ramming enemy pieces throw off splinters at the point of contact. Only a
   few per frame: in a big brawl the screen would fill up, and the frame rate drop. */
const SPARKS_PER_FRAME = 12;
const PIECE_REACH = PLACE.buildRange + 40; // how far from its island a building can stand

function updateRamming(side, enemies, dt) {
  if (side.safe || battle.sparksLeft <= 0) return;

  const { w, h } = viewSize();
  const chance = dt * 7;

  for (const boat of side.boats) {
    if (Math.abs(boat.x - camera.x) > w / 2 + 60 || Math.abs(boat.y - camera.y) > h / 2 + 60) continue;
    if (Math.random() > chance) continue; // decide first: most frames throw no splinter at all

    const size = boat.stat.size;
    let hit = null;
    let hitSize = 0;
    const touch = (x, y, other) => {
      const reach = other + size;
      if (!hit && (x - boat.x) ** 2 + (y - boat.y) ** 2 <= reach * reach) {
        hit = { x, y };
        hitSize = other;
      }
    };

    for (const enemy of enemies) {
      if ((enemy.x - boat.x) ** 2 + (enemy.y - boat.y) ** 2 <= (PIECE_REACH + size) ** 2) {
        touch(enemy.x, enemy.y, COMBAT.player.baseRadius);
        for (const b of enemy.buildings) if (b.def) touch(b.x, b.y, b.def.size);
      }
      for (const other of enemy.boats) touch(other.x, other.y, other.stat.size);
      if (hit) break;
    }
    if (!hit) continue;

    const d = Math.hypot(hit.x - boat.x, hit.y - boat.y) || 1;
    burst(boat.x + ((hit.x - boat.x) / d) * size, boat.y + ((hit.y - boat.y) / d) * size, INK, 3, 90);
    if (--battle.sparksLeft <= 0) return;
  }
}

function updateBattle(dt) {
  battle.frame += 1;
  battle.sparksLeft = SPARKS_PER_FRAME;

  for (let i = battle.shots.length - 1; i >= 0; i--) {
    const shot = battle.shots[i];
    const step = SHOT.speed * dt;
    shot.x += shot.dx * step;
    shot.y += shot.dy * step;
    shot.left -= step;
    if (shot.left <= 0) {
      battle.shots.splice(i, 1);
      FX.wake.push({ x: shot.x, y: shot.y, r: 3, life: 0.8 });
      burst(shot.x, shot.y, INK, 3, 70);
      if (shot.splash) battle.rings.push({ x: shot.x, y: shot.y, r: shot.splash, life: 1 });
    }
  }

  for (let i = battle.lines.length - 1; i >= 0; i--) {
    battle.lines[i].life -= dt * battle.lines[i].fade;
    if (battle.lines[i].life <= 0) battle.lines.splice(i, 1);
  }

  for (let i = battle.rings.length - 1; i >= 0; i--) {
    battle.rings[i].life -= dt * 4; // gone in a quarter of a second
    if (battle.rings[i].life <= 0) battle.rings.splice(i, 1);
  }

  updateCoins(dt);

  for (let i = battle.blasts.length - 1; i >= 0; i--) {
    battle.blasts[i].life -= dt * battle.blasts[i].fade;
    if (battle.blasts[i].life <= 0) battle.blasts.splice(i, 1);
  }

  if (net.players.size === 0) return;

  const sides = collectSides();
  for (const side of sides) {
    const enemies = sides.filter((other) => other !== side && !other.safe);
    updateGuns(side, enemies, dt);
    updateIslandAndBoatFire(side, enemies, dt);
    updateRamming(side, enemies, dt);
  }

  // forget the guns of pieces that no longer exist, once in a while
  if (battle.frame % 300 === 0) {
    for (const [key, gun] of battle.guns) {
      if (gun.frame < battle.frame - 300) battle.guns.delete(key);
    }
  }
}

function drawBlast(blast) {
  const grow = 1 - blast.life;
  const r = blast.size * (0.55 + 0.75 * Math.sqrt(grow));
  const points = 11;

  ctx.save();
  ctx.globalAlpha = Math.min(1, blast.life * 2);
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + blast.spin;
    const radius = i % 2 === 0 ? r : r * 0.62;
    const x = blast.x + Math.cos(a) * radius;
    const y = blast.y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#E8A33A";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(blast.x, blast.y, r * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();
}

/* Upgraded gold windmills (level 3 and up) send a small coin up now and then;
   only their owner sees it. */
function updateCoins(dt) {
  for (const p of placement.placed) {
    if (p.path !== "A" || pieceLevel(p) < 3 || p.building.design !== "generator") continue;
    const left = (battle.coinTimers.get(p.uid) ?? Math.random() * 3) - dt;
    if (left > 0) {
      battle.coinTimers.set(p.uid, left);
      continue;
    }
    battle.coinTimers.set(p.uid, 3);
    battle.coins.push({ x: p.x + p.building.size * 0.6, y: p.y - p.building.size * 0.6, r: pieceLevel(p) >= 4 ? 5 : 3.5, life: 1 });
  }

  for (let i = battle.coins.length - 1; i >= 0; i--) {
    const coin = battle.coins[i];
    coin.life -= dt * 0.9;
    coin.y -= dt * 16;
    if (coin.life <= 0) battle.coins.splice(i, 1);
  }
}

/* A teal ripple under every boat that grapeshot slowed down. */
function drawSlowedBoats() {
  const now = performance.now();
  const mark = (x, y, size) => {
    ctx.beginPath();
    ctx.arc(x, y, size + 6, 0, Math.PI * 2);
    ctx.stroke();
  };

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = SLOW;
  ctx.setLineDash([5, 4]);
  for (const s of soldiers) {
    if (s.slowUntil > now) mark(s.x, s.y, UNIT_STATS[s.kind || "soldier"].size);
  }
  for (const rp of net.players.values()) {
    if (rp.id === net.id || rp.dead) continue;
    for (const s of rp.soldiers) {
      if (!s.sl) continue;
      const at = boatPosition(rp.id, s);
      mark(at.x, at.y, (COMBAT.units[s.kind] || COMBAT.soldier).size);
    }
  }
  ctx.restore();
}

function drawBattle() {
  drawSlowedBoats();

  for (const line of battle.lines) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, line.life);
    ctx.strokeStyle = INK;
    ctx.lineWidth = line.dotted ? 1.5 : 2.5;
    if (line.dotted) ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
    ctx.restore();
  }

  for (const ring of battle.rings) {
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r * (0.7 + 0.3 * (1 - ring.life)), 0, Math.PI * 2);
    ctx.fillStyle = colorWithAlpha(SPLASH, 0.25 * ring.life);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colorWithAlpha(SPLASH, ring.life);
    ctx.stroke();
  }

  ctx.fillStyle = INK;
  for (const shot of battle.shots) {
    const balls = shot.splash ? [[0, 0], [-3, 3], [3, 2]] : [[0, 0]];
    for (const [ox, oy] of balls) {
      ctx.beginPath();
      ctx.arc(shot.x + ox, shot.y + oy, shot.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (const coin of battle.coins) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, coin.life * 1.5);
    ctx.beginPath();
    ctx.arc(coin.x, coin.y, coin.r, 0, Math.PI * 2);
    inkFill(ctx, "#D9A62E", 1.5);
    ctx.restore();
  }

  for (const blast of battle.blasts) drawBlast(blast);
}

/* ---------- EXPLOSIONS (reported by the server) ---------- */

function explode(x, y, size, color) {
  battle.blasts.push({ x, y, size, life: 1, fade: size > 60 ? 1.5 : 2.6, spin: Math.random() * Math.PI });
  burst(x, y, color, Math.min(30, 8 + Math.floor(size / 3)), 120 + size * 2);
  burst(x, y, INK, 8, 100 + size);
}

function handleBattleEvents(events) {
  for (const event of events) {
    explode(event.x, event.y, event.size, event.color);

    const distance = Math.hypot(event.x - camera.x, event.y - camera.y);
    if (distance < 900) addShake(event.t === "base" ? 7 : event.t === "building" ? 2.5 : 1);

    if (event.t === "base" && event.owner === net.id) battle.sunkBy = event.killer;

    if (event.t === "base" && event.owner !== net.id) {
      const name = event.name || "Um capitão";
      showToast(event.killer === net.id ? "Você afundou a ilha de " + name + "!" : name + " naufragou", event.killer === net.id ? "good" : "");
    }
  }
}

/* ---------- ON-SCREEN NOTICES ---------- */

function showToast(text, kind) {
  const box = document.getElementById("toasts");
  if (!box) return;

  for (const old of box.children) {
    if (old.textContent === text) return; // already on screen
  }
  while (box.children.length >= 4) box.firstChild.remove();

  const toast = document.createElement("div");
  toast.className = "toast" + (kind ? " " + kind : "");
  toast.textContent = text;
  box.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

/* The screen edge flashes on every hit; the written warning comes only when an
   attack begins, not on every shot. */
function notifyIslandHit() {
  const edge = document.getElementById("damage-edge");
  if (edge) {
    edge.classList.remove("hit");
    void edge.offsetWidth; // restart the flash
    edge.classList.add("hit");
  }

  const now = performance.now();
  if (now - battle.lastAttackNotice > 10000) showToast("Sua ilha está sob ataque!", "bad");
  battle.lastAttackNotice = now;
}

function refreshIslandHealth() {
  const fill = document.getElementById("island-hp-fill");
  const value = document.getElementById("island-hp-value");
  if (!fill || !value) return;

  const hp = Math.ceil(state.playerHp);
  const frac = Math.max(0, hp / COMBAT.player.health);
  fill.style.width = frac * 100 + "%";
  fill.classList.toggle("low", frac <= 0.35);
  value.textContent = hp;
}
