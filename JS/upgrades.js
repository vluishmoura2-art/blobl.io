"use strict";

/* =========================================================
   hightide.io - building upgrades (levels 2 to 4)

   With a building's own tool selected, clicking one of those
   buildings upgrades it. The first upgrade opens a small panel
   to choose one of two paths; the choice is final for that
   building. Paths, prices and effects live in shared/combat.js,
   and the server checks every purchase.
   ========================================================= */

const upgradeChoice = { piece: null };

function pieceLevel(p) {
  return p.level || 1;
}

/* The building's stats at its current level and path. */
function pieceStats(p) {
  return COMBAT.levelStats(p.building, pieceLevel(p), p.path || null);
}

function canUpgrade(p) {
  return Boolean(p.building.paths);
}

function nextLevelOf(p, path) {
  return p.building.paths[path].levels[pieceLevel(p) - 1] || null;
}

function buyLevel(p, path) {
  const next = nextLevelOf(p, path);
  if (!next) {
    denyFx("Esta construção já está no nível máximo");
    return false;
  }
  if (!canAffordCost(next.cost)) {
    denyFx(missingGold(next.cost));
    return false;
  }

  p.path = path;
  p.level = pieceLevel(p) + 1;
  p.invested = (p.invested || p.building.cost) + next.cost;
  p.born = FX.t; // the same little "pop" as a new building
  state.power -= next.cost;
  state.lastSpendAt = performance.now();
  refreshPowerUI();
  purchaseFx(p.x, p.y);
  showToast(p.building.name + ": " + p.building.paths[path].name + ", nível " + p.level, "good");
  return true;
}

/* Called when the player clicks one of their buildings with its own tool. */
function upgradePiece(p) {
  if (pieceLevel(p) === 1) openUpgradeChoice(p);
  else buyLevel(p, p.path);
}

/* ---------- path choice panel ---------- */

function paintChoicePreview(canvas, building, path) {
  const g = canvas.getContext("2d");
  const box = canvas.width / 2;
  const scale = box / 50;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.setTransform(scale, 0, 0, scale, box, box);
  paintBuilding(g, building, -4, 0, building.size, STYLE.fill, -0.5, 1, 0.6, COMBAT.maxLevel, path);
}

function openUpgradeChoice(p) {
  const panel = document.getElementById("upgrade-choice");
  document.getElementById("upgrade-title").textContent = p.building.name + ": escolha a evolução";

  for (const card of panel.querySelectorAll(".choice")) {
    const path = card.dataset.path;
    const route = p.building.paths[path];
    const next = route.levels[0];
    paintChoicePreview(card.querySelector("canvas"), p.building, path);
    card.querySelector(".choice-name").textContent = route.name;
    card.querySelector(".choice-summary").textContent = route.summary;
    card.querySelector(".choice-next").textContent = "Nível 2: " + next.desc;
    card.querySelector(".choice-cost").textContent = next.cost + " de ouro";
    card.classList.toggle("unavailable", !canAffordCost(next.cost));
  }

  upgradeChoice.piece = p;
  panel.hidden = false;
  placeUpgradeChoice();
}

/* Returns true when the panel was open (so the click that closed it does nothing else). */
function closeUpgradeChoice() {
  if (!upgradeChoice.piece) return false;
  upgradeChoice.piece = null;
  document.getElementById("upgrade-choice").hidden = true;
  return true;
}

function choosePath(path) {
  const p = upgradeChoice.piece;
  if (p && buyLevel(p, path)) closeUpgradeChoice();
}

/* Keeps the panel above its building while the camera moves. */
function placeUpgradeChoice() {
  const p = upgradeChoice.piece;
  if (!p) return;
  if (!placement.placed.includes(p)) {
    closeUpgradeChoice();
    return;
  }

  const panel = document.getElementById("upgrade-choice");
  const { w, h } = viewSize();
  const x = p.x - camera.x + w / 2;
  const y = p.y - camera.y + h / 2;
  const gap = p.building.size + 14;
  const left = Math.max(8, Math.min(w - panel.offsetWidth - 8, x - panel.offsetWidth / 2));
  // above the building when it fits, otherwise below it, so the panel never hides it
  const above = y - gap - panel.offsetHeight;
  const top = above >= 8 ? above : Math.min(h - panel.offsetHeight - 8, y + gap);
  panel.style.transform = "translate(" + Math.round(left) + "px, " + Math.round(top) + "px)";
}

/* While the panel is open, 1 and 2 pick a path and Esc closes it. */
function handleChoiceKey(e) {
  if (!upgradeChoice.piece) return false;
  if (e.key === "1" || e.key === "2") choosePath(e.key === "1" ? "A" : "B");
  else if (e.key === "Escape") closeUpgradeChoice();
  else return false;
  e.preventDefault();
  return true;
}

window.addEventListener("DOMContentLoaded", () => {
  for (const card of document.querySelectorAll("#upgrade-choice .choice")) {
    card.addEventListener("click", () => choosePath(card.dataset.path));
  }
});
