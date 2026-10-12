"use strict";

/* =========================================================
   Blobl.io - shared combat stats (used by server.js AND the
   browser clients, so health/damage values can't drift).

   buildingStats is indexed exactly like BUILDINGS in main.js:
     0 Wall, 1 Simple Turret, 2 Generator, 3 House,
     4 Sniper Turret, 5 Armory, 6 Tent (Barracks)

   units is keyed by the unit `kind` the client/server exchange
   on soldiers: "soldier", "tank", "siege" (siege tank).
   ========================================================= */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.COMBAT = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const soldier = { health: 30, damage: 10, size: 18, speed: 150 };
  const tank = { health: 250, damage: 50, size: 26, speed: 90, range: 150 };
  const siege = { health: 1500, damage: 100, size: 32, speed: 65, range: 180 };

  return {
    player: {
      health: 500, // the base
      damage: 20, // hits enemy units in range
      baseRadius: 100, // matches PLACE.startSize
      attackRange: 130, // baseRadius + contact pad
    },
    soldier,
    tank,
    siege,
    units: { soldier, tank, siege },

    // Armory research: Power Armor raises every unit's max hp by this factor.
    powerArmorMult: 1.5,

    // Transit bitmask for the armory researches (relayed as player `u`).
    upgradeFlags: { armor: 1, booster: 2, cannons: 4, cloak: 8 },

    // Ordered research list (buy in this order by clicking the armory).
    armoryResearch: [
      { key: "armor", name: "Power Armor", cost: 500, desc: "+50% armor for soldiers and tanks" },
      { key: "booster", name: "Booster Engines", cost: 600, desc: "Tanks move faster" },
      { key: "cannons", name: "Panzer Cannons", cost: 1000, desc: "Tanks become ranged units" },
      { key: "cloak", name: "Cloaking Device", cost: 2000, desc: "Enemy towers can't target your tanks" },
    ],

    // Tent tiers. Index 1..4 (1 = base tent). tier i -> tier i+1 costs tents[i+1].cost.
    // Each tier defines what it spawns and how often (seconds per unit).
    tents: [
      null, // 0 is unused (tier is 1-based)
      { name: "Tent", cost: 0, interval: 3.5, unit: "soldier" },
      { name: "Greater Barracks", cost: 500, interval: 2.0, unit: "soldier" },
      { name: "Tank Factory", cost: 2000, interval: 4.0, unit: "tank" },
      { name: "Siege Foundry", cost: 3000, interval: 6.0, unit: "siege" },
    ],

    buildingStats: [
      { size: 30, health: 100, damage: 0 }, // 0 Wall
      { size: 29, health: 20, damage: 20, range: 180 }, // 1 Simple Turret
      { size: 32, health: 50, damage: 10 }, // 2 Generator
      { size: 30, health: 40, damage: 10 }, // 3 House
      { size: 32, health: 30, damage: 50, range: 240 }, // 4 Sniper
      { size: 40, health: 60, damage: 0 }, // 5 Armory (research hub, no weapons)
      { size: 34, health: 60, damage: 0 }, // 6 Tent (Barracks)
    ],
  };
});