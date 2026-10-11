"use strict";

/* =========================================================
   Blobl.io - shared combat stats (used by server.js AND the
   browser clients, so health/damage values can't drift).

   buildingStats is indexed exactly like BUILDINGS in main.js:
     0 Wall, 1 Simple Turret, 2 Generator, 3 House,
     4 Sniper Turret, 5 Armory, 6 Tent (Barracks)
   ========================================================= */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.COMBAT = factory();
})(typeof self !== "undefined" ? self : this, function () {
  return {
    player: {
      health: 500, // the base
      damage: 20, // hits enemy soldiers in range
      baseRadius: 100, // matches PLACE.startSize
      attackRange: 130, // baseRadius + soldier contact pad
    },
    soldier: {
      health: 30,
      damage: 10, // to anything it collides with
      size: 18,
    },
    buildingStats: [
      { size: 30, health: 100, damage: 0 }, // 0 Wall
      { size: 29, health: 20, damage: 20, range: 180 }, // 1 Simple Turret
      { size: 32, health: 50, damage: 10 }, // 2 Generator
      { size: 30, health: 40, damage: 10 }, // 3 House
      { size: 32, health: 30, damage: 50, range: 240 }, // 4 Sniper
      { size: 40, health: 60, damage: 30 }, // 5 Armory (defined for alignment)
      { size: 34, health: 60, damage: 30 }, // 6 Tent (Barracks)
    ],
  };
});