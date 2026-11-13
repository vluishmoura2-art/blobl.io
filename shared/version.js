"use strict";

/* =========================================================
   hightide.io - the game's version, read by server.js AND the
   browser. The server sends it with the welcome, so a page that
   was opened before an update knows it should be reloaded.
   Raise it together with a new entry in JS/changelog.js.
   ========================================================= */

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GAME_VERSION = factory();
})(this, function () {
  return "1.3";
});
