"use strict";

/* =========================================================
   hightide.io - settings

   A panel opened from the menu or from the gear beside the gold.
   Choices are saved in this browser.

   Locked aim: a browser can't change how fast the system mouse
   moves, so with this on the game locks the mouse to the map
   (Pointer Lock) and moves a cursor of its own, scaled by the
   sensitivity. While locked, the real mouse events are swallowed
   and replayed at the virtual cursor, so the map, the toolbar
   and the panels work as usual. Touching the screen edge pans
   the camera, since a locked mouse can't leave the window.
   ========================================================= */

const SETTINGS_KEY = "hightide.settings.v1";

const SETTINGS_DEFAULTS = {
  aimLock: false,
  sensi: 1,
  aimSize: 1,
  cameraSpeed: 1,
};

const SETTINGS_RANGES = {
  sensi: [0.2, 3],
  aimSize: [0.6, 2],
  cameraSpeed: [0.5, 2],
};

const settings = { ...SETTINGS_DEFAULTS };

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {};
  } catch {
    /* private mode or a broken entry: keep the defaults */
  }
  if (typeof saved.aimLock === "boolean") settings.aimLock = saved.aimLock;
  for (const [key, [min, max]] of Object.entries(SETTINGS_RANGES)) {
    const value = Number(saved[key]);
    if (Number.isFinite(value)) settings[key] = Math.min(max, Math.max(min, value));
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* not saved: the choice still lasts until the page closes */
  }
}

/* How fast the camera pans, as a multiple of the normal speed. */
function cameraSpeedFactor() {
  return settings.cameraSpeed;
}

/* ---------- panel ---------- */

const SETTING_SLIDERS = [
  { id: "set-sensi", key: "sensi", digits: 2 },
  { id: "set-aimsize", key: "aimSize", digits: 1 },
  { id: "set-camera", key: "cameraSpeed", digits: 1 },
];

function formatTimes(value, digits) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }) + "×";
}

function settingsOpen() {
  const panel = document.getElementById("settings");
  return !!panel && !panel.hidden;
}

function refreshSettingsPanel() {
  document.getElementById("set-aimlock").checked = settings.aimLock;
  for (const slider of SETTING_SLIDERS) {
    const input = document.getElementById(slider.id);
    input.value = String(settings[slider.key]);
    document.getElementById(slider.id + "-value").textContent = formatTimes(settings[slider.key], slider.digits);
  }
  // the sensitivity only matters while the aim is locked
  const sensi = document.getElementById("set-sensi");
  sensi.disabled = !settings.aimLock;
  sensi.closest(".settings-range").classList.toggle("off", !settings.aimLock);
}

let settingsOpener = null;

function openSettings() {
  releaseAim();
  settingsOpener = document.activeElement;
  refreshSettingsPanel();
  document.getElementById("settings").hidden = false;
  document.getElementById("settings-done").focus();
}

function closeSettings() {
  document.getElementById("settings").hidden = true;
  if (settingsOpener && document.contains(settingsOpener)) settingsOpener.focus();
  settingsOpener = null;
}

function bindSettingsPanel() {
  const panel = document.getElementById("settings");

  document.getElementById("set-aimlock").addEventListener("change", (e) => {
    settings.aimLock = e.target.checked;
    if (!settings.aimLock) releaseAim();
    saveSettings();
    refreshSettingsPanel();
  });

  for (const slider of SETTING_SLIDERS) {
    document.getElementById(slider.id).addEventListener("input", (e) => {
      const [min, max] = SETTINGS_RANGES[slider.key];
      settings[slider.key] = Math.min(max, Math.max(min, Number(e.target.value)));
      saveSettings();
      refreshSettingsPanel();
    });
  }

  document.getElementById("settings-reset").addEventListener("click", () => {
    Object.assign(settings, SETTINGS_DEFAULTS);
    releaseAim();
    saveSettings();
    refreshSettingsPanel();
  });

  document.getElementById("settings-done").addEventListener("click", closeSettings);
  document.getElementById("settings-close").addEventListener("click", closeSettings);
  for (const id of ["settings-open", "menu-settings"]) {
    document.getElementById(id).addEventListener("click", openSettings);
  }

  // a click on the dimmed backdrop closes, like Esc
  panel.addEventListener("click", (e) => {
    if (e.target === panel) closeSettings();
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeSettings();
    }
  });
}

/* ---------- locked aim ---------- */

const aim = {
  locked: false,
  x: 0,
  y: 0,
  downTarget: null, // element under the cursor when a button went down
  hover: null,
  unlockedAt: -Infinity,
};

const AIM_EDGE = 4; // px from the window edge that start panning

function aimAvailable() {
  return settings.aimLock && gameStarted && !isTouchMode() && !settingsOpen() && "requestPointerLock" in canvas;
}

function releaseAim() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function requestAim(e) {
  aim.x = e.clientX;
  aim.y = e.clientY;
  try {
    const request = canvas.requestPointerLock();
    if (request && request.catch) request.catch(() => {});
  } catch {
    /* refused (an iframe without permission, say): the normal mouse keeps working */
  }
}

/* -1, 0 or 1 on each axis while the locked cursor presses against an edge. */
function aimEdgeVector() {
  if (!aim.locked) return { x: 0, y: 0 };
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: aim.x <= AIM_EDGE ? -1 : aim.x >= w - 1 - AIM_EDGE ? 1 : 0,
    y: aim.y <= AIM_EDGE ? -1 : aim.y >= h - 1 - AIM_EDGE ? 1 : 0,
  };
}

function aimTarget() {
  return document.elementFromPoint(aim.x, aim.y) || document.body;
}

function setAimHover(target) {
  const hovered = target.closest ? target.closest("button") : null;
  if (hovered === aim.hover) return;
  if (aim.hover) aim.hover.classList.remove("vhover");
  if (hovered) hovered.classList.add("vhover");
  aim.hover = hovered;
}

function placeAimCursor(target) {
  const cursor = document.getElementById("aim-cursor");
  cursor.style.transform = "translate(" + aim.x + "px, " + aim.y + "px)";
  // over the map the ink reticle already marks the spot
  cursor.classList.toggle("over-hud", target !== canvas);
}

/* Replays a mouse event at the virtual cursor. */
function replay(type, target, from, Ctor) {
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: aim.x,
    clientY: aim.y,
    screenX: aim.x,
    screenY: aim.y,
    button: from.button,
    buttons: from.buttons,
    ctrlKey: from.ctrlKey,
    shiftKey: from.shiftKey,
    altKey: from.altKey,
    metaKey: from.metaKey,
  };
  if (Ctor === PointerEvent) Object.assign(init, { pointerId: 1, pointerType: "mouse", isPrimary: true });
  target.dispatchEvent(new Ctor(type, init));
}

function onAimMove(e) {
  aim.x = Math.min(window.innerWidth - 1, Math.max(0, aim.x + e.movementX * settings.sensi));
  aim.y = Math.min(window.innerHeight - 1, Math.max(0, aim.y + e.movementY * settings.sensi));

  const target = aimTarget();
  setAimHover(target);
  placeAimCursor(target);
  if (target !== canvas && !drag.active) {
    placement.mouseX = null; // no ghost under the toolbar or a panel
    placement.mouseY = null;
  }
  replay("pointermove", target, e, PointerEvent);
  replay("mousemove", target, e, MouseEvent);
}

function onAimDown(e) {
  const target = aimTarget();
  aim.downTarget = target;

  // typing needs the real cursor and the keyboard focus
  if (target.closest && target.closest("input, select, textarea")) {
    releaseAim();
    target.focus();
    return;
  }
  replay("pointerdown", target, e, PointerEvent);
  replay("mousedown", target, e, MouseEvent);
}

function onAimUp(e) {
  const target = aimTarget();
  replay("pointerup", target, e, PointerEvent);
  replay("mouseup", target, e, MouseEvent);

  // a click lands where both the press and the release were
  const down = aim.downTarget;
  aim.downTarget = null;
  if (e.button !== 0 || !down) return;
  const clicked = down === target || down.contains(target) ? down : target.contains(down) ? target : null;
  if (clicked) replay("click", clicked, e, MouseEvent);
}

/* The wheel scrolls whatever scrollable panel is under the virtual cursor. */
function onAimWheel(e) {
  let el = aimTarget();
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
      el.scrollBy({ top: e.deltaY });
      return;
    }
    el = el.parentElement;
  }
}

/* While locked, the real events point at the canvas with a frozen position:
   swallow them and send the virtual cursor's instead. */
function bindAimLock() {
  const swallow = (handler) => (e) => {
    if (!aim.locked || !e.isTrusted) return;
    e.stopImmediatePropagation();
    if (e.cancelable) e.preventDefault();
    if (handler) handler(e);
  };

  window.addEventListener("mousemove", swallow(onAimMove), true);
  window.addEventListener("mousedown", swallow(onAimDown), true);
  window.addEventListener("mouseup", swallow(onAimUp), true);
  window.addEventListener("wheel", swallow(onAimWheel), { capture: true, passive: false });
  for (const type of ["pointermove", "pointerdown", "pointerup", "click", "dblclick", "auxclick", "contextmenu"]) {
    window.addEventListener(type, swallow(null), true);
  }

  // a click on the map locks the mouse when the setting is on
  canvas.addEventListener("mousedown", (e) => {
    if (!aim.locked && e.isTrusted && e.button === 0 && aimAvailable()) requestAim(e);
  });

  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    if (locked === aim.locked) return;
    aim.locked = locked;
    document.body.classList.toggle("aim-locked", locked);
    if (locked) {
      placeAimCursor(aimTarget());
      showToast("Mira presa. Esc solta o mouse.");
      return;
    }
    aim.unlockedAt = performance.now();
    aim.downTarget = null;
    setAimHover(document.body);
    drag.active = false;
    drag.building = null;
    placement.mouseX = null;
    placement.mouseY = null;
  });

  // The browser spends the first Esc on releasing the mouse; it must not also
  // cancel the selected building.
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && (aim.locked || performance.now() - aim.unlockedAt < 200)) {
        e.stopImmediatePropagation();
        releaseAim();
      }
    },
    true
  );

  window.addEventListener("resize", () => {
    aim.x = Math.min(window.innerWidth - 1, aim.x);
    aim.y = Math.min(window.innerHeight - 1, aim.y);
  });

  // leaving the match (menu, another tab) gives the mouse back
  setInterval(() => {
    if (aim.locked && !aimAvailable()) releaseAim();
  }, 250);
}

window.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  bindSettingsPanel();
  bindAimLock();
});
