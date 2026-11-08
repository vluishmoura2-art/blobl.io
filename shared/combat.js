"use strict";

/* =========================================================
   hightide.io - the rules of the game, used by server.js AND the
   browser, so what the player sees can't drift from what the
   server enforces.

   buildingStats is indexed exactly like BUILDINGS in main.js:
     0 Reef, 1 Cannon, 2 Windmill, 3 Hut,
     4 Long gun, 5 Arsenal, 6 Dock

   units is keyed by the unit `kind` the client/server exchange
   on soldiers: "soldier" (dinghy), "tank" (frigate), "siege" (galleon).

   Damage values are per second. To change the balance of the
   game, this is the file to edit.

   Upgrade prices follow one rule of thumb: per gold, a level gives at
   most about 4 times less than building another piece. Spreading out
   stays the cheaper choice early on, and a full island still has
   something worth buying.
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

  /* A building's stats at a level (1..4) on its chosen path: each level's
     changes are applied on top of the ones before it. The result is computed
     once per combination and shared (frozen), since it is read every frame. */
  const levelCache = new WeakMap();

  function levelStats(stat, level, path) {
    let byLevel = levelCache.get(stat);
    if (!byLevel) levelCache.set(stat, (byLevel = new Map()));
    const key = level + "|" + (path || "");
    let out = byLevel.get(key);
    if (!out) {
      out = { ...stat };
      const route = path && stat.paths && stat.paths[path];
      if (route) {
        for (const step of route.levels.slice(0, Math.min(level, 4) - 1)) Object.assign(out, step.stats);
      }
      byLevel.set(key, Object.freeze(out));
    }
    return out;
  }

  return {
    map: { width: 3000, height: 3000 },
    place,
    resolveDistance,
    isValidDistance,
    levelStats,
    maxLevel: 4,

    startGold: 200,
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
    boatLimits: { soldierBase: 3, tank: 6, siege: 3 }, // each hut adds its boatCap

    // Gold for destroying something (the rest of a building's bounty scales with its price).
    bounty: { soldier: 8, tank: 40, siege: 120, buildingRate: 0.25, island: 300 },

    // Research: reinforced hulls raise every boat's max hp by this factor...
    powerArmorMult: 1.5,
    // ...and new sails make frigates and galleons this much faster.
    boosterMult: 1.4,

    // Boats hit by a level-4 grapeshot cannon move at this share of their speed.
    slowFactor: 0.6,

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
      {
        role: "reef",
        type: 3,
        size: 30,
        cost: 15,
        health: 150,
        damage: 0,
        // 0 Reef
        paths: {
          A: {
            name: "Muralha de coral",
            summary: "Muito mais vida e, depois, se conserta sozinha.",
            levels: [
              { cost: 30, desc: "300 de vida", stats: { health: 300 } },
              { cost: 60, desc: "500 de vida, e se conserta 3/s", stats: { health: 500, selfRepair: 3 } },
              { cost: 120, desc: "800 de vida, e se conserta 6/s", stats: { health: 800, selfRepair: 6 } },
            ],
          },
          B: {
            name: "Recife cortante",
            summary: "Fere quem encosta e deixa lento quem passa perto.",
            levels: [
              { cost: 30, desc: "Fere os barcos que encostam (6/s)", stats: { thorns: 6 } },
              {
                cost: 70,
                desc: "12/s, e barcos próximos ficam 30% mais lentos",
                stats: { thorns: 12, slowRange: 75, slowMul: 0.7 },
              },
              { cost: 140, desc: "20/s, e a lentidão sobe para 50%", stats: { thorns: 20, slowMul: 0.5 } },
            ],
          },
        },
      },
      {
        role: "gun",
        type: 0,
        size: 29,
        cost: 40,
        health: 80,
        damage: 12,
        range: 170,
        targets: 1,
        // 1 Cannon. Upgrades: choose path A or B at level 2, then go on to 3 and 4.
        paths: {
          A: {
            name: "Bateria rápida",
            summary: "Mais dano e, no nível 4, dois alvos ao mesmo tempo.",
            levels: [
              { cost: 45, desc: "16 de dano/s", stats: { damage: 16 } },
              { cost: 75, desc: "20 de dano/s e alcance 180", stats: { damage: 20, range: 180 } },
              { cost: 200, desc: "26 de dano/s, em 2 alvos", stats: { damage: 26, targets: 2 } },
            ],
          },
          B: {
            name: "Metralha",
            summary: "O tiro também acerta os barcos em volta do alvo.",
            levels: [
              { cost: 70, desc: "Acerta em volta do alvo (raio 40)", stats: { splash: 40, splashRate: 0.6 } },
              { cost: 120, desc: "Raio 55", stats: { splash: 55 } },
              { cost: 220, desc: "Raio 70, e quem é atingido fica lento", stats: { splash: 70, slowSeconds: 1 } },
            ],
          },
        },
      },
      {
        role: "mill",
        type: 0,
        size: 32,
        cost: 50,
        health: 60,
        damage: 0,
        gold: 1, // per second
        // 2 Windmill
        paths: {
          A: {
            name: "Engenho de ouro",
            summary: "Rende cada vez mais ouro.",
            levels: [
              { cost: 60, desc: "1,5 de ouro/s", stats: { gold: 1.5 } },
              { cost: 90, desc: "2 de ouro/s", stats: { gold: 2 } },
              { cost: 200, desc: "3 de ouro/s", stats: { gold: 3 } },
            ],
          },
          B: {
            name: "Oficina de reparos",
            summary: "Conserta as construções próximas e, no nível 4, a ilha.",
            levels: [
              { cost: 70, desc: "120 de vida, conserta 3/s em volta", stats: { health: 120, repair: 3, repairRange: 120 } },
              { cost: 140, desc: "Conserta 6/s, em um raio maior", stats: { repair: 6, repairRange: 140 } },
              { cost: 260, desc: "Conserta 10/s, e a ilha 5/s", stats: { repair: 10, islandRepair: 5 } },
            ],
          },
        },
      },
      {
        role: "hut",
        type: 0,
        size: 30,
        cost: 40,
        health: 60,
        damage: 0,
        boatCap: 2, // extra dinghies this hut allows
        // 3 Hut
        paths: {
          A: {
            name: "Vila",
            summary: "Cada vez mais vagas para botes.",
            levels: [
              { cost: 50, desc: "+3 no limite de botes", stats: { boatCap: 3 } },
              { cost: 70, desc: "+4 no limite de botes", stats: { boatCap: 4 } },
              { cost: 110, desc: "+5 no limite de botes", stats: { boatCap: 5 } },
            ],
          },
          B: {
            name: "Escola de marujos",
            summary: "Barcos novos mais fortes. Vale a melhor escola, sem somar.",
            levels: [
              { cost: 80, desc: "+15% de vida nos barcos novos", stats: { crewHealth: 0.15 } },
              { cost: 160, desc: "+15% de vida e +15% de dano", stats: { crewDamage: 0.15 } },
              { cost: 300, desc: "+25% de vida e +25% de dano", stats: { crewHealth: 0.25, crewDamage: 0.25 } },
            ],
          },
        },
      },
      {
        role: "gun",
        type: 0,
        size: 32,
        cost: 110,
        health: 60,
        damage: 22,
        range: 250,
        // 4 Long gun
        paths: {
          A: {
            name: "Atirador de elite",
            summary: "Alcance cada vez maior; no nível 3, enxerga a Cortina de névoa.",
            levels: [
              { cost: 120, desc: "Alcance 280", stats: { range: 280 } },
              { cost: 220, desc: "Alcance 300, e enxerga barcos na névoa", stats: { range: 300, seesCloak: true } },
              { cost: 320, desc: "Alcance 320 e 30 de dano/s", stats: { range: 320, damage: 30 } },
            ],
          },
          B: {
            name: "Perfurante",
            summary: "Muito mais forte contra fragatas e galeões.",
            levels: [
              { cost: 130, desc: "+50% de dano em fragatas e galeões", stats: { heavyMult: 1.5 } },
              { cost: 180, desc: "+100% de dano neles", stats: { heavyMult: 2 } },
              { cost: 400, desc: "O tiro atravessa e acerta o barco de trás", stats: { pierce: 90 } },
            ],
          },
        },
      },
      { role: "arsenal", type: 0, size: 40, cost: 120, health: 120, damage: 0, limit: 1 }, // 5 Arsenal
      { role: "dock", type: 2, size: 34, cost: 120, health: 140, damage: 0, limit: 3 }, // 6 Dock
    ],
  };
});
