"use strict";

/* =========================================================
   hightide.io - chat filter (runs on the server)

   Every word is compared after the usual disguises are undone:
   accents removed, numbers and symbols read as letters
   ("p0rr4" -> "porra"), dots and dashes inside the word dropped
   ("p.o.r.r.a"), repeated letters squeezed ("porrrraaa") and
   letters typed one by one with spaces joined ("p o r r a").
   A word that matches is replaced by asterisks.

   Short words only match whole ("cu" is blocked, "cuidado" and
   "computador" are not); stems match the start of a word
   ("caralh" catches "caralho" and "caralhada"). Both lists are
   compared squeezed, so a stem must stay distinctive after its
   double letters become single ("porr" would turn into "por").
   ========================================================= */

// whole words only
const WORDS = [
  "cu", "cus", "cuzao", "cuzinho", "krl", "krlh", "fdp", "vsf", "vtnc", "tnc", "pqp", "pnc",
  "puta", "putas", "puto", "putos", "bosta", "bostas", "merda", "merdas", "porra", "porras", "porrada",
  "viado", "viados", "bicha", "bichas", "xota", "xoxota", "piroca", "pica", "picas",
  "idiota", "idiotas", "babaca", "corno", "cornos", "vadia", "vadias",
  "fuck", "shit", "bitch", "cunt", "dick", "asshole", "wtf", "stfu",
  "nigga", "niggas", "nigger", "niggers", "fag", "faggot",
  // German
  "arsch", "fotze", "fotzen", "hure", "huren", "schlampe", "schlampen", "spast", "spasti", "wichser",
  "scheisse", "scheiss", "kacke", "missgeburt", "drecksau", "penner", "vollidiot",
];

// the start of a word
const STEMS = [
  "caralh", "buceta", "boceta", "merd", "fod", "fud", "putaria", "putinh", "putona",
  "arromb", "cuzã", "desgrac", "filhodaput", "filhadaput", "vagabund", "retardad",
  "otari", "imbecil", "babac", "cornud", "viadinh", "punhet", "xerec", "siriric",
  "fuck", "shit", "bitch", "motherf", "whore", "slut",
  // German
  "arschl", "arschg", "fick", "hurens", "wichs", "scheiss", "schlamp", "missgeb", "drecks",
];

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g", "@": "a", $: "s", "!": "i", "|": "i" };

function stripAccents(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* The plain letters a word spells, with its disguises undone. */
function plain(word) {
  // punctuation around the word isn't part of it ("porra!" is "porra")
  const core = stripAccents(word.toLowerCase().replace(/ß/g, "ss")).replace(/^[^a-z0-9@$]+|[^a-z0-9@$]+$/g, "");
  let out = "";
  for (const ch of core) {
    const letter = LEET[ch] || ch;
    if (/[a-z]/.test(letter)) out += letter;
  }
  return out.replace(/(.)\1+/g, "$1"); // "porrrra" -> "pora"
}

const BAD_WORDS = new Set(WORDS.map(plain));
const BAD_STEMS = STEMS.map(plain);

function isBad(word) {
  const p = plain(word);
  if (!p) return false;
  return BAD_WORDS.has(p) || BAD_STEMS.some((stem) => p.startsWith(stem));
}

/* Asterisks for the word itself; punctuation around it stays ("merda." -> "*****."). */
function stars(word) {
  const [, lead, core, trail] = word.match(/^([^\p{L}\p{N}@$]*)(.*?)([^\p{L}\p{N}@$]*)$/su);
  return lead + "*".repeat(Array.from(core || word).length) + trail;
}

/* The message with every bad word replaced by asterisks, and whether any was. */
function filterChat(text) {
  const parts = text.split(/(\s+)/); // words at even places, the spaces between them at odd ones
  let changed = false;

  // letters typed one by one ("p o r r a"): judge a run of three or more as one word
  for (let i = 0; i < parts.length; i += 2) {
    let j = i;
    while (j < parts.length && Array.from(parts[j]).length === 1) j += 2;
    const run = [];
    for (let k = i; k < j; k += 2) run.push(parts[k]);
    if (run.length >= 3 && isBad(run.join(""))) {
      for (let k = i; k < j; k += 2) parts[k] = "*";
      changed = true;
    }
    if (j > i) i = j - 2;
  }

  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i] && parts[i] !== "*" && isBad(parts[i])) {
      parts[i] = stars(parts[i]);
      changed = true;
    }
  }
  return { text: parts.join(""), changed };
}

/* What a chat message may be: one line, no control characters, at most `max` letters. */
function cleanChat(text, max) {
  if (typeof text !== "string") return "";
  const line = text
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ") // control, invisible and direction marks
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(line).slice(0, max).join("").trim();
}

module.exports = { filterChat, cleanChat, isBad };
