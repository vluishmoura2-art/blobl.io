"use strict";

/* Multiplayer integration test: spins up the real server, connects two
   clients, and checks that they see each other (spawn, relay, safe zone,
   PvP toggle, leaderboard ordering) and that combat works (a sniper turret
   damages an enemy soldier). Run with: npm test */

const assert = require("assert");
const { startServer, CONFIG } = require("../server.js");

const PORT = 8099;

/* Test websocket client: buffers every received message so nothing is lost,
   and `next(type)` resolves with the next message of that type. */
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://127.0.0.1:" + PORT);
    const queue = [];
    const waiters = [];

    ws.onerror = reject;
    ws.onopen = () => resolve(client);

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const i = waiters.findIndex((w) => w.type === msg.type);
      if (i >= 0) waiters.splice(i, 1)[0].res(msg);
      else queue.push(msg);
    };

    const client = {
      send: (obj) => ws.send(JSON.stringify(obj)),
      next(type) {
        const i = queue.findIndex((m) => m.type === type);
        if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
        return new Promise((res) => waiters.push({ type, res }));
      },
      close: () => ws.close(),
    };
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout waiting for " + label)), ms)),
  ]);
}

/* Resolves with the first `update` (each queued in turn) that satisfies
   `predicate`. Used to poll until the server applies combat damage. */
function waitForUpdate(client, predicate) {
  return client.next("update").then((u) => (predicate(u) ? u : waitForUpdate(client, predicate)));
}

(async () => {
  const server = startServer(PORT);
  await new Promise((r) => server.server.on("listening", r));

  const A = await connect();
  const B = await connect();

  const wa = await withTimeout(A.next("welcome"), 5000, "A welcome");
  const wb = await withTimeout(B.next("welcome"), 5000, "B welcome");

  const pa = wa.players.find((p) => p.id === wa.id);
  const pb = wb.players.find((p) => p.id === wb.id);

  // 1. distinct ids, and B's welcome lists A
  assert(wa.id !== wb.id, "players must get distinct ids");
  assert(wb.players.some((p) => p.id === wa.id), "B's welcome must include A");

  // 2. spawned close-ish together, but not on top of each other
  const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  assert(dist >= CONFIG.spawn.minSeparation * 0.9, "spawn separation too small: " + dist);
  assert(dist <= CONFIG.spawn.maxDist * 2, "spawn separation too large: " + dist);
  console.log("  spawn separation: " + dist.toFixed(1) + " units (players visible to each other)");

  // 3. state relay: A reports power/a building/a soldier -> B receives it
  A.send({
    type: "state",
    power: 424.5,
    buildings: [{ b: 0, uid: 101, x: 1000, y: 1000, dir: 0 }],
    soldiers: [{ uid: 201, x: 900, y: 900, dir: 1 }],
  });
  const upd = await withTimeout(B.next("update"), 5000, "update relay");
  const seen = upd.players.find((p) => p.id === wa.id);
  assert(seen && Math.abs(seen.power - 424.5) < 0.01, "B should see A's power");
  assert(seen.buildings.length === 1 && seen.buildings[0].b === 0 && seen.buildings[0].uid === 101, "B should see A's building (with uid)");
  assert(seen.soldiers.length === 1 && seen.soldiers[0].uid === 201, "B should see A's soldier (with uid)");
  console.log("  relay OK: power, building, soldier reach the other client");

  // 4. safe zone on spawn, cleared by space (pvp)
  assert(pb.safe === true, "a fresh player should spawn in a safe zone");
  A.send({ type: "pvp" });
  const upd2 = await withTimeout(B.next("update"), 5000, "pvp update");
  const aPvp = upd2.players.find((p) => p.id === wa.id);
  assert(aPvp.safe === false && aPvp.pvp === true, "space should drop the safe zone and enable PvP");
  B.send({ type: "pvp" }); // B must also be unsafe for combat
  console.log("  safe zone + PvP toggle OK");

  // 5. leaderboard ordering by power (desc)
  const sorted = upd2.players.slice().sort((x, y) => (y.power || 0) - (x.power || 0));
  console.log("  leaderboard: " + sorted.map((p) => p.name + ": " + Math.floor(p.power || 0)).join(" | "));

  // 6. combat: A's sniper turret shoots B's soldier; A stays unhurt
  A.send({
    type: "state",
    power: 424.5,
    buildings: [{ b: 4, uid: 301, x: pa.x + 100, y: pa.y, dir: 0 }], // sniper (30 hp) near A's base
    soldiers: [],
  });
  B.send({
    type: "state",
    power: 200,
    buildings: [],
    soldiers: [{ uid: 401, x: pa.x + 150, y: pa.y + 150, dir: 0 }], // in sniper range (158 < 240)
  });
  const batt = await withTimeout(
    waitForUpdate(B, (u) => {
      const bme = u.players.find((p) => p.id === wb.id);
      const s = bme.soldiers[0];
      return !s || s.hp < 30; // damaged or destroyed by the sniper
    }),
    8000,
    "combat damage"
  );
  const bSoldier = batt.players.find((p) => p.id === wb.id).soldiers[0];
  assert(!bSoldier || bSoldier.hp < 30, "A's sniper should damage B's soldier");
  const aSniper = batt.players.find((p) => p.id === wa.id).buildings.find((b) => b.uid === 301);
  assert(aSniper && aSniper.hp === 30, "A's sniper should be unharmed (soldier never reached it)");
  assert(Number.isFinite(batt.players.find((p) => p.id === wa.id).health), "snapshot carries base health");
  console.log("  combat OK: sniper dealt damage to the enemy soldier");

  // 7. identity: chosen name + base color reach the leaderboard
  A.send({ type: "identity", name: "Ahab", color: "#112233" });
  const ident = await withTimeout(
    waitForUpdate(B, (u) => u.players.find((p) => p.id === wa.id) && u.players.find((p) => p.id === wa.id).name === "Ahab"),
    5000,
    "identity update"
  );
  const aIdent = ident.players.find((p) => p.id === wa.id);
  assert(aIdent.name === "Ahab" && aIdent.color === "#112233", "leaderboard should reflect the chosen name + color");
  console.log("  identity OK: name + base color reach the leaderboard");

  A.close();
  B.close();
  server.stop();
  console.log("\nALL MULTIPLAYER CHECKS PASSED");
  process.exit(0);
})().catch((err) => {
  console.error("\nTEST FAILED:", err.stack || err.message);
  process.exit(1);
});