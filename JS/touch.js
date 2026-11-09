"use strict";

/* =========================================================
   hightide.io - touch screens

   On a phone or tablet: a joystick in the lower left moves
   the camera (instead of W A S D), buttons replace the keys
   (Space = PvP, H = island, Esc = cancel), and a long press on
   a toolbar button shows its tip. Taps on the map are handled
   in main.js, the same as mouse clicks.
   ========================================================= */

const JOY_RADIUS = 52; // how far the knob travels, in screen px
const JOY_DEAD_ZONE = 0.15; // ignore tiny thumb movements
const LONG_PRESS_MS = 450;

const joystick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };

/* Touch mode: on for touch screens, and switched by whichever is used last. */
function setTouchMode(on) {
  document.body.classList.toggle("touch", on);
}

function isTouchMode() {
  return document.body.classList.contains("touch");
}

/* Keeps a finger's events on this element even when it slides off it. Some
   browsers refuse for some pointers; the controls still work without it. */
function capturePointer(el, id) {
  try {
    el.setPointerCapture(id);
  } catch {
    /* no capture: events still arrive while the finger stays on the element */
  }
}

/* Camera direction from the joystick, each axis -1..1 (0 when idle). */
function joystickVector() {
  return { x: joystick.x, y: joystick.y };
}

function moveKnob(dx, dy) {
  document.getElementById("joystick-knob").style.transform = "translate(" + dx + "px, " + dy + "px)";
}

function bindJoystick() {
  const zone = document.getElementById("joystick");
  const base = document.getElementById("joystick-base");

  zone.addEventListener("pointerdown", (e) => {
    if (joystick.id !== null) return;
    setTouchMode(true);
    joystick.id = e.pointerId;
    capturePointer(zone, e.pointerId);

    // the joystick appears where the thumb lands
    const rect = zone.getBoundingClientRect();
    joystick.ox = e.clientX;
    joystick.oy = e.clientY;
    base.style.left = e.clientX - rect.left + "px";
    base.style.top = e.clientY - rect.top + "px";
    zone.classList.add("active");
    e.preventDefault();
  });

  zone.addEventListener("pointermove", (e) => {
    if (e.pointerId !== joystick.id) return;
    let dx = e.clientX - joystick.ox;
    let dy = e.clientY - joystick.oy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    moveKnob(dx, dy);

    const strength = Math.min(1, len / JOY_RADIUS);
    const live = strength < JOY_DEAD_ZONE ? 0 : (strength - JOY_DEAD_ZONE) / (1 - JOY_DEAD_ZONE);
    joystick.x = len ? (dx / Math.hypot(dx, dy)) * live : 0;
    joystick.y = len ? (dy / Math.hypot(dx, dy)) * live : 0;
  });

  const release = (e) => {
    if (e.pointerId !== joystick.id) return;
    joystick.id = null;
    joystick.x = 0;
    joystick.y = 0;
    moveKnob(0, 0);
    base.style.left = "";
    base.style.top = "";
    zone.classList.remove("active");
  };
  zone.addEventListener("pointerup", release);
  zone.addEventListener("pointercancel", release);
}

function bindTouchButtons() {
  document.getElementById("touch-pvp").addEventListener("click", () => onSpaceForPvp());
  document.getElementById("touch-home").addEventListener("click", () => {
    camera.tx = PLAYER.x;
    camera.ty = PLAYER.y;
  });
  document.getElementById("touch-cancel").addEventListener("click", () => deselectBuilding());
}

/* The touch buttons only show when they do something. */
function refreshTouchButtons() {
  if (!isTouchMode()) return;
  const busy = placement.active !== null || actionMode !== null || Boolean(upgradeChoice.piece);
  document.getElementById("touch-cancel").hidden = !busy;
  document.getElementById("touch-pvp").hidden = !net.mySafe || !net.online;
}

/* A long press on a toolbar button shows its tip (there is no hover on a touch
   screen); the tap that ends a long press doesn't select the tool. */
function bindLongPressTips() {
  const tip = document.getElementById("touch-tip");
  let hideTimer = 0;

  for (const button of document.querySelectorAll(".tool-button")) {
    let timer = 0;
    button.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      timer = setTimeout(() => {
        const source = button.querySelector(".tool-tip");
        if (!source) return;
        tip.innerHTML = source.innerHTML;
        tip.hidden = false;
        button.dataset.longPress = "1";
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => (tip.hidden = true), 2500);
      }, LONG_PRESS_MS);
    });
    const cancel = () => clearTimeout(timer);
    button.addEventListener("pointerup", cancel);
    button.addEventListener("pointerleave", cancel);
    button.addEventListener("pointercancel", cancel);
    button.addEventListener(
      "click",
      (e) => {
        if (!button.dataset.longPress) return;
        delete button.dataset.longPress;
        e.stopImmediatePropagation();
      },
      true
    );
  }
}

window.addEventListener("DOMContentLoaded", () => {
  setTouchMode(window.matchMedia("(pointer: coarse)").matches);
  bindJoystick();
  bindTouchButtons();
  bindLongPressTips();

  // a real mouse moving switches back to the mouse layout
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" && (e.movementX || e.movementY)) setTouchMode(false);
  });
});
