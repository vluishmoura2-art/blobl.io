"use strict";

/* =========================================================
   Maré Alta - the rules of the game, used by server.js AND the
   browser, so what the player sees can't drift from what the
   server enforces.

   buildingStats is indexed exactly like BUILDINGS in main.js:
     0 Reef, 1 Cannon, 2 Windmill, 3 Hut,
     4 Long gun, 5 Arsenal, 6 Dock

   units is keyed by the unit `kind` the client/server exchange
   on soldiers: "soldier" (dinghy), "tank" (frigate), "siege" (galleon).

   Damage values are per second. To change the balance of the
   game, this is the file to edit.
   ========================================================= */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.COMBAT = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const soldier = { health: 40, damage: 12, size: 18, speed: 150 };
  const tank = { health: 240, damage: 30, size: 26, speed: 100, range: 160 };
  const siege = { health: 900, damage: 70, size: 32, speed: 70, range: 200 };

  const place = {
    baseRadius: 100, // island radius
    buildRange: 275, // max build distance from the island's center
    gap: 8, // breathing room between pieces and the coast
    epsilon: 0.15, // keeps pieces just inside the limit
  };

  /* Clamp a building's distance from its island's center. Docks (type 2) sit on
     the outer ring; reefs (type 3) may stand just beyond the limit. */
  function resolveDistance(stat, dist) {
    const inner = stat.size + place.baseRadius + place.gap;
    if (stat.type === 2) return stat.size + place.buildRange;
    if (dist < inner) return inner;
    const outer = stat.type === 3 ? place.buildRange + stat.size : place.buildRange - stat.size - place.epsilon;
    return Math.min(dist, outer);
  }

  function isValidDistance(stat, dist) {
    return Math.abs(resolveDistance(stat, dist) - dist) <= 1;
  }

  return {
    map: { width: 3000, height: 3000 },
    place,
    resolveDistance,
    isValidDistance,

    startGold: 200,
    goldPerMill: 1, // per second
    refundRate: 0.5, // share of a building's price returned when removed

    player: {
      health: 1000, // the island
      damage: 15, // hits one enemy boat in range
      baseRadius: place.baseRadius,
      attackRange: 140, // radius + contact pad
    },

    soldier,
    tank,
    siege,
    units: { soldier, tank, siege },

    // How many boats of each class a captain can have at once.
    boatLimits: { soldierBase: 3, perHut: 2, tank: 6, siege: 3 },

    // Gold for destroying something (the rest of a building's bounty scales with its price).
    bounty: { soldier: 8, tank: 40, siege: 120, buildingRate: 0.25, island: 300 },

    // Research: reinforced hulls raise every boat's max hp by this factor...
    powerArmorMult: 1.5,
    // ...and new sails make frigates and galleons this much faster.
    boosterMult: 1.4,

    // Transit bitmask for the armory researches (relayed as player `u`).
    upgradeFlags: { armor: 1, booster: 2, cannons: 4, cloak: 8 },

    // Ordered research list (buy in this order by clicking the armory).
    armoryResearch: [
      { key: "armor", name: "Casco reforçado", cost: 300, desc: "+50% de vida para todos os barcos" },
      { key: "booster", name: "Velas novas", cost: 400, desc: "Fragatas e galeões ficam mais rápidos" },
      { key: "cannons", name: "Canhões de bordo", cost: 700, desc: "Fragatas e galeões atiram à distância" },
      { key: "cloak", name: "Cortina de névoa", cost: 1200, desc: "Canhões inimigos não veem fragatas nem galeões" },
    ],

    // Dock tiers. Index 1..4 (1 = base dock). tier i -> tier i+1 costs tents[i+1].cost.
    // Each tier defines what it builds and how often (seconds per boat).
    tents: [
      null, // 0 is unused (tier is 1-based)
      { name: "Cais", cost: 0, interval: 4.0, unit: "soldier" },
      { name: "Cais maior", cost: 350, interval: 2.5, unit: "soldier" },
      { name: "Estaleiro de fragatas", cost: 900, interval: 5.0, unit: "tank" },
      { name: "Estaleiro de galeões", cost: 1800, interval: 8.0, unit: "siege" },
    ],

    buildingStats: [
      { role: "reef", type: 3, size: 30, cost: 15, health: 150, damage: 0 }, // 0 Reef
      { role: "gun", type: 0, size: 29, cost: 40, health: 80, damage: 12, range: 170 }, // 1 Cannon
      { role: "mill", type: 0, size: 32, cost: 50, health: 60, damage: 0 }, // 2 Windmill
      { role: "hut", type: 0, size: 30, cost: 40, health: 60, damage: 0 }, // 3 Hut
      { role: "gun", type: 0, size: 32, cost: 110, health: 60, damage: 22, range: 250 }, // 4 Long gun
      { role: "arsenal", type: 0, size: 40, cost: 120, health: 120, damage: 0, limit: 1 }, // 5 Arsenal
      { role: "dock", type: 2, size: 34, cost: 120, health: 140, damage: 0, limit: 3 }, // 6 Dock
    ],
  };
});
