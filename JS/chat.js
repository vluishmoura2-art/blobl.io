"use strict";

/* =========================================================
   hightide.io - chat

   One chat for everyone in the match. Enter opens the box and
   sends, Esc closes it; while typing, the game's keys stay quiet.
   The server trims, rate limits and filters every line, so this
   page only shows what came back.

   New lines fade after a while unless the box is open. Clicking
   a captain's name mutes them for you alone (only in this
   match); the notice that says so has a button to undo it. On a
   touch screen a "Chat" button opens the box instead of Enter.
   ========================================================= */

const CHAT_MAX = 120; // letters per message, the same limit the server applies
const CHAT_KEEP = 60; // lines kept in the log
const CHAT_FRESH_MS = 12000; // how long a new line shows with the box closed

const chat = {
  open: false,
  muted: new Set(), // ids of captains muted in this match
  unread: 0,
  lastSent: "",
};

function chatEnabled() {
  return settings.chat !== false;
}

function canChat() {
  const ended = document.getElementById("eliminated").classList.contains("show");
  return gameStarted && net.online && chatEnabled() && !settingsOpen() && !ended;
}

function refreshChatVisibility() {
  const on = chatEnabled();
  document.getElementById("chat").hidden = !on;
  document.getElementById("touch-chat").hidden = !on;
  if (!on && chat.open) closeChat();
}

function setUnread(n) {
  chat.unread = n;
  const badge = document.getElementById("touch-chat-unread");
  badge.textContent = n > 9 ? "9+" : String(n);
  badge.hidden = n === 0;
}

function openChat() {
  if (!canChat()) return;
  if (typeof releaseAim === "function") releaseAim(); // typing needs the real cursor
  if (typeof keys === "object") keys.clear(); // a key held when the box opened must not keep panning
  chat.open = true;
  setUnread(0);
  document.getElementById("chat").classList.add("open");
  document.getElementById("chat-form").hidden = false;
  const log = document.getElementById("chat-log");
  log.scrollTop = log.scrollHeight;
  document.getElementById("chat-input").focus();
}

function closeChat() {
  chat.open = false;
  document.getElementById("chat").classList.remove("open");
  document.getElementById("chat-form").hidden = true;
  const input = document.getElementById("chat-input");
  if (document.activeElement === input) input.blur();
}

function sendChat() {
  const input = document.getElementById("chat-input");
  const text = input.value.replace(/\s+/g, " ").trim();
  if (text) {
    chat.lastSent = text;
    netSend({ type: "chat", text });
  }
  input.value = "";
  refreshChatCount();
}

function refreshChatCount() {
  const n = Array.from(document.getElementById("chat-input").value).length;
  const count = document.getElementById("chat-count");
  count.textContent = n + "/" + CHAT_MAX;
  count.classList.toggle("near", n >= CHAT_MAX - 10);
}

/* ---------- the log ---------- */

function appendLine(line, fromId) {
  const log = document.getElementById("chat-log");
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;

  if (fromId) line.dataset.from = fromId;
  line.classList.add("fresh");
  setTimeout(() => line.classList.remove("fresh"), CHAT_FRESH_MS);
  log.appendChild(line);
  while (log.children.length > CHAT_KEEP) log.firstChild.remove();
  if (atBottom || !chat.open) log.scrollTop = log.scrollHeight;
}

function nameButton(id, name, color) {
  const you = id === net.id;
  const el = document.createElement(you ? "span" : "button");
  el.className = "chat-name";
  el.style.setProperty("--who", color || "var(--ink)");
  el.textContent = name;
  if (!you) {
    el.type = "button";
    el.title = "Silenciar " + name;
    el.addEventListener("click", () => toggleMute(id, name));
  }
  return el;
}

function addChatMessage(msg) {
  if (!chatEnabled() || chat.muted.has(msg.id)) return;

  const line = document.createElement("div");
  line.className = "chat-line" + (msg.id === net.id ? " mine" : "");
  line.appendChild(nameButton(msg.id, msg.name, msg.color));
  const text = document.createElement("span");
  text.className = "chat-text";
  text.textContent = msg.text;
  line.append(": ", text);
  appendLine(line, msg.id);

  if (!chat.open && msg.id !== net.id) setUnread(chat.unread + 1);
}

function addChatNotice(text, action) {
  if (!chatEnabled()) return;
  const line = document.createElement("div");
  line.className = "chat-line notice";
  line.textContent = text;
  if (action) {
    const undo = document.createElement("button");
    undo.type = "button";
    undo.className = "chat-undo";
    undo.textContent = action.label;
    undo.addEventListener("click", () => {
      action.run();
      line.remove();
    });
    line.append(" ", undo);
  }
  appendLine(line);
}

function toggleMute(id, name) {
  if (chat.muted.has(id)) {
    chat.muted.delete(id);
    addChatNotice("Você voltou a ouvir " + name + ".");
    return;
  }
  chat.muted.add(id);
  for (const old of document.querySelectorAll('#chat-log [data-from="' + CSS.escape(id) + '"]')) old.remove();
  addChatNotice("Você silenciou " + name + ".", { label: "Desfazer", run: () => toggleMute(id, name) });
}

/* Messages from the server (net.js passes them on). */
function onChatMessage(msg) {
  if (msg.type === "chat") {
    addChatMessage(msg);
  } else if (msg.type === "chat-notice") {
    if (msg.id === net.id || chat.muted.has(msg.id)) return;
    addChatNotice(msg.name + (msg.kind === "join" ? " entrou no mar." : " saiu do mar."));
  } else if (msg.type === "chat-refused") {
    const seconds = Math.max(1, Math.ceil((msg.wait || 1500) / 1000));
    addChatNotice("Calma, capitão: espere " + seconds + " s para mandar outra mensagem.");
    // give the refused line back so it can be sent again
    const input = document.getElementById("chat-input");
    if (!input.value) input.value = chat.lastSent;
    refreshChatCount();
  }
}

/* A new match starts with an empty log; mutes were for the other match's captains. */
function clearChat() {
  closeChat();
  document.getElementById("chat-log").textContent = "";
  document.getElementById("chat-input").value = "";
  chat.muted.clear();
  setUnread(0);
  refreshChatCount();
}

/* ---------- keys ---------- */

function bindChat() {
  const input = document.getElementById("chat-input");
  input.maxLength = CHAT_MAX * 2; // emoji take two places; the letters are counted below
  input.addEventListener("input", () => {
    const letters = Array.from(input.value);
    if (letters.length > CHAT_MAX) input.value = letters.slice(0, CHAT_MAX).join("");
    refreshChatCount();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendChat();
      closeChat();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeChat();
    }
  });

  // a tap outside the box (on the map, say) closes it, keeping what was typed
  input.addEventListener("blur", () => {
    setTimeout(() => {
      if (chat.open && !document.getElementById("chat").contains(document.activeElement)) closeChat();
    }, 0);
  });

  document.getElementById("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    sendChat();
    closeChat();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (!canChat()) return;
    e.preventDefault(); // not a click on whatever button kept the focus
    openChat();
  });

  const toggle = document.getElementById("touch-chat");
  toggle.addEventListener("pointerdown", (e) => e.preventDefault()); // keeps the focus in the box, so the tap can close it
  toggle.addEventListener("click", () => (chat.open ? closeChat() : openChat()));

  refreshChatVisibility();
  refreshChatCount();
}

window.addEventListener("DOMContentLoaded", bindChat);
