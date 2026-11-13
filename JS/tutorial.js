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

/* Words that change between the mouse and a touch screen. */
const touchy = (mouse, touch) => () => (isTouchMode() ? touch : mouse);

const TUTORIAL_STEPS = [
  {
    title: "Moinhos",
    text: touchy(
      "Ouro paga tudo, e o moinho faz ouro todo segundo. Clique no Moinho (tecla 3) e depois perto da sua ilha.",
      "Ouro paga tudo, e o moinho faz ouro todo segundo. Toque no Moinho e depois perto da sua ilha."
    ),
    foot: touchy("W A S D movem a câmera · H volta à ilha", "O joystick move a câmera · Ilha volta para casa"),
    target: tool("generator-button"),
    done: () => countGenerators() > 0,
  },
  {
    title: "Cabanas",
    text: touchy(
      "Cada cabana aumenta em 2 o limite de botes da sua frota. Construa uma (tecla 4).",
      "Cada cabana aumenta em 2 o limite de botes da sua frota. Construa uma."
    ),
    target: tool("house-button"),
    done: byDesign("house"),
  },
  {
    title: "Canhões",
    text: touchy(
      "Canhões atiram nos barcos inimigos que chegam perto. O Canhão longo (tecla 5) alcança mais longe e bate mais forte, mas custa mais. Construa um canhão (tecla 2).",
      "Canhões atiram nos barcos inimigos que chegam perto. O Canhão longo alcança mais longe e bate mais forte, mas custa mais. Construa um canhão."
    ),
    target: tool("turret-button"),
    done: byDesign("turret", "sniper"),
  },
  {
    title: "Recifes",
    text: touchy(
      "Recifes bloqueiam os barcos inimigos. Ponha alguns na frente dos canhões, para os barcos pararem debaixo do fogo (tecla 1).",
      "Recifes bloqueiam os barcos inimigos. Ponha alguns na frente dos canhões, para os barcos pararem debaixo do fogo."
    ),
    target: tool("wall-button"),
    done: byDesign("wall"),
  },
  {
    title: "Cais",
    text: touchy(
      "O cais produz os botes que atacam as outras ilhas. Junte 120 de ouro e construa um (tecla 7).",
      "O cais produz os botes que atacam as outras ilhas. Junte 120 de ouro e construa um."
    ),
    target: tool("tent-button"),
    done: byDesign("tent"),
  },
  {
    title: "Mandar a frota",
    text: touchy(
      "Quando os botes surgirem, clique no mapa para mandá-los até lá. Sua ilha nasce protegida: aperte Espaço para atacar, sabendo que a partir daí também podem atacar você.",
      "Quando os botes surgirem, toque no mapa para mandá-los até lá. Sua ilha nasce protegida: toque em PvP para atacar, sabendo que a partir daí também podem atacar você."
    ),
    target: () => null,
    done: () => state.orderedFleet,
    explain: true,
  },
  {
    title: "Arsenal",
    text: touchy(
      "O Arsenal (tecla 6) pesquisa melhorias para a frota: casco reforçado, velas novas, canhões de bordo e cortina de névoa. Com a ferramenta do Arsenal, clique nele para comprar a próxima.",
      "O Arsenal pesquisa melhorias para a frota: casco reforçado, velas novas, canhões de bordo e cortina de névoa. Com a ferramenta do Arsenal, toque nele para comprar a próxima."
    ),
    target: tool("armory-button"),
    explain: true,
  },
  {
    title: "Como montar a base",
    html: () =>
      "<p>Comece sempre pelos moinhos: sem ouro não há base. Depois escolha um estilo:</p>" +
      "<ul>" +
      "<li><b>Fortaleza:</b> nenhum cais, muitos canhões e recifes. Você não ataca, mas fica difícil de afundar e junta ouro.</li>" +
      "<li><b>Equilibrada:</b> mais canhões do que cais. Defende bem e ainda manda botes.</li>" +
      "</ul>",
    target: () => null,
    explain: true,
  },
  {
    title: "Evoluções",
    text: touchy(
      "Para evoluir, escolha a ferramenta de uma construção e clique numa igual que já está no mapa. Na primeira evolução você escolhe um de dois caminhos, e a escolha é definitiva.",
      "Para evoluir, escolha a ferramenta de uma construção e toque numa igual que já está no mapa. Na primeira evolução você escolhe um de dois caminhos, e a escolha é definitiva."
    ),
    target: () => null,
    done: () => placement.placed.some((p) => (p.level || 1) > 1 || (p.tier || 1) > 1),
    explain: true,
  },
  {
    title: "Conquistas",
    text: () => "Jogando, você ganha conquistas. Cada uma vira uma insígnia para usar embaixo do seu nome, escolhida no menu.",
    target: tool("achievements-hint"),
    explain: true,
  },
  {
    title: "Chat e regras",
    html: () =>
      "<p>" +
      (isTouchMode() ? "O botão Chat abre a conversa com todos." : "Enter abre a conversa com todos.") +
      " Para o mar ser bom para todo mundo:</p>" +
      "<ul>" +
      "<li>trate os outros capitães com respeito;</li>" +
      "<li>nada de ofensas, palavrões ou preconceito;</li>" +
      "<li>não passe dados pessoais, como endereço, telefone ou senhas.</li>" +
      "</ul>" +
      "<p>Se alguém incomodar, " + (isTouchMode() ? "toque" : "clique") + " no nome dele no chat para silenciar.</p>",
    target: () => {
      if (!settings.chat) return null;
      return document.getElementById(isTouchMode() ? "touch-chat" : "chat-hint");
    },
    explain: true,
    finish: "Bons ventos!",
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
    showToast("Tutorial concluído. Bons ventos, capitão!", "good");
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

  document.getElementById("tutorial-count").textContent = "Passo " + (i + 1) + " de " + TUTORIAL_STEPS.length;
  document.getElementById("tutorial-title").textContent = step.title;

  const foot = document.getElementById("tutorial-foot");
  foot.textContent = step.foot ? step.foot() : "";
  foot.hidden = !step.foot;

  const ok = document.getElementById("tutorial-ok");
  ok.hidden = !step.explain;
  ok.textContent = step.finish || "Entendi";
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

window.addEventListener("DOMContentLoaded", () => {
  loadTutorial();
  document.getElementById("tutorial-ok").addEventListener("click", nextTutorialStep);
  document.getElementById("tutorial-skip").addEventListener("click", () => {
    finishTutorial();
    showToast("Tutorial pulado. Dá para rever nas configurações.");
  });
  document.getElementById("settings-tutorial").addEventListener("click", () => {
    restartTutorial();
    closeSettings();
  });
  setInterval(updateTutorial, 200);
});
