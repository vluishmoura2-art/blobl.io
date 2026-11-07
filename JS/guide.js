"use strict";

/* =========================================================
   Maré Alta - first steps

   A short checklist beside the map, not a tutorial that stops
   the game. Each step ticks itself when the player does it, and
   the toolbar marks the button the current step needs. Once
   finished or closed, it stays away (saved in this browser).
   ========================================================= */

const GUIDE_DONE_KEY = "marealta.guideDone.v1";

const GUIDE_STEPS = [
  {
    text: "Construa um moinho (tecla 3) para ganhar ouro",
    tool: "generator-button",
    done: () => countGenerators() > 0,
  },
  {
    text: "Construa um canhão (tecla 2) para defender a ilha",
    tool: "turret-button",
    done: () => placement.placed.some((p) => p.building.design === "turret" || p.building.design === "sniper"),
  },
  {
    text: "Junte 120 de ouro e construa um cais (tecla 7)",
    tool: "tent-button",
    done: () => placement.placed.some((p) => p.building.design === "tent"),
  },
  {
    text: "Quando surgir um bote, clique no mapa para mandá-lo",
    done: () => state.orderedFleet,
  },
  {
    text: "Aperte Espaço para ativar o PvP e atacar",
    done: () => !net.mySafe,
  },
];

const guide = {
  ticked: new Set(), // a finished step stays finished, even after a new match
  closed: false,
};

function guideWasFinished() {
  try {
    return localStorage.getItem(GUIDE_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function closeGuide() {
  guide.closed = true;
  document.getElementById("guide").classList.remove("visible");
  markGuideTool(null);
  try {
    localStorage.setItem(GUIDE_DONE_KEY, "1");
  } catch {
    /* private mode: it just comes back on the next visit */
  }
}

function markGuideTool(id) {
  for (const button of document.querySelectorAll(".tool-button")) {
    button.classList.toggle("hint", button.id === id);
  }
}

function updateGuide() {
  if (guide.closed || !gameStarted) return;

  GUIDE_STEPS.forEach((step, i) => {
    if (step.done()) guide.ticked.add(i);
  });

  if (guide.ticked.size === GUIDE_STEPS.length) {
    closeGuide();
    showToast("Bons ventos, capitão! Agora afunde as ilhas inimigas.", "good");
    return;
  }

  const current = GUIDE_STEPS.findIndex((_, i) => !guide.ticked.has(i));
  const rows = document.getElementById("guide-list").children;
  GUIDE_STEPS.forEach((_, i) => {
    rows[i].classList.toggle("ticked", guide.ticked.has(i));
    rows[i].classList.toggle("current", i === current);
  });
  markGuideTool(GUIDE_STEPS[current].tool || null);
  document.getElementById("guide").classList.add("visible");
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("guide-list").innerHTML = GUIDE_STEPS.map((step) => "<li>" + step.text + "</li>").join("");
  document.getElementById("guide-close").addEventListener("click", closeGuide);
  guide.closed = guideWasFinished();
  setInterval(updateGuide, 250);
});
