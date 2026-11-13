"use strict";

/* =========================================================
   hightide.io - guided tutorial

   Balloons that point at the part of the screen each step is
   about, one step at a time, without stopping the game. A step
   that asks for an action moves on when the player does it; a
   step that explains has an "Entendi" button. The order follows
   how a base is built: mills, huts, cannons, reefs, docks, the
   arsenal, then how to lay out a base, upgrades, achievements
   and the chat rules.

   Progress is saved in this browser, so a new match picks up
   where the last one stopped. "Pular" ends it, and the settings
   panel can start it again.
   ========================================================= */

const TUTORIAL_KEY = "hightide.tutorial.v1";

const byDesign = (...designs) => () => placement.placed.some((p) => designs.includes(p.building.design));
const tool = (id) => () => document.getElementById(id);

/* A step's text, by key: "tut.mill" is the title, "tut.mill.text" the text with
   a mouse and "tut.mill.touch" the text on a touch screen. */
const said = (key) => () => t(key + (isTouchMode() && TEXTS.pt[key + ".touch"] ? ".touch" : ".text"));

const TUTORIAL_STEPS = [
  {
    key: "tut.mill",
    text: said("tut.mill"),
    foot: () => t(isTouchMode() ? "tut.keysTouch" : "tut.keys"),
    target: tool("generator-button"),
    done: () => countGenerators() > 0,
  },
  { key: "tut.hut", text: said("tut.hut"), target: tool("house-button"), done: byDesign("house") },
  { key: "tut.gun", text: said("tut.gun"), target: tool("turret-button"), done: byDesign("turret", "sniper") },
  { key: "tut.reef", text: said("tut.reef"), target: tool("wall-button"), done: byDesign("wall") },
  { key: "tut.dock", text: said("tut.dock"), target: tool("tent-button"), done: byDesign("tent") },
  {
    key: "tut.fleet",
    text: said("tut.fleet"),
    target: () => null,
    done: () => state.orderedFleet,
    explain: true,
  },
  { key: "tut.arsenal", text: said("tut.arsenal"), target: tool("armory-button"), explain: true },
  {
    key: "tut.layout",
    html: () =>
      "<p>" + t("tut.layout.intro") + "</p>" +
      "<ul><li>" + t("tut.layout.fort") + "</li><li>" + t("tut.layout.mixed") + "</li></ul>",
    target: () => null,
    explain: true,
  },
  {
    key: "tut.upgrade",
    text: said("tut.upgrade"),
    target: () => null,
    done: () => placement.placed.some((p) => (p.level || 1) > 1 || (p.tier || 1) > 1),
    explain: true,
  },
  { key: "tut.ach", text: said("tut.ach"), target: tool("achievements-hint"), explain: true },
  {
    key: "tut.chat",
    html: () => {
      const touch = isTouchMode();
      return (
        "<p>" + t(touch ? "tut.chat.openTouch" : "tut.chat.open") + " " + t("tut.chat.intro") + "</p>" +
        "<ul><li>" + t("tut.chat.rule1") + "</li><li>" + t("tut.chat.rule2") + "</li><li>" + t("tut.chat.rule3") + "</li></ul>" +
        "<p>" + t(touch ? "tut.chat.muteTouch" : "tut.chat.mute") + "</p>"
      );
    },
    target: () => {
      if (!settings.chat) return null;
      return document.getElementById(isTouchMode() ? "touch-chat" : "chat-hint");
    },
    explain: true,
    finish: "tut.finish",
  },
];

const tutorial = {
  step: 0,
  done: false,
  shown: -1, // the step the balloon shows now
  target: null,
};

function loadTutorial() {
  try {
    const saved = JSON.parse(localStorage.getItem(TUTORIAL_KEY) || "{}") || {};
    if (saved.done === true) tutorial.done = true;
    if (Number.isInteger(saved.step)) tutorial.step = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, saved.step));
  } catch {
    /* private mode: it starts over on the next visit */
  }
}

function saveTutorial() {
  try {
    localStorage.setItem(TUTORIAL_KEY, JSON.stringify({ step: tutorial.step, done: tutorial.done }));
  } catch {
    /* not saved: it starts over on the next visit */
  }
}

function markTarget(el) {
  if (tutorial.target === el) return;
  if (tutorial.target) tutorial.target.classList.remove("tut-target");
  if (el) el.classList.add("tut-target");
  tutorial.target = el;
}

function hideBalloon() {
  document.getElementById("tutorial").hidden = true;
  markTarget(null);
  tutorial.shown = -1;
}

function nextTutorialStep() {
  if (tutorial.step >= TUTORIAL_STEPS.length - 1) {
    finishTutorial();
    showToast(t("tut.done"), "good");
    return;
  }
  tutorial.step += 1;
  saveTutorial();
  tutorial.shown = -1; // redraw
}

function finishTutorial() {
  tutorial.done = true;
  saveTutorial();
  hideBalloon();
}

/* From the settings panel: the next match (or this one) starts at the mills. */
function restartTutorial() {
  tutorial.step = 0;
  tutorial.done = false;
  saveTutorial();
  tutorial.shown = -1;
}

function fillBalloon(step, i) {
  const body = document.getElementById("tutorial-body");
  if (step.html) body.innerHTML = step.html();
  else body.textContent = step.text();

  document.getElementById("tutorial-count").textContent = t("tut.count", { i: i + 1, n: TUTORIAL_STEPS.length });
  document.getElementById("tutorial-title").textContent = t(step.key);

  const foot = document.getElementById("tutorial-foot");
  foot.textContent = step.foot ? step.foot() : "";
  foot.hidden = !step.foot;

  const ok = document.getElementById("tutorial-ok");
  ok.hidden = !step.explain;
  ok.textContent = t(step.finish || "tut.ok");
  document.getElementById("tutorial-wait").hidden = Boolean(step.explain);
}

/* Beside its target, on the side with more room, the arrow pointing at it. */
function placeBalloon(target) {
  const box = document.getElementById("tutorial");
  const w = box.offsetWidth;
  const h = box.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 14;
  const margin = 10;

  let left;
  let top;
  let side = "none";
  let arrow = 0;

  const r = target && target.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) {
    const cx = Math.min(vw - margin, Math.max(margin, r.left + r.width / 2));
    const cy = r.top + r.height / 2;
    const roomLeft = r.left - gap - w >= margin;
    if (roomLeft && r.left > vw * 0.75 && r.top > 40 && r.bottom < vh - 40) {
      // a tab on the right edge: the balloon sits to its left, when it fits there
      side = "right";
      left = r.left - gap - w;
      top = Math.min(vh - h - margin, Math.max(margin, cy - h / 2));
      arrow = cy - top;
    } else if (r.top > vh / 2) {
      side = "bottom";
      top = r.top - gap - h;
      left = Math.min(vw - w - margin, Math.max(margin, cx - w / 2));
      arrow = cx - left;
    } else {
      side = "top";
      top = r.bottom + gap;
      left = Math.min(vw - w - margin, Math.max(margin, cx - w / 2));
      arrow = cx - left;
    }
  } else {
    left = (vw - w) / 2;
    top = Math.max(margin, vh * 0.16);
  }

  box.style.left = Math.round(left) + "px";
  box.style.top = Math.round(Math.max(margin, top)) + "px";
  box.dataset.arrow = side;
  box.style.setProperty("--arrow", Math.round(Math.max(16, Math.min((side === "right" ? h : w) - 16, arrow))) + "px");
}

function updateTutorial() {
  const ended = document.getElementById("eliminated").classList.contains("show");
  if (tutorial.done || !gameStarted || ended || settingsOpen()) {
    hideBalloon();
    return;
  }

  const i = tutorial.step;
  const step = TUTORIAL_STEPS[i];
  if (step.done && step.done()) {
    nextTutorialStep();
    return;
  }

  const box = document.getElementById("tutorial");
  if (tutorial.shown !== i) {
    fillBalloon(step, i);
    tutorial.shown = i;
    const t = step.target();
    // a toolbar that scrolls sideways (touch screens) brings the button into view
    if (t && t.closest("#toolbar")) t.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  box.hidden = false;
  const target = step.target();
  markTarget(target);
  placeBalloon(target);
}

onLanguageChange(() => (tutorial.shown = -1)); // redraw the balloon in the new language

window.addEventListener("DOMContentLoaded", () => {
  loadTutorial();
  document.getElementById("tutorial-ok").addEventListener("click", nextTutorialStep);
  document.getElementById("tutorial-skip").addEventListener("click", () => {
    finishTutorial();
    showToast(t("tut.skipped"));
  });
  document.getElementById("settings-tutorial").addEventListener("click", () => {
    restartTutorial();
    closeSettings();
  });
  setInterval(updateTutorial, 200);
});
