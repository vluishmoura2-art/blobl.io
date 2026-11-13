"use strict";

/* =========================================================
   hightide.io - what's new

   Every version, newest first, with what it added and what it
   fixed. The list opens by itself once when a new version comes
   out (remembered in this browser); after that, the "Novidades"
   button in the menu opens it. If the server is already on a
   newer version than this page, a notice asks for a reload.
   ========================================================= */

const CHANGELOG = [
  {
    version: "1.4",
    date: "13/11",
    title: "Três idiomas",
    news: [
      "Escolha o idioma no menu: Brasil (São Paulo), Inglês (EUA) ou Alemão (Frankfurt). Menus, construções, evoluções, conquistas, tutorial e esta lista mudam na hora.",
      "O filtro do chat também reconhece palavrões em alemão.",
    ],
    fixes: [],
  },
  {
    version: "1.3",
    date: "13/11",
    title: "Configurações, chat e tutorial",
    news: [
      "Painel de configurações, aberto pelo menu ou pela engrenagem ao lado do ouro.",
      "Mira presa: o jogo prende o mouse e desenha a própria mira, com sensi de 0,2× a 3×. Na borda da tela, a mira move o mapa.",
      "Tamanho da mira e velocidade da câmera ajustáveis.",
      "Chat geral: Enter abre e envia, até 120 letras. No celular, pelo botão Chat.",
      "Filtro de palavrões no servidor, que pega também palavras disfarçadas, como “p0rr4”. O nome do capitão passa pelo mesmo filtro.",
      "Clique no nome de um capitão no chat para silenciá-lo só para você.",
      "O chat avisa quem entra e quem sai do mar, e pode ser desligado nas configurações.",
      "Tutorial guiado em balões, dos moinhos às regras do chat. Dá para pular e rever nas configurações.",
      "Esta lista de novidades, que abre sozinha quando sai uma versão nova.",
    ],
    fixes: [
      "As teclas do jogo não disparam enquanto você digita no chat ou com as configurações abertas.",
      "Quem ficar com a página aberta durante uma atualização recebe um aviso para recarregar.",
    ],
  },
  {
    version: "1.2",
    date: "08 e 09/11",
    title: "Celular e tablet",
    news: [
      "Joystick para mover a câmera e botões de PvP, Ilha e Cancelar.",
      "Toque no mapa funciona como clique, com a prévia seguindo o dedo; um toque longo num botão mostra a dica.",
      "Em telas pequenas, o mapa é visto de mais longe e os textos continuam legíveis.",
      "Barra de construções, placar e painéis adaptados para tablet e celular.",
    ],
    fixes: [
      "No celular, a aba Conquistas fica abaixo do placar, longe dos botões de toque.",
      "O mapa e o zoom se ajustam ao girar o aparelho e quando a barra de endereço aparece.",
      "Os controles de toque não travam se o navegador recusar prender o dedo ao botão.",
    ],
  },
  {
    version: "1.1",
    date: "08/11",
    title: "Evoluções",
    news: [
      "Construções evoluem até o nível 4, escolhendo um de dois caminhos na primeira evolução.",
      "Canhão: Bateria rápida ou Metralha. Moinho: Engenho de ouro ou Oficina de reparos.",
      "Recife: Muralha de coral ou Recife cortante. Canhão longo: Atirador de elite ou Perfurante.",
      "Cabana: Vila ou Escola de marujos.",
      "O servidor cobra cada nível em ordem e não deixa trocar o caminho escolhido.",
      "Contador de FPS opcional, com ?fps no endereço.",
    ],
    fixes: [
      "O combate no servidor ficou até 7 vezes mais rápido com muitos jogadores.",
      "Evoluções que valiam pouco pelo preço ficaram mais baratas.",
    ],
  },
  {
    version: "1.0",
    date: "07/11",
    title: "Nasce o hightide.io",
    news: [
      "Novo nome e identidade própria: carta náutica, ilhas, construções e barcos desenhados para o jogo, e tudo em português.",
      "O servidor guarda o ouro e confere cada compra, posição, barco e movimento, contra trapaças.",
      "Canhões que miram, tiros, explosões e barcos que se movem suavemente.",
      "Primeiros passos para quem começa, aviso de quando você está sozinho e convite por link.",
      "Vida da ilha, renda, frota e limites sempre à vista.",
      "Dá para jogar de novo sem recarregar a página.",
      "O som saiu do jogo nesta versão.",
    ],
    fixes: [
      "Trocar de lugar, digitar o nome, botões fora da tela e o painel de conquistas voltaram a funcionar direito.",
      "Construções não somem mais quando a conexão ou o jogo estão lentos.",
    ],
  },
  {
    version: "0.3",
    date: "17/10",
    title: "Visual Oceanbound",
    news: [
      "Visual novo: painéis de vidro, cores neon, partículas e fundo de oceano.",
      "Ícones novos, botões arredondados com brilho e indicador de conexão pulsando.",
      "Animações de esticar e encolher, rastros que somem aos poucos e câmera suave.",
    ],
    fixes: [],
  },
  {
    version: "0.2",
    date: "13/10",
    title: "Conquistas",
    news: [
      "Conquistas, guardadas no seu navegador.",
      "Insígnia: escolha uma conquista no menu para mostrar embaixo do seu nome.",
      "O servidor conta os abates: leva quem causou mais dano.",
    ],
    fixes: [],
  },
  {
    version: "0.1",
    date: "11 e 12/10",
    title: "Primeira versão",
    news: [
      "Mapa grande com câmera em W A S D e sua base no meio.",
      "Sete construções em volta da base, pagas com ouro, que podem trocar de lugar ou ser removidas.",
      "Tendas que produzem soldados, mandados com um clique no mapa.",
      "Multiplayer com servidor próprio, placar, zona segura no começo e PvP com Espaço.",
      "Tanques e tanques de cerco (hoje fragatas e galeões), evolução das tendas e pesquisas no arsenal.",
      "Menu com nome e cor, efeitos de partículas e tremor de tela, sons e música.",
    ],
    fixes: [],
  },
];

/* The same list in English and German, by version, in the same order. */
const CHANGELOG_TRANSLATIONS = {
  en: {
    "1.4": {
      date: "Nov 13",
      title: "Three languages",
      news: [
        "Pick the language in the menu: Brazil (São Paulo), English (USA) or German (Frankfurt). Menus, buildings, upgrades, achievements, the tutorial and this list switch right away.",
        "The chat filter also recognizes German swear words.",
      ],
      fixes: [],
    },
    "1.3": {
      date: "Nov 13",
      title: "Settings, chat and tutorial",
      news: [
        "Settings panel, opened from the menu or from the gear next to the gold.",
        "Locked aim: the game locks the mouse and draws its own cursor, with a sensitivity from 0.2× to 3×. At the edge of the screen, the cursor pans the map.",
        "Adjustable crosshair size and camera speed.",
        "Chat with everyone: Enter opens and sends, up to 120 letters. On phones, use the Chat button.",
        "A swear filter on the server that also catches disguised words, like “p0rr4”. Captain names go through the same filter.",
        "Click a captain's name in the chat to mute them, just for you.",
        "The chat says who sets sail and who leaves, and it can be turned off in the settings.",
        "A guided tutorial in balloons, from windmills to the chat rules. You can skip it and replay it in the settings.",
        "This list of what's new, which opens by itself when a new version comes out.",
      ],
      fixes: [
        "The game's keys stay quiet while you type in the chat or have the settings open.",
        "Anyone with the page open during an update is told to reload.",
      ],
    },
    "1.2": {
      date: "Nov 8–9",
      title: "Phones and tablets",
      news: [
        "A joystick to move the camera, plus PvP, Island and Cancel buttons.",
        "Tapping the map works like a click, with the preview following your finger; a long press on a button shows its tip.",
        "On small screens the map is seen from farther away and the text stays readable.",
        "Toolbar, leaderboard and panels adapted for tablets and phones.",
      ],
      fixes: [
        "On phones, the Achievements tab sits under the leaderboard, away from the touch buttons.",
        "The map and the zoom adjust when you turn the device and when the address bar shows up.",
        "The touch controls don't freeze if the browser refuses to tie the finger to the button.",
      ],
    },
    "1.1": {
      date: "Nov 8",
      title: "Upgrades",
      news: [
        "Buildings upgrade up to level 4, choosing one of two paths on the first upgrade.",
        "Cannon: Rapid battery or Grapeshot. Windmill: Gold works or Repair workshop.",
        "Reef: Coral wall or Razor reef. Long gun: Marksman or Piercing.",
        "Hut: Village or Sailors' school.",
        "The server charges each level in order and won't let you change the chosen path.",
        "Optional FPS counter, with ?fps in the address.",
      ],
      fixes: [
        "Combat on the server got up to 7 times faster with many players.",
        "Upgrades that were worth little for their price got cheaper.",
      ],
    },
    "1.0": {
      date: "Nov 7",
      title: "hightide.io is born",
      news: [
        "A new name and an identity of its own: a nautical chart, islands, buildings and boats drawn for the game, all in Portuguese.",
        "The server keeps the gold and checks every purchase, position, boat and move, against cheating.",
        "Cannons that aim, shots, explosions and boats that move smoothly.",
        "First steps for newcomers, a notice when you're alone and an invite link.",
        "Island health, income, fleet and limits always in sight.",
        "You can play again without reloading the page.",
        "Sound was removed from the game in this version.",
      ],
      fixes: [
        "Swapping places, typing your name, buttons off the screen and the achievements panel work properly again.",
        "Buildings no longer vanish when the connection or the game is slow.",
      ],
    },
    "0.3": {
      date: "Oct 17",
      title: "Oceanbound look",
      news: [
        "A new look: glass panels, neon colors, particles and an ocean background.",
        "New icons, rounded glowing buttons and a pulsing connection indicator.",
        "Squash-and-stretch animations, trails that fade out and a smooth camera.",
      ],
      fixes: [],
    },
    "0.2": {
      date: "Oct 13",
      title: "Achievements",
      news: [
        "Achievements, saved in your browser.",
        "Badge: pick an achievement in the menu to show under your name.",
        "The server counts kills: whoever did the most damage gets it.",
      ],
      fixes: [],
    },
    "0.1": {
      date: "Oct 11–12",
      title: "First version",
      news: [
        "A large map with a W A S D camera and your base in the middle.",
        "Seven buildings around the base, paid with gold, that can swap places or be removed.",
        "Tents that make soldiers, sent with a click on the map.",
        "Multiplayer on its own server, with a leaderboard, a safe zone at the start and PvP with Space.",
        "Tanks and siege tanks (frigates and galleons today), tent upgrades and research at the arsenal.",
        "A menu with name and color, particle effects and screen shake, sounds and music.",
      ],
      fixes: [],
    },
  },
  de: {
    "1.4": {
      date: "13.11.",
      title: "Drei Sprachen",
      news: [
        "Wähl die Sprache im Menü: Brasilien (São Paulo), Englisch (USA) oder Deutsch (Frankfurt). Menüs, Gebäude, Verbesserungen, Erfolge, das Tutorial und diese Liste wechseln sofort.",
        "Der Chatfilter erkennt auch deutsche Schimpfwörter.",
      ],
      fixes: [],
    },
    "1.3": {
      date: "13.11.",
      title: "Einstellungen, Chat und Tutorial",
      news: [
        "Einstellungen, zu öffnen über das Menü oder das Zahnrad neben dem Gold.",
        "Fixiertes Zielen: Das Spiel fixiert die Maus und zeichnet einen eigenen Cursor, mit einer Empfindlichkeit von 0,2× bis 3×. Am Bildschirmrand verschiebt der Cursor die Karte.",
        "Einstellbare Größe des Fadenkreuzes und Kamerageschwindigkeit.",
        "Chat mit allen: Enter öffnet und sendet, bis zu 120 Zeichen. Auf dem Handy über den Chat-Knopf.",
        "Ein Schimpfwortfilter auf dem Server, der auch getarnte Wörter wie „p0rr4“ erkennt. Kapitänsnamen laufen durch denselben Filter.",
        "Klick im Chat auf den Namen eines Kapitäns, um ihn nur für dich stummzuschalten.",
        "Der Chat meldet, wer in See sticht und wer geht, und lässt sich in den Einstellungen ausschalten.",
        "Ein geführtes Tutorial in Sprechblasen, von den Windmühlen bis zu den Chatregeln. Du kannst es überspringen und in den Einstellungen wiederholen.",
        "Diese Liste der Neuigkeiten, die sich bei einer neuen Version von selbst öffnet.",
      ],
      fixes: [
        "Die Spieltasten bleiben ruhig, während du im Chat schreibst oder die Einstellungen offen sind.",
        "Wer die Seite während eines Updates offen hat, wird gebeten, sie neu zu laden.",
      ],
    },
    "1.2": {
      date: "8.–9.11.",
      title: "Handy und Tablet",
      news: [
        "Ein Joystick für die Kamera und Knöpfe für PvP, Insel und Abbrechen.",
        "Tippen auf die Karte wirkt wie ein Klick, die Vorschau folgt dem Finger; langes Drücken auf einen Knopf zeigt seinen Tipp.",
        "Auf kleinen Bildschirmen sieht man die Karte aus größerer Entfernung, und die Texte bleiben lesbar.",
        "Werkzeugleiste, Rangliste und Fenster für Tablet und Handy angepasst.",
      ],
      fixes: [
        "Auf dem Handy liegt der Reiter Erfolge unter der Rangliste, weg von den Touch-Knöpfen.",
        "Karte und Zoom passen sich an, wenn du das Gerät drehst und wenn die Adressleiste erscheint.",
        "Die Touch-Steuerung hängt nicht, wenn der Browser den Finger nicht an den Knopf binden will.",
      ],
    },
    "1.1": {
      date: "8.11.",
      title: "Verbesserungen",
      news: [
        "Gebäude lassen sich bis Stufe 4 verbessern; bei der ersten Verbesserung wählst du einen von zwei Wegen.",
        "Kanone: Schnellfeuerbatterie oder Kartätsche. Windmühle: Goldmühle oder Reparaturwerkstatt.",
        "Riff: Korallenmauer oder Scharfes Riff. Langrohrkanone: Scharfschütze oder Durchschlag.",
        "Hütte: Dorf oder Matrosenschule.",
        "Der Server berechnet jede Stufe der Reihe nach und lässt den gewählten Weg nicht mehr ändern.",
        "Optionaler FPS-Zähler mit ?fps in der Adresse.",
      ],
      fixes: [
        "Der Kampf auf dem Server ist bei vielen Spielern bis zu 7-mal schneller.",
        "Verbesserungen, die für ihren Preis wenig brachten, sind billiger geworden.",
      ],
    },
    "1.0": {
      date: "7.11.",
      title: "hightide.io ist geboren",
      news: [
        "Neuer Name und eigene Identität: eine Seekarte, Inseln, Gebäude und Boote, eigens für das Spiel gezeichnet, alles auf Portugiesisch.",
        "Der Server verwaltet das Gold und prüft jeden Kauf, jede Position, jedes Boot und jede Bewegung gegen Schummeln.",
        "Kanonen, die zielen, Schüsse, Explosionen und Boote, die sich weich bewegen.",
        "Erste Schritte für Neulinge, ein Hinweis, wenn du allein bist, und Einladung per Link.",
        "Leben der Insel, Einkommen, Flotte und Limits immer im Blick.",
        "Du kannst erneut spielen, ohne die Seite neu zu laden.",
        "Der Ton wurde in dieser Version entfernt.",
      ],
      fixes: [
        "Plätze tauschen, den Namen eintippen, Knöpfe außerhalb des Bildschirms und das Erfolgsfenster funktionieren wieder richtig.",
        "Gebäude verschwinden nicht mehr, wenn die Verbindung oder das Spiel langsam ist.",
      ],
    },
    "0.3": {
      date: "17.10.",
      title: "Oceanbound-Look",
      news: [
        "Ein neuer Look: Glasflächen, Neonfarben, Partikel und ein Ozean im Hintergrund.",
        "Neue Symbole, abgerundete leuchtende Knöpfe und eine pulsierende Verbindungsanzeige.",
        "Stauch-und-Streck-Animationen, verblassende Spuren und eine weiche Kamera.",
      ],
      fixes: [],
    },
    "0.2": {
      date: "13.10.",
      title: "Erfolge",
      news: [
        "Erfolge, gespeichert in deinem Browser.",
        "Abzeichen: Wähl im Menü einen Erfolg, der unter deinem Namen erscheint.",
        "Der Server zählt Abschüsse: Wer den meisten Schaden gemacht hat, bekommt ihn.",
      ],
      fixes: [],
    },
    "0.1": {
      date: "11.–12.10.",
      title: "Erste Version",
      news: [
        "Eine große Karte mit Kamera auf W A S D und deiner Basis in der Mitte.",
        "Sieben Gebäude rund um die Basis, mit Gold bezahlt, die Plätze tauschen oder abgerissen werden können.",
        "Zelte, die Soldaten machen, mit einem Klick auf die Karte losgeschickt.",
        "Mehrspieler auf eigenem Server, mit Rangliste, Schutzzone am Anfang und PvP mit der Leertaste.",
        "Panzer und Belagerungspanzer (heute Fregatten und Galeonen), Zelt-Verbesserungen und Forschung im Arsenal.",
        "Ein Menü mit Name und Farbe, Partikeleffekte und Bildschirmwackeln, Töne und Musik.",
      ],
      fixes: [],
    },
  },
};

/* An entry in the current language (Portuguese is the list above). */
function entryText(entry) {
  const tr = CHANGELOG_TRANSLATIONS[LANG] && CHANGELOG_TRANSLATIONS[LANG][entry.version];
  return tr || entry;
}

const SEEN_VERSION_KEY = "hightide.seenVersion";

function changelogOpen() {
  const panel = document.getElementById("changelog");
  return !!panel && !panel.hidden;
}

function renderChangelog() {
  const list = document.getElementById("changelog-list");
  list.textContent = "";

  for (const entry of CHANGELOG) {
    const text = entryText(entry);
    const section = document.createElement("section");
    section.className = "cl-version";

    const head = document.createElement("h3");
    const num = document.createElement("span");
    num.className = "cl-number";
    num.textContent = t("news.version", { v: entry.version });
    num.dataset.current = t("news.current");
    const date = document.createElement("span");
    date.className = "cl-date";
    date.textContent = text.date;
    head.append(num, date);

    const title = document.createElement("p");
    title.className = "cl-title";
    title.textContent = text.title;
    section.append(head, title);

    for (const [label, items] of [[t("news.added"), text.news], [t("news.fixed"), text.fixes]]) {
      if (!items.length) continue;
      const h = document.createElement("h4");
      h.textContent = label;
      const ul = document.createElement("ul");
      for (const item of items) {
        const li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
      }
      section.append(h, ul);
    }
    list.appendChild(section);
  }
}

let changelogOpener = null;

function openChangelog() {
  if (typeof releaseAim === "function") releaseAim();
  changelogOpener = document.activeElement;
  document.getElementById("changelog").hidden = false;
  document.getElementById("changelog-list").scrollTop = 0;
  document.getElementById("changelog-done").focus();
  markVersionSeen();
}

function closeChangelog() {
  document.getElementById("changelog").hidden = true;
  if (changelogOpener && document.contains(changelogOpener)) changelogOpener.focus();
  changelogOpener = null;
}

function readSeenVersion() {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return GAME_VERSION; // no storage: never open by itself
  }
}

function markVersionSeen() {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, GAME_VERSION);
  } catch {
    /* not saved */
  }
}

/* Someone who has played before (settings, tutorial, conquests saved here). */
function playedBefore() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key !== SEEN_VERSION_KEY && /^(hightide|blobl)\./.test(key)) return true;
    }
  } catch {
    /* no storage */
  }
  return false;
}

/* The server told us its version (net.js, on welcome). */
function checkServerVersion(version) {
  if (typeof version !== "string" || version === GAME_VERSION) return;
  showToast(t("news.reload", { v: version }), "bad");
}

onLanguageChange(renderChangelog);

window.addEventListener("DOMContentLoaded", () => {
  renderChangelog();
  document.getElementById("menu-version").textContent = "v" + GAME_VERSION;

  const panel = document.getElementById("changelog");
  document.getElementById("menu-news").addEventListener("click", openChangelog);
  document.getElementById("changelog-done").addEventListener("click", closeChangelog);
  document.getElementById("changelog-close").addEventListener("click", closeChangelog);
  panel.addEventListener("click", (e) => {
    if (e.target === panel) closeChangelog();
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeChangelog();
    }
  });

  const seen = readSeenVersion();
  if (seen === GAME_VERSION) return;
  if (!seen && !playedBefore()) {
    markVersionSeen(); // a first visit has nothing "new" to catch up on
    return;
  }
  openChangelog();
});
