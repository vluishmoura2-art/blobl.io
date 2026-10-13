"use strict";

/* =========================================================
   Blobl.io - achievements

   - A scrollable sidebar (center-right) lists every achievement,
     ticking upward from bottom to top so the whole list can be read.
   - Locked rows: white background, black border, black text.
   - Unlocked rows: red background, black border, white text.
   - Progress is stored in localStorage, so unlocks survive reloads.

   Progress is derived from the live game state each tick:
     Passive     net safe-zone expires on its own (no space press)
     PvP         space toggled (hooked in net.js)
     Power       >= 5 generators placed
     Very powerful >= 10 generators placed
     You're a monster our units reach an enemy base / building
     OP          one of every building type placed
     Flexible    a swap actually exchanged two buildings (hooked in main.js)
     Amateur / You're really good / Pro /
     You're not a normal player / WHAT   kill milestones (server-relayed)
   ========================================================= */

const ACHIEVEMENTS = [
  { id: "passive", name: "Passive", desc: "Wait for the safe mode timer to finish" },
  { id: "pvp", name: "PvP", desc: "Press space" },
  { id: "power", name: "Power", desc: "Build 5 generators" },
  { id: "very-powerful", name: "Very powerful", desc: "10 generators built" },
  { id: "monster", name: "You're a monster", desc: "When attacking a player's base or pieces" },
  { id: "op", name: "OP", desc: "When you build a base with all types of pieces" },
  { id: "flexible", name: "Flexible", desc: "When using swap" },
  { id: "amateur", name: "Amateur", desc: "Destroy 5 kills" },
  { id: "good", name: "You're really good", desc: "Destroy 20 kills" },
  { id: "pro", name: "Pro", desc: "Destroy 50 kills" },
  { id: "not-normal", name: "You're not a normal player", desc: "Destroy 100 kills" },
  { id: "what", name: "WHAT", desc: "Destroy 1000 kills" },
];

const ACH_STORAGE_KEY = "blobl.achievements.v1";
const ACH_TAG_KEY = "blobl.achievementTag.v1";
const ACH_COLOR = "#e03b3b";

const achievements = {
  unlocked: new Set(),
  tag: null, // id of the earned achievement shown on the base (one only)
};

/* ---------- persistence ---------- */

function loadAchievements() {
  try {
    const raw = localStorage.getItem(ACH_STORAGE_KEY);
    if (!raw) return;
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return;
    for (const id of ids) {
      if (ACHIEVEMENTS.some((a) => a.id === id)) achievements.unlocked.add(id);
    }
  } catch {
    /* corrupt / unavailable storage: start fresh */
  }
}

function saveAchievements() {
  try {
    localStorage.setItem(ACH_STORAGE_KEY, JSON.stringify([...achievements.unlocked]));
  } catch {
    /* private mode / quota: keep playing without persistence */
  }
}

function isAchievementUnlocked(id) {
  return achievements.unlocked.has(id);
}

function getAchievementName(id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  return a ? a.name : null;
}

/* ---------- tag (one earned achievement shown under the base name) ---------- */

function loadTag() {
  try {
    const id = localStorage.getItem(ACH_TAG_KEY);
    achievements.tag = id && isAchievementUnlocked(id) ? id : null;
  } catch {
    achievements.tag = null;
  }
}

function saveTag() {
  try {
    if (achievements.tag) localStorage.setItem(ACH_TAG_KEY, achievements.tag);
    else localStorage.removeItem(ACH_TAG_KEY);
  } catch {
    /* no-op */
  }
}

/* A tag is only accepted when it is actually earned; anything else clears it. */
function setAchievementTag(id) {
  achievements.tag = id && isAchievementUnlocked(id) ? id : null;
  saveTag();
  if (typeof PROFILE === "object" && PROFILE) PROFILE.tag = achievements.tag;
}

/* ---------- unlocking ---------- */

function unlockAchievement(id) {
  if (achievements.unlocked.has(id)) return false;
  if (!ACHIEVEMENTS.some((a) => a.id === id)) return false;

  achievements.unlocked.add(id);
  saveAchievements();
  markAchievementRowDone(id);

  if (typeof Sfx !== "undefined") {
    Sfx.play("connect", 0.75);
    setTimeout(() => Sfx.play("place", 0.5), 90);
  }
  if (typeof burst === "function" && typeof PLAYER === "object" && PLAYER) {
    burst(PLAYER.x, PLAYER.y - PLACE.startSize, ACH_COLOR, 16, 150);
  }
  return true;
}

/* ---------- rendering ---------- */

function escapeAchievementText(s) {
  if (typeof escapeHtml === "function") return escapeHtml(s);
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function achievementRowHtml(a) {
  const done = isAchievementUnlocked(a.id) ? " done" : "";
  return (
    '<div class="ach-row' + done + '" data-id="' + a.id + '">' +
    '<span class="ach-name">' + escapeAchievementText(a.name) + "</span>" +
    '<span class="ach-desc">' + escapeAchievementText(a.desc) + "</span>" +
    "</div>"
  );
}

function renderAchievements() {
  const track = document.getElementById("achievements-track");
  if (!track) return;

  // doubled so the CSS marquee can loop seamlessly (translateY -50%)
  const rows = ACHIEVEMENTS.map(achievementRowHtml).join("");
  const set = '<div class="ach-set">' + rows + "</div>";
  track.innerHTML = set + set;
}

function markAchievementRowDone(id) {
  const rows = document.querySelectorAll('.ach-row[data-id="' + id + '"]');
  for (const row of rows) {
    row.classList.add("done");
    row.classList.remove("flash");
    void row.offsetWidth; // restart the flash animation
    row.classList.add("flash");
  }
}

/* ---------- live checks ---------- */

function checkGeneratorAchievements() {
  if (typeof countGenerators !== "function") return;
  const n = countGenerators();
  if (n >= 5) unlockAchievement("power");
  if (n >= 10) unlockAchievement("very-powerful");
}

function checkAllPiecesAchievement() {
  if (typeof BUILDINGS === "undefined" || typeof placement !== "object" || !placement) return;
  if (!Array.isArray(placement.placed)) return;

  const placed = new Set();
  for (const p of placement.placed) placed.add(p.building.name);
  if (BUILDINGS.every((b) => placed.has(b.name))) unlockAchievement("op");
}

function checkKillAchievements() {
  const kills = (typeof state === "object" && state && state.kills) || 0;
  if (kills >= 5) unlockAchievement("amateur");
  if (kills >= 20) unlockAchievement("good");
  if (kills >= 50) unlockAchievement("pro");
  if (kills >= 100) unlockAchievement("not-normal");
  if (kills >= 1000) unlockAchievement("what");
}

/* Our units have reached an enemy base or building (i.e. we are attacking). */
function checkMonsterAchievement() {
  if (isAchievementUnlocked("monster")) return;
  if (typeof net !== "object" || !net || !(net.players instanceof Map)) return;
  if (!Array.isArray(soldiers) || typeof COMBAT === "undefined") return;

  const baseRadius = COMBAT.player.baseRadius;

  for (const rp of net.players.values()) {
    if (rp.id === net.id || rp.safe || rp.dead) continue;

    for (const s of soldiers) {
      const kind = s.kind || "soldier";
      const stat = (typeof UNIT_STATS === "object" && UNIT_STATS && UNIT_STATS[kind]) || COMBAT.soldier;
      const size = stat.size || 18;

      if (Math.hypot(s.x - rp.x, s.y - rp.y) <= baseRadius + size) {
        unlockAchievement("monster");
        return;
      }

      if (Array.isArray(rp.buildings)) {
        for (const rb of rp.buildings) {
          const bd = BUILDINGS[rb.b];
          if (bd && Math.hypot(s.x - rb.x, s.y - rb.y) <= bd.size + size) {
            unlockAchievement("monster");
            return;
          }
        }
      }
    }
  }
}

/* Space only counts while actually connected (net.js sets this). Unlock is
   also called directly from net.js on the PvP key handler. */
function updateAchievements() {
  try {
    checkGeneratorAchievements();
    checkAllPiecesAchievement();
    checkKillAchievements();
    checkMonsterAchievement();
  } catch {
    /* never let a check break the loop */
  }
}

/* ---------- tag menu ---------- */

/* Fill the start-menu picker with the achievements this player has earned.
   Only earned ones appear, and only one can be chosen (plus "No tag"). */
function populateTagMenu() {
  const select = document.getElementById("menu-tag");
  if (!select) return;

  const unlocked = ACHIEVEMENTS.filter((a) => isAchievementUnlocked(a.id));
  let html = unlocked.length
    ? '<option value="">No tag</option>'
    : '<option value="">No tags yet</option>';
  for (const a of unlocked) {
    html += '<option value="' + a.id + '">' + escapeAchievementText(a.name) + "</option>";
  }
  select.innerHTML = html;
  select.disabled = unlocked.length === 0;

  const current = achievements.tag && isAchievementUnlocked(achievements.tag) ? achievements.tag : "";
  select.value = current;
  setAchievementTag(current || null);

  select.addEventListener("change", () => setAchievementTag(select.value || null));
}

/* ---------- hover carousel ---------- */

/* The carousel fades in while the cursor sits in a band at the center-right of
   the screen (a touch larger than the panel, so it's easy to reach). Moving the
   mouse away fades it back out. */
const ACH_ZONE = { width: 260, height: 520 };

function pointInAchievementZone(clientX, clientY) {
  const fromRight = window.innerWidth - clientX;
  const fromCenter = Math.abs(clientY - window.innerHeight / 2);
  return fromRight <= ACH_ZONE.width && fromCenter <= ACH_ZONE.height / 2;
}

function setAchievementsVisible(on) {
  const panel = document.getElementById("achievements");
  if (panel) panel.classList.toggle("visible", on);
}

/* ---------- boot ---------- */

window.addEventListener("DOMContentLoaded", () => {
  loadAchievements();
  loadTag();
  renderAchievements();
  populateTagMenu();
  updateAchievements();
  setInterval(updateAchievements, 250);

  window.addEventListener("mousemove", (e) => {
    setAchievementsVisible(pointInAchievementZone(e.clientX, e.clientY));
  });
  document.addEventListener("mouseleave", () => setAchievementsVisible(false));
  window.addEventListener("blur", () => setAchievementsVisible(false));
});
