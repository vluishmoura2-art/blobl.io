"use strict";

/* =========================================================
   Blobl.io - audio (SFX + music)

   Plays short effects from the sounds/ folder and a looping
   music bed. Every file is OPTIONAL: a missing file fails
   silently, so the game runs fine before the audio assets
   are added.

   Expected files - see sounds/README.txt for the exact names:
     click.mp3       UI / tool selection
     place.mp3       building snap (impact)
     connect.mp3     rod coupling settles (played ~130ms after place)
     swap.mp3        buildings exchanged
     delete.mp3      building removed
     error.mp3       invalid / unaffordable placement
     pvp.mp3         space = PvP toggled on
     hit.mp3         own base took damage
     eliminated.mp3  base destroyed
     music.mp3       background loop (starts on first user gesture)

   Keys:
     M = mute / unmute everything (small badge shows the state)
   ========================================================= */

const Sfx = (() => {
  const cache = new Map(); // file -> Audio element
  let unlocked = false; // set on the first user gesture (autoplay policy)
  let muted = false;

  const files = {
    click: "sounds/click.mp3",
    place: "sounds/place.mp3",
    connect: "sounds/connect.mp3",
    swap: "sounds/swap.mp3",
    delete: "sounds/delete.mp3",
    error: "sounds/error.mp3",
    pvp: "sounds/pvp.mp3",
    hit: "sounds/hit.mp3",
    eliminated: "sounds/eliminated.mp3",
  };

  const musicFile = "sounds/music.mp3";
  let music = null;

  function makeTrack(src) {
    const el = new Audio();
    el.src = src;
    el.preload = "auto";
    return el;
  }

  function get(key) {
    let el = cache.get(key);
    if (!el) {
      el = makeTrack(files[key]);
      cache.set(key, el);
    }
    return el;
  }

  /* Fire a one-shot effect. Missing files / blocked autoplay are swallowed. */
  function play(key, volume) {
    if (muted || !unlocked || !files[key]) return;
    try {
      const el = get(key);
      el.volume = volume == null ? 0.5 : volume;
      el.currentTime = 0;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* no-op */
    }
  }

  function refreshMusic() {
    if (muted) {
      if (music) {
        try {
          music.pause();
        } catch {
          /* no-op */
        }
      }
      return;
    }
    if (!music) {
      music = makeTrack(musicFile);
      music.loop = true;
      music.volume = 0.35;
    }
    const p = music.play();
    if (p && p.catch) p.catch(() => {});
  }

  /* Browsers only allow audio after a user gesture; the menu button calls this. */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    refreshMusic();
  }

  function toggleSound() {
    muted = !muted;
    if (muted && music) {
      try {
        music.pause();
      } catch {
        /* no-op */
      }
    } else {
      play("click", 0.6);
      refreshMusic();
    }
    updateBadge();
    return muted;
  }

  function updateBadge() {
    const el = document.getElementById("audio-state");
    if (el) el.textContent = muted ? "sound off" : "sound on";
  }

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "m") {
      e.preventDefault();
      toggleSound();
    }
  });

  if (document.readyState === "complete" || document.readyState === "interactive") {
    updateBadge();
  } else {
    window.addEventListener("DOMContentLoaded", updateBadge);
  }

  return {
    play,
    unlock,
    toggleSound,
    get muted() {
      return muted;
    },
  };
})();