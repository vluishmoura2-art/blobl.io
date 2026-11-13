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

const SEEN_VERSION_KEY = "hightide.seenVersion";

function changelogOpen() {
  const panel = document.getElementById("changelog");
  return !!panel && !panel.hidden;
}

function renderChangelog() {
  const list = document.getElementById("changelog-list");
  list.textContent = "";

  for (const entry of CHANGELOG) {
    const section = document.createElement("section");
    section.className = "cl-version";

    const head = document.createElement("h3");
    const num = document.createElement("span");
    num.className = "cl-number";
    num.textContent = "Versão " + entry.version;
    const date = document.createElement("span");
    date.className = "cl-date";
    date.textContent = entry.date;
    head.append(num, date);

    const title = document.createElement("p");
    title.className = "cl-title";
    title.textContent = entry.title;
    section.append(head, title);

    for (const [label, items] of [["Novidades", entry.news], ["Correções", entry.fixes]]) {
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
  showToast("Saiu a versão " + version + ". Recarregue a página para jogar com ela.", "bad");
}

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
