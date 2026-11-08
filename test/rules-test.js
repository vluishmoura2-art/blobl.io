"use strict";

/* Rules test: runs the server's own rules on hand-made players, with no network,
   and checks every building upgrade: what each level does in combat, in the
   economy and in repairs, and that the server only sells upgrades by the rules.
   Run with: npm test */

const assert = require("assert");
const COMBAT = require("../shared/combat.js");
const { rules } = require("../server.js");
const { players, syncBuildings, combatTick, economyTick, boatLimit, crewOf, speedFactor } = rules;

const REEF = 0;
const GUN = 1;
const MILL = 2;
const HUT = 3;
const LONG_GUN = 4;
const stat = (b) => COMBAT.buildingStats[b];

let nextUid = 1;

function makePlayer(id, x, y, gold = 1e6) {
  const p = {
    id,
    x,
    y,
    name: id,
    color: "#000000",
    power: gold,
    buildings: [],
    soldiers: [],
    health: COMBAT.player.health,
    dead: false,
    deadUids: [],
    upgrades: 0,
    kills: 0,
    safe: false,
    pvp: true,
    lastStateAt: 0,
    sent: [], // the building list this player reports, like the browser does
  };
  players.set(id, p);
  return p;
}

/* Builds a piece the way a client does: first at level 1, then one report per
   upgrade request (the server charges the levels in between). */
function build(p, b, angle, dist, level, path) {
  const piece = { b, uid: nextUid++, x: p.x + Math.cos(angle) * dist, y: p.y + Math.sin(angle) * dist };
  p.sent.push(piece);
  syncBuildings(p, p.sent);
  if (level > 1) {
    piece.lv = level;
    piece.p = path;
    syncBuildings(p, p.sent);
  }
  return p.buildings.find((r) => r.uid === piece.uid);
}

function boat(owner, kind, x, y) {
  const s = COMBAT.units[kind];
  const rec = { uid: nextUid++, x, y, dir: 0, kind, size: s.size, stat: s, hp: 1e5, maxHp: 1e5 };
  owner.soldiers.push(rec);
  return rec;
}

/* Fresh pair of enemies, 1000 apart, so nothing from another case interferes. */
function arena() {
  players.clear();
  return { a: makePlayer("a", 1000, 1500), e: makePlayer("e", 2000, 1500) };
}

function near(actual, expected, label) {
  assert(Math.abs(actual - expected) < 0.01, label + ": expected " + expected + ", got " + actual);
}

function tick(seconds = 1) {
  combatTick(seconds);
}

const cases = [];
function check(name, fn) {
  cases.push([name, fn]);
}

/* ---------- cannon ---------- */

check("fast battery level 4 hits two boats, 26/s each", () => {
  const { a, e } = arena();
  const gun = build(a, GUN, 0, 180, 4, "A");
  const one = boat(e, "soldier", gun.x + 60, gun.y);
  const two = boat(e, "soldier", gun.x + 80, gun.y);
  const three = boat(e, "soldier", gun.x + 100, gun.y);
  tick();
  near(1e5 - one.hp, 26, "nearest");
  near(1e5 - two.hp, 26, "second");
  near(1e5 - three.hp, 0, "third is out of the two targets");
});

check("grapeshot splashes 60% around the target and slows at level 4", () => {
  const { a, e } = arena();
  const gun = build(a, GUN, 0, 180, 4, "B");
  const target = boat(e, "soldier", gun.x + 60, gun.y);
  const close = boat(e, "soldier", gun.x + 60, gun.y + 50);
  const far = boat(e, "soldier", gun.x + 60, gun.y + 100);
  tick();
  near(1e5 - target.hp, 12, "target");
  near(1e5 - close.hp, 12 * 0.6, "splash inside radius 70");
  near(1e5 - far.hp, 0, "outside the splash");
  near(speedFactor(target, Date.now()), COMBAT.slowFactor, "slowed");
});

/* ---------- long gun ---------- */

check("piercing level 3 doubles damage on frigates, not on dinghies", () => {
  const { a, e } = arena();
  const gun = build(a, LONG_GUN, 0, 200, 3, "B");
  const frigate = boat(e, "tank", gun.x + 100, gun.y);
  tick();
  near(1e5 - frigate.hp, 44, "frigate");
  frigate.x = 9999; // out of range
  const dinghy = boat(e, "soldier", gun.x + 100, gun.y);
  tick();
  near(1e5 - dinghy.hp, 22, "dinghy");
});

check("piercing level 4 also hits the boat behind the target, not one beside the gun", () => {
  const { a, e } = arena();
  const gun = build(a, LONG_GUN, 0, 200, 4, "B");
  const target = boat(e, "soldier", gun.x + 100, gun.y);
  const behind = boat(e, "soldier", gun.x + 170, gun.y);
  const before = boat(e, "soldier", gun.x + 40, gun.y + 300); // out of range, so not hit at all
  tick();
  near(1e5 - target.hp, 22, "target");
  near(1e5 - behind.hp, 22, "boat behind");
  near(1e5 - before.hp, 0, "unrelated boat");
});

check("only a marksman level 3+ fires through the fog curtain", () => {
  const { a, e } = arena();
  e.upgrades = COMBAT.upgradeFlags.cloak;
  const plain = build(a, LONG_GUN, 0, 200, 1, null);
  const frigate = boat(e, "tank", plain.x + 100, plain.y);
  tick();
  near(1e5 - frigate.hp, 0, "a plain long gun can't see it");

  const { a: a2, e: e2 } = arena();
  e2.upgrades = COMBAT.upgradeFlags.cloak;
  const scoped = build(a2, LONG_GUN, 0, 200, 3, "A");
  const seen = boat(e2, "tank", scoped.x + 280, scoped.y);
  tick();
  near(1e5 - seen.hp, 22, "scope sees it, at range 280");
});

/* ---------- reef ---------- */

check("cutting reef: thorns hurt touching boats; level 3 slows to 70%, level 4 to 50%", () => {
  const { a, e } = arena();
  const reef = build(a, REEF, 0, 250, 3, "B");
  const touching = boat(e, "soldier", reef.x + reef.size + 18, reef.y);
  const passing = boat(e, "soldier", reef.x, reef.y + 70);
  tick();
  near(1e5 - touching.hp, 12, "thorns");
  near(1e5 - passing.hp, 0, "not touching");
  near(speedFactor(passing, Date.now()), 0.7, "slow zone level 3");

  const { a: a2, e: e2 } = arena();
  const top = build(a2, REEF, 0, 250, 4, "B");
  const slowed = boat(e2, "soldier", top.x, top.y + 70);
  tick();
  near(speedFactor(slowed, Date.now()), 0.5, "slow zone level 4");
});

check("coral wall heals itself, never above its max", () => {
  const { a } = arena();
  const wall = build(a, REEF, 0, 250, 3, "A");
  near(wall.eff.health, 500, "level 3 health");
  wall.hp = 400;
  economyTick(1);
  near(wall.hp, 403, "self repair 3/s");
  wall.hp = 499;
  economyTick(1);
  near(wall.hp, 500, "capped at max");
});

/* ---------- windmill ---------- */

check("gold works level 4 makes 3 gold per second", () => {
  const { a } = arena();
  build(a, MILL, 0, 200, 4, "A");
  const before = a.power;
  economyTick(1);
  near(a.power - before, 3, "income");
});

check("repair workshop: best one in reach counts, island too at level 4", () => {
  const { a } = arena();
  build(a, MILL, 0, 200, 4, "B");
  build(a, MILL, 0.8, 200, 2, "B");
  const gun = build(a, GUN, 0.4, 140, 1, null); // within reach of both workshops
  assert(gun, "the cannon fits between the two workshops");
  gun.hp = 10;
  a.health = 900;
  economyTick(1);
  near(gun.hp, 20, "10/s from the best workshop, not 13");
  near(a.health, 905, "island repaired 5/s");
});

/* ---------- hut ---------- */

check("village level 4 raises the dinghy limit by 5", () => {
  const { a } = arena();
  build(a, HUT, 0, 200, 4, "A");
  build(a, HUT, 1, 200, 1, null);
  near(boatLimit(a, "soldier"), COMBAT.boatLimits.soldierBase + 5 + 2, "limit");
});

check("sailors' schools don't add up: the best one counts", () => {
  const { a, e } = arena();
  build(a, HUT, 0, 200, 2, "B");
  build(a, HUT, 1, 200, 4, "B");
  const crew = crewOf(a);
  near(crew.health, 0.25, "health bonus");
  near(crew.damage, 0.25, "damage bonus");
  near(crew.marks, 3, "hull marks");

  const target = build(e, GUN, Math.PI, 200, 1, null);
  target.hp = 1e5;
  boat(a, "soldier", target.x + target.size + 18, target.y);
  tick();
  near(1e5 - target.hp, 12 * 1.25, "trained crew damage");
});

/* ---------- buying upgrades ---------- */

check("levels are charged in order, the path is final, and bad requests do nothing", () => {
  players.clear();
  const p = makePlayer("buyer", 1500, 1500);
  const gun = build(p, GUN, 0, 180, 1, null);
  const piece = p.sent[0];

  const gold = p.power;
  piece.lv = 3;
  piece.p = "A";
  syncBuildings(p, p.sent);
  const levels = stat(GUN).paths.A.levels;
  near(gold - p.power, levels[0].cost + levels[1].cost, "levels 2 and 3 charged");
  assert.strictEqual(gun.level, 3);

  piece.lv = 4;
  piece.p = "B";
  syncBuildings(p, p.sent);
  assert.strictEqual(gun.path, "A", "a chosen path can't change");

  piece.lv = 9;
  syncBuildings(p, p.sent);
  assert.strictEqual(gun.level, 4, "never beyond level 4");

  const mill = build(p, MILL, 1, 200, 1, null);
  p.sent[1].lv = 2;
  p.sent[1].p = "Z";
  syncBuildings(p, p.sent);
  assert.strictEqual(mill.level, 1, "an unknown path is ignored");
});

check("an upgrade beyond the gold stops at what was paid for, and removal returns half", () => {
  players.clear();
  const costs = stat(REEF).paths.A.levels.map((l) => l.cost);
  const p = makePlayer("poor", 1500, 1500, stat(REEF).cost + costs[0] + 1);
  const reef = build(p, REEF, 0, 250, 1, null);
  p.sent[0].lv = 4;
  p.sent[0].p = "A";
  syncBuildings(p, p.sent);
  assert.strictEqual(reef.level, 2, "only level 2 was affordable");

  const before = p.power;
  p.sent = [];
  syncBuildings(p, p.sent);
  near(p.power - before, Math.floor((stat(REEF).cost + costs[0]) * COMBAT.refundRate), "half of everything paid");
});

/* ---------- run ---------- */

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL " + name + "\n       " + err.message);
  }
}
players.clear();

if (failed) {
  console.error("\n" + failed + " RULES CHECK(S) FAILED");
  process.exit(1);
}
console.log("\nALL RULES CHECKS PASSED (" + cases.length + ")\n");
process.exit(0);
