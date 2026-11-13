"use strict";

/* Multiplayer integration test: spins up the real server and plays by the same
   rules a browser does (reporting state 10 times per second). It checks that
   players see each other, that combat works, and that the server refuses
   cheats: invented gold, free or misplaced buildings, boats from nowhere and
   teleporting. Run with: npm test */

const assert = require("assert");
const { startServer, CONFIG } = require("../server.js");
const COMBAT = require("../shared/combat.js");

const PORT = 8099;
const REEF = 0;
const GUN = 1;
const MILL = 2;
const LONG_GUN = 4;
const ARSENAL = 5;
const DOCK = 6;

/* Test websocket client: buffers every received message so nothing is lost,
   `next(type)` resolves with the next message of that type, and `play` keeps
   reporting `state` at 10 Hz, like the real game. */
function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://127.0.0.1:" + PORT);
    const queue = [];
    const waiters = [];
    let timer = null;

    ws.onerror = reject;
    ws.onopen = () => resolve(client);

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const i = waiters.findIndex((w) => w.type === msg.type);
      if (i >= 0) waiters.splice(i, 1)[0].res(msg);
      else queue.push(msg);
    };

    const client = {
      state: { buildings: [], soldiers: [], u: 0 },
      send: (obj) => ws.send(JSON.stringify(obj)),
      next(type) {
        const i = queue.findIndex((m) => m.type === type);
        if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
        return new Promise((res) => waiters.push({ type, res }));
      },
      /* Skips anything older, so a check only ever sees fresh snapshots. */
      clearQueue: () => queue.splice(0, queue.length),
      play() {
        timer = setInterval(() => client.send({ type: "state", ...client.state }), 100);
      },
      close() {
        clearInterval(timer);
        ws.close();
      },
    };
  });
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout waiting for " + label)), ms)),
  ]);
}

function waitForUpdate(client, predicate) {
  return client.next("update").then((u) => (predicate(u) ? u : waitForUpdate(client, predicate)));
}

/* Waits until a player's snapshot satisfies `predicate` and returns that snapshot. */
function waitForPlayer(viewer, id, predicate, label, ms = 8000) {
  return withTimeout(
    waitForUpdate(viewer, (u) => predicate(u.players.find((p) => p.id === id))),
    ms,
    label
  ).then((u) => u.players.find((p) => p.id === id));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* A legal spot `dist` from an island's center, at `angle`. */
function polar(island, angle, dist) {
  return { x: island.x + Math.cos(angle) * dist, y: island.y + Math.sin(angle) * dist, dir: angle };
}

/* Where a dock launches its boats: just inside its own ring, as the game does. */
function launchPoint(island, dock, kind) {
  const dx = island.x - dock.x;
  const dy = island.y - dock.y;
  const len = Math.hypot(dx, dy);
  const reach = COMBAT.buildingStats[DOCK].size + COMBAT.units[kind].size + 4;
  return { x: dock.x + (dx / len) * reach, y: dock.y + (dy / len) * reach };
}

const dockDistance = COMBAT.place.buildRange + COMBAT.buildingStats[DOCK].size;

(async () => {
  // small, predictable spawn ring; plenty of gold for everything except the cheat tests
  CONFIG.spawn.minDist = 260;
  CONFIG.spawn.maxDist = 260;
  CONFIG.startPower = 50000;
  const realHealth = COMBAT.player.health;
  COMBAT.player.health = 1; // so step 10 can sink an island with a single boat

  const server = startServer(PORT);
  await new Promise((r) => server.server.on("listening", r));

  const A = await connect();
  const B = await connect();
  const wa = await withTimeout(A.next("welcome"), 5000, "A welcome");
  const wb = await withTimeout(B.next("welcome"), 5000, "B welcome");
  COMBAT.player.health = realHealth;

  const pa = wa.players.find((p) => p.id === wa.id);
  const pb = wb.players.find((p) => p.id === wb.id);
  const towardB = Math.atan2(pb.y - pa.y, pb.x - pa.x);
  const towardA = towardB + Math.PI;

  // 1. distinct ids, and B's welcome lists A; the welcome says the server's version
  assert(wa.id !== wb.id, "players must get distinct ids");
  assert(wa.version === require("../shared/version.js"), "the welcome must carry the game version");
  assert(wb.players.some((p) => p.id === wa.id), "B's welcome must include A");

  // 2. spawned close-ish together, but not on top of each other
  const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  assert(dist >= CONFIG.spawn.minSeparation * 0.9, "spawn separation too small: " + dist);
  console.log("  spawn separation: " + dist.toFixed(1) + " units");

  // 3. relay: B sees A's buildings; the server charges for them, whatever A claims about its gold
  A.state.power = 999999;
  A.state.buildings = [
    { b: REEF, uid: 101, ...polar(pa, towardB + 2.4, 200) },
    { b: DOCK, uid: 102, ...polar(pa, towardB + 1.5, dockDistance), t: 2 },
  ];
  A.play();
  B.play();
  const seen = await waitForPlayer(B, wa.id, (p) => p.buildings.some((b) => b.t === 2), "building relay");
  assert(seen.buildings.find((b) => b.uid === 101).b === REEF, "B should see A's reef");
  assert(seen.buildings.find((b) => b.uid === 102).t === 2, "dock upgrade should relay");
  const charged = 50000 - COMBAT.buildingStats[REEF].cost - COMBAT.buildingStats[DOCK].cost - COMBAT.tents[2].cost;
  assert(Math.abs(seen.power - charged) < 1, "the server should keep the gold: " + seen.power + " vs " + charged);
  console.log("  relay OK: B sees A's pieces; A was charged and its claimed gold ignored");

  // 4. safe zone on spawn, cleared by space (pvp)
  assert(pb.safe === true, "a fresh player should spawn in a safe zone");
  A.send({ type: "pvp" });
  B.send({ type: "pvp" });
  const aPvp = await waitForPlayer(B, wa.id, (p) => p.pvp, "pvp update");
  assert(aPvp.safe === false, "space should drop the safe zone");
  console.log("  safe zone + PvP toggle OK");

  // 5. a boat has to be built at a dock: B's dock launches a dinghy, and A's long gun hits it
  const dockB = { b: DOCK, uid: 201, ...polar(pb, towardA, dockDistance), t: 1 };
  B.state.buildings = [dockB];
  const gunSpot = polar(pa, towardB + 0.7, COMBAT.place.buildRange - COMBAT.buildingStats[LONG_GUN].size - 1);
  A.state.buildings = [...A.state.buildings, { b: LONG_GUN, uid: 103, ...gunSpot }];
  B.state.soldiers = [{ uid: 301, ...launchPoint(pb, dockB, "soldier"), dir: 0, kind: "soldier" }];
  await waitForPlayer(B, wb.id, (p) => p.soldiers.some((s) => s.uid === 301), "dinghy launched");
  await waitForPlayer(B, wb.id, (p) => !p.soldiers.some((s) => s.uid === 301), "dinghy sunk by the long gun");
  const aAfter = await waitForPlayer(B, wa.id, (p) => p.kills >= 1, "kill credited");
  assert(aAfter.buildings.find((b) => b.uid === 103).hp === COMBAT.buildingStats[LONG_GUN].health, "the gun was never touched");
  console.log("  combat OK: a long gun sank the enemy dinghy, and got the kill");

  // 6. upgrade the dock: a frigate comes out, and the gun damages it
  dockB.t = 3;
  B.state.soldiers = [{ uid: 302, ...launchPoint(pb, dockB, "tank"), dir: 0, kind: "tank" }];
  await waitForPlayer(
    B,
    wb.id,
    (p) => p.soldiers.some((s) => s.uid === 302 && s.hp < COMBAT.tank.health),
    "frigate damaged",
    12000
  );
  console.log("  frigate OK: built after the dock upgrade, and damaged by the gun");

  // 7. cloak: research in order at an arsenal; enemy cannons then ignore the frigate
  B.state.buildings = [dockB, { b: ARSENAL, uid: 202, ...polar(pb, towardA + 1.6, 160) }];
  B.state.u = 15;
  const cloaked = await waitForPlayer(B, wb.id, (p) => p.u === 15, "research done");
  const hpBefore = cloaked.soldiers.find((s) => s.uid === 302).hp;
  await sleep(600);
  B.clearQueue();
  const stillCloaked = await withTimeout(B.next("update"), 3000, "cloak update");
  const hpAfter = stillCloaked.players.find((p) => p.id === wb.id).soldiers.find((s) => s.uid === 302).hp;
  assert(hpAfter >= hpBefore - 3, "cloaked frigates must not be targeted: " + hpBefore + " -> " + hpAfter);
  console.log("  cloak OK: cannons leave the cloaked frigate alone");

  // 8. identity: chosen name + flag reach the leaderboard
  A.send({ type: "identity", name: "Ahab", color: "#112233" });
  const aIdent = await waitForPlayer(B, wa.id, (p) => p.name === "Ahab", "identity update");
  assert(aIdent.color === "#112233", "the chosen flag should reach everyone");
  console.log("  identity OK: name + flag reach the leaderboard");

  // 8b. upgrades: levels are charged one by one, and the path never changes
  const cannon = { b: GUN, uid: 104, ...polar(pa, towardB - 2.0, 190) };
  const mill = { b: MILL, uid: 105, ...polar(pa, towardB - 1.0, 190) };
  A.state.buildings = [...A.state.buildings, cannon, mill];
  const beforeUpgrades = await waitForPlayer(B, wa.id, (p) => p.buildings.some((b) => b.uid === 105), "cannon and mill built");
  cannon.lv = 3;
  cannon.p = "A";
  mill.lv = 4;
  mill.p = "B";
  const upgraded = await waitForPlayer(
    B,
    wa.id,
    (p) => p.buildings.some((b) => b.uid === 104 && b.lv === 3) && p.buildings.some((b) => b.uid === 105 && b.lv === 4),
    "upgrades applied"
  );
  const gunPath = COMBAT.buildingStats[GUN].paths.A.levels;
  const millPath = COMBAT.buildingStats[MILL].paths.B.levels;
  const upgradeCost = gunPath[0].cost + gunPath[1].cost + millPath.reduce((sum, l) => sum + l.cost, 0);
  assert(upgraded.power <= beforeUpgrades.power - upgradeCost + 5, "every level must be charged");
  assert(upgraded.buildings.find((b) => b.uid === 105).p === "B", "the mill should be on path B");
  cannon.lv = 4;
  cannon.p = "B";
  const switched = await waitForPlayer(B, wa.id, (p) => p.buildings.some((b) => b.uid === 104 && b.lv === 4), "cannon level 4");
  assert(switched.buildings.find((b) => b.uid === 104).p === "A", "a chosen path can't be changed");
  console.log("  upgrades OK: levels are charged in order and the path is final");

  // 8c. a scoped long gun (marksman, level 3) sees the cloaked frigate again
  const scoped = A.state.buildings.find((b) => b.uid === 103);
  const frigateBefore = (await withTimeout(B.next("update"), 3000, "frigate hp"))
    .players.find((p) => p.id === wb.id)
    .soldiers.find((s) => s.uid === 302).hp;
  scoped.lv = 3;
  scoped.p = "A";
  await waitForPlayer(
    B,
    wb.id,
    (p) => p.soldiers.some((s) => s.uid === 302 && s.hp < frigateBefore - 5),
    "scope sees the fog curtain"
  );
  A.state.buildings = A.state.buildings.filter((b) => b.uid !== 103); // keep the frigate alive for step 10
  console.log("  scope OK: a marksman long gun fires through the fog curtain");

  // 9. cheats, from a player with the normal starting gold
  CONFIG.startPower = COMBAT.startGold;
  const C = await connect();
  const wc = await withTimeout(C.next("welcome"), 5000, "C welcome");
  const pc = wc.players.find((p) => p.id === wc.id);
  const stat = (b) => COMBAT.buildingStats[b];
  C.play();

  // invented gold is ignored; a fortress beyond its budget is mostly refused
  C.state.power = 1e9;
  C.state.buildings = [
    { b: DOCK, uid: 401, ...polar(pc, 0, dockDistance), t: 1 },
    { b: DOCK, uid: 402, ...polar(pc, 2, dockDistance), t: 1 },
    { b: DOCK, uid: 403, ...polar(pc, 4, dockDistance), t: 1 },
  ];
  let cNow = await waitForPlayer(C, wc.id, (p) => p.buildings.length > 0, "C's first dock");
  await sleep(300);
  C.clearQueue();
  cNow = (await withTimeout(C.next("update"), 3000, "C update")).players.find((p) => p.id === wc.id);
  assert(cNow.buildings.length === 1, "only one dock is affordable, got " + cNow.buildings.length);
  assert(cNow.power < COMBAT.startGold, "gold can't be invented: " + cNow.power);

  // upgrades and research that weren't paid for don't happen
  C.state.buildings = [{ b: DOCK, uid: 401, ...polar(pc, 0, dockDistance), t: 4 }];
  C.state.u = 15;
  await sleep(300);
  C.clearQueue();
  cNow = (await withTimeout(C.next("update"), 3000, "C update")).players.find((p) => p.id === wc.id);
  assert(cNow.buildings[0].t === 1, "an unpaid dock upgrade must be refused");
  assert(cNow.u === 0, "research needs an arsenal and gold");

  // buildings out of reach, or on top of each other, are refused
  const dockC = { b: DOCK, uid: 401, ...polar(pc, 0, dockDistance), t: 1 };
  C.state.u = 0;
  C.state.buildings = [
    dockC,
    { b: GUN, uid: 404, ...polar(pc, 1, COMBAT.place.buildRange + 400) }, // far beyond C's reach
    { b: REEF, uid: 405, ...polar(pc, 3, 200) },
    { b: REEF, uid: 406, ...polar(pc, 3.02, 200) },
  ];
  await sleep(300);
  C.clearQueue();
  cNow = (await withTimeout(C.next("update"), 3000, "C update")).players.find((p) => p.id === wc.id);
  assert(!cNow.buildings.some((b) => b.uid === 404), "a cannon out of reach must be refused");
  assert(cNow.buildings.some((b) => b.uid === 405), "a legal reef should be built");
  assert(!cNow.buildings.some((b) => b.uid === 406), "an overlapping reef must be refused");
  C.state.buildings = C.state.buildings.filter((b) => b.uid !== 404 && b.uid !== 406);

  // an upgrade beyond the player's gold, or on a path that doesn't exist, is refused
  const cheapGun = { b: GUN, uid: 407, ...polar(pc, 1.2, 190) };
  C.state.buildings = [...C.state.buildings, cheapGun];
  await waitForPlayer(C, wc.id, (p) => p.buildings.some((b) => b.uid === 407), "C's cannon");
  cheapGun.lv = 2;
  cheapGun.p = "Z";
  await sleep(300);
  cheapGun.lv = 4;
  cheapGun.p = "A";
  await sleep(300);
  C.clearQueue();
  cNow = (await withTimeout(C.next("update"), 3000, "C update")).players.find((p) => p.id === wc.id);
  assert(!cNow.buildings.find((b) => b.uid === 407).lv, "an unaffordable upgrade must be refused");

  // a boat from nowhere is refused; one launched at the dock can't teleport
  C.state.soldiers = [{ uid: 501, x: pb.x, y: pb.y, dir: 0, kind: "siege" }];
  await sleep(500);
  C.clearQueue();
  cNow = (await withTimeout(C.next("update"), 3000, "C update")).players.find((p) => p.id === wc.id);
  assert(cNow.soldiers.length === 0, "a galleon with no shipyard must be refused");

  const launch = launchPoint(pc, dockC, "soldier");
  C.state.soldiers = [{ uid: 502, ...launch, dir: 0, kind: "soldier" }];
  await waitForPlayer(C, wc.id, (p) => p.soldiers.some((s) => s.uid === 502), "C's dinghy launched");
  C.state.soldiers = [{ uid: 502, x: pb.x, y: pb.y, dir: 0, kind: "soldier" }];
  await sleep(300);
  C.clearQueue();
  cNow = (await withTimeout(C.next("update"), 3000, "C update")).players.find((p) => p.id === wc.id);
  const moved = cNow.soldiers[0];
  const travelled = Math.hypot(moved.x - launch.x, moved.y - launch.y);
  assert(travelled < 300, "a dinghy can't teleport: it went " + travelled.toFixed(0));
  C.state.soldiers = [{ uid: 502, x: moved.x, y: moved.y, dir: 0, kind: "soldier" }];

  // removing a building returns half its price
  const goldBefore = cNow.power;
  C.state.buildings = C.state.buildings.filter((b) => b.uid !== 405);
  await sleep(300);
  C.clearQueue();
  cNow = (await withTimeout(C.next("update"), 3000, "C update")).players.find((p) => p.id === wc.id);
  const refund = Math.floor(stat(REEF).cost * COMBAT.refundRate);
  assert(Math.abs(cNow.power - goldBefore - refund) < 1, "refund should be half the price");
  console.log("  cheats OK: gold, purchases, placement, boats and teleports are enforced");
  C.close();

  // 9b. chat: everyone gets each line, trimmed to 120 letters, filtered, and rate limited
  A.clearQueue();
  B.clearQueue();
  const D = await connect();
  const wd = await withTimeout(D.next("welcome"), 5000, "D welcome");
  D.send({ type: "identity", name: "M3rda Barba", color: "#334455" });
  const joined = await withTimeout(A.next("chat-notice"), 3000, "join notice");
  assert(joined.kind === "join" && joined.id === wd.id, "A should hear that D arrived");
  assert(joined.name === "***** Barba", "a bad word in a name must be starred out: " + joined.name);

  D.send({ type: "chat", text: "  bom   dia,\n capitães  " });
  const hello = await withTimeout(B.next("chat"), 3000, "chat line");
  assert(hello.id === wd.id && hello.text === "bom dia, capitães", "the line reaches everyone, on one line: " + hello.text);
  assert((await withTimeout(D.next("chat"), 3000, "own chat line")).text === hello.text, "the sender sees their line too");
  assert((await withTimeout(A.next("chat"), 3000, "A's chat line")).text === hello.text, "every captain gets the line");

  D.send({ type: "chat", text: "que p0rr4, vai tomar no cu! cuidado com o computador" });
  const rude = await withTimeout(A.next("chat"), 3000, "filtered line");
  assert(rude.text === "que *****, vai tomar no **! cuidado com o computador", "bad words are starred out: " + rude.text);

  D.send({ type: "chat", text: "x".repeat(300) });
  const long = await withTimeout(A.next("chat"), 3000, "long line");
  assert(long.text.length === 120, "a line is cut at 120 letters, not " + long.text.length);

  D.send({ type: "chat", text: "   " }); // nothing to say: not sent, and no token spent
  for (let i = 0; i < 4; i++) D.send({ type: "chat", text: "spam " + i });
  const refused = await withTimeout(D.next("chat-refused"), 3000, "rate limit");
  assert(refused.reason === "rate" && refused.wait > 0, "a fast sender is told to wait");
  await sleep(300);
  const spam = [];
  for (let m; (m = await Promise.race([A.next("chat"), sleep(50)])); ) spam.push(m.text);
  assert(spam.length < 4, "a fast sender can't post every line: " + spam.length + " got through");

  D.close();
  const left = await withTimeout(A.next("chat-notice"), 3000, "leave notice");
  assert(left.kind === "leave" && left.id === wd.id, "A should hear that D left");
  console.log("  chat OK: relayed to all, one line of 120 letters, filtered, rate limited, joins and leaves");

  // 10. a destroyed island is reported, naming who destroyed it (A has 1 hp for this test)
  B.state.soldiers = [{ uid: 302, ...polar(pa, towardB, 110), dir: 0, kind: "tank" }];
  const sinking = await withTimeout(
    waitForUpdate(B, (u) => u.events.some((e) => e.t === "base")),
    25000,
    "island destroyed event"
  );
  const sunk = sinking.events.find((e) => e.t === "base");
  assert(sunk.owner === wa.id && sunk.killer === wb.id, "the event should name the island and who sank it");
  assert(sinking.players.find((p) => p.id === wa.id).dead, "the island's owner should be dead");
  assert(sinking.events.some((e) => e.t === "building"), "the island's buildings should be reported as destroyed too");
  console.log("  events OK: the sinking of an island reaches the other client");

  A.close();
  B.close();
  server.stop();
  console.log("\nALL MULTIPLAYER CHECKS PASSED");
  process.exit(0);
})().catch((err) => {
  console.error("\nTEST FAILED:", err.stack || err.message);
  process.exit(1);
});
