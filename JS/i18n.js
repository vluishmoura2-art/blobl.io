"use strict";

/* =========================================================
   hightide.io - languages

   Portuguese (Brazil), English (US) and German. The choice is
   made in the menu and saved in this browser; the first visit
   follows the browser's language.

   - t("key", { name: "Ana" }) returns the text in the current
     language, with {name} filled in.
   - Fixed page text is marked in index.html with data-i18n
     (text), data-i18n-html (markup) and data-i18n-attr
     ("aria-label:key; placeholder:key").
   - Names and descriptions that live in data (buildings,
     upgrade paths, research, docks, achievements) are swapped
     in place, so every screen that reads them follows.
   - Anything drawn by code listens with onLanguageChange().
   ========================================================= */

const LANG_KEY = "hightide.lang";
const LANGUAGES = ["pt", "en", "de"];
const LOCALES = { pt: "pt-BR", en: "en-US", de: "de-DE" };

const TEXTS = {
  pt: {
    "lang.pt": "Brasil (São Paulo)",
    "lang.en": "Inglês (EUA)",
    "lang.de": "Alemão (Frankfurt)",
    "menu.language": "Idioma",
    "menu.subtitle": "Erga sua ilha. Arme a costa. Lance sua frota.",
    "menu.name": "Nome do capitão",
    "menu.defaultName": "Capitão",
    "menu.flag": "Bandeira",
    "menu.flagN": "Bandeira {n}",
    "menu.tag": "Insígnia",
    "menu.noTag": "Sem insígnia",
    "menu.earnTag": "Conquiste uma jogando",
    "menu.play": "Zarpar",
    "menu.connecting": "Conectando...",
    "menu.retry": "Tentar de novo",
    "menu.news": "Novidades",
    "menu.serverDown": "Não foi possível falar com o servidor. Tente de novo em instantes.",
    "common.close": "Fechar",
    "settings.title": "Configurações",
    "settings.close": "Fechar configurações",
    "settings.aim": "Mira",
    "settings.aimLock": "Mira presa",
    "settings.aimNote": "Clique no mapa para prender o mouse: a mira do jogo anda conforme a sensi e, na borda da tela, move o mapa. Esc solta o mouse.",
    "settings.sensi": "Sensi da mira",
    "settings.aimSize": "Tamanho da mira",
    "settings.chat": "Chat",
    "settings.showChat": "Mostrar o chat",
    "settings.chatNote": "Desligado, você não vê nem manda mensagens.",
    "settings.tutorial": "Tutorial",
    "settings.replay": "Rever o tutorial",
    "settings.camera": "Câmera",
    "settings.cameraSpeed": "Velocidade da câmera",
    "settings.reset": "Restaurar padrão",
    "settings.done": "Pronto",
    "aim.locked": "Mira presa. Esc solta o mouse.",
    "tool.swap": "Trocar de lugar",
    "tool.swapDesc": "Arraste uma construção até outra para trocá-las.",
    "tool.delete": "Remover",
    "tool.deleteDesc": "Clique em uma construção para removê-la e receber metade do preço.",
    "tool.max": "máx.",
    "tool.gold": "{n} de ouro",
    "tool.hp": "{n} de vida",
    "tool.range": "{n} de alcance",
    "tool.limit": "máximo {n}",
    "tool.evolves": " Evolui como {a} ou {b}.",
    "hud.gold": "Ouro",
    "hud.islandHp": "Vida da ilha",
    "hud.island": "Ilha",
    "hud.fleet": "Frota",
    "fleet.soldier": "Botes",
    "fleet.tank": "Fragatas",
    "fleet.siege": "Galeões",
    "boats.soldier": "botes",
    "boats.tank": "fragatas",
    "boats.siege": "galeões",
    "deny.limit": "Limite atingido: máximo de {n} ({name})",
    "deny.noRoom": "Não cabe aqui: já tem uma construção nesse lugar",
    "deny.gold": "Ouro insuficiente: faltam {n}",
    "deny.dockMax": "Este cais já está no nível máximo",
    "deny.buildingMax": "Esta construção já está no nível máximo",
    "deny.allResearch": "Todas as pesquisas já foram feitas",
    "deny.swap": "Essas construções não cabem trocadas",
    "toast.dockReady": "{name} pronto: produz {boats}",
    "toast.noBoats": "Você ainda não tem barcos: construa um cais",
    "toast.rotate": "Dica: deite o celular para ver mais do mapa",
    "toast.copied": "Link copiado: envie para um amigo",
    "toast.sendLink": "Envie este link: {url}",
    "hint.maxLevel": "Nível máximo",
    "hint.allResearch": "Tudo pesquisado",
    "hint.choose": "Clique para escolher a evolução",
    "hint.pathLevel": "{path}, nível {n}",
    "upgrade.title": "{name}: escolha a evolução",
    "upgrade.next": "Nível 2: {desc}",
    "upgrade.note": "A escolha é definitiva. Teclas 1 e 2 escolhem, Esc fecha.",
    "upgrade.done": "{name}: {path}, nível {n}",
    "touch.cancel": "Cancelar",
    "touch.chat": "Chat",
    "battle.someone": "Um capitão",
    "battle.youSank": "Você afundou a ilha de {name}!",
    "battle.sank": "{name} naufragou",
    "battle.underAttack": "Sua ilha está sob ataque!",
    "net.waiting": "Conectado, aguardando a ilha...",
    "net.disconnected": "Desconectado",
    "net.protectionEnd": "Fim da proteção: agora sua ilha pode ser atacada",
    "net.pvpOn": "PvP ativo: agora você pode atacar e ser atacado",
    "plate.safe": "Protegido: {s} s",
    "plate.pvp": "PvP ativo",
    "lb.title": "Placar",
    "lb.empty": "Sem jogadores",
    "lb.online1": "{n} capitão online",
    "lb.online": "{n} capitães online",
    "lb.pvpHint": "Espaço: ativar PvP",
    "lb.alone": "Aguardando outros capitães. Enquanto isso, fortaleça sua ilha.",
    "lb.invite": "Copiar convite",
    "ach.title": "Conquistas",
    "ach.close": "Fechar conquistas",
    "ach.toast": "Conquista: {name}",
    "end.sunk": "Naufragou",
    "end.destroyedShort": "Sua ilha foi destruída.",
    "end.sunkBy": "Sua ilha foi afundada por {name}. ",
    "end.destroyed": "Sua ilha foi destruída. ",
    "end.lasted": "Você resistiu por {time} e destruiu {targets}.",
    "end.minutes": "{m} min {s} s",
    "end.seconds": "{s} s",
    "end.target1": "1 alvo",
    "end.targets": "{n} alvos",
    "end.lost": "Conexão perdida",
    "end.lostText": "A partida terminou porque a ligação com o servidor caiu.",
    "end.again": "Zarpar de novo",
    "end.menu": "Voltar ao menu",
    "chat.placeholder": "Mensagem para todos",
    "chat.label": "Mensagem do chat",
    "chat.hint": "Enter: conversar · clique num nome para silenciar",
    "chat.join": "{name} entrou no mar.",
    "chat.leave": "{name} saiu do mar.",
    "chat.wait": "Calma, capitão: espere {s} s para mandar outra mensagem.",
    "chat.muteTitle": "Silenciar {name}",
    "chat.muted": "Você silenciou {name}.",
    "chat.unmuted": "Você voltou a ouvir {name}.",
    "chat.undo": "Desfazer",
    "tut.count": "Passo {i} de {n}",
    "tut.skip": "Pular tutorial",
    "tut.wait": "Faça isso para continuar",
    "tut.ok": "Entendi",
    "tut.finish": "Bons ventos!",
    "tut.done": "Tutorial concluído. Bons ventos, capitão!",
    "tut.skipped": "Tutorial pulado. Dá para rever nas configurações.",
    "tut.keys": "W A S D movem a câmera · H volta à ilha",
    "tut.keysTouch": "O joystick move a câmera · Ilha volta para casa",
    "tut.mill": "Moinhos",
    "tut.mill.text": "Ouro paga tudo, e o moinho faz ouro todo segundo. Clique no Moinho (tecla 3) e depois perto da sua ilha.",
    "tut.mill.touch": "Ouro paga tudo, e o moinho faz ouro todo segundo. Toque no Moinho e depois perto da sua ilha.",
    "tut.hut": "Cabanas",
    "tut.hut.text": "Cada cabana aumenta em 2 o limite de botes da sua frota. Construa uma (tecla 4).",
    "tut.hut.touch": "Cada cabana aumenta em 2 o limite de botes da sua frota. Construa uma.",
    "tut.gun": "Canhões",
    "tut.gun.text": "Canhões atiram nos barcos inimigos que chegam perto. O Canhão longo (tecla 5) alcança mais longe e bate mais forte, mas custa mais. Construa um canhão (tecla 2).",
    "tut.gun.touch": "Canhões atiram nos barcos inimigos que chegam perto. O Canhão longo alcança mais longe e bate mais forte, mas custa mais. Construa um canhão.",
    "tut.reef": "Recifes",
    "tut.reef.text": "Recifes bloqueiam os barcos inimigos. Ponha alguns na frente dos canhões, para os barcos pararem debaixo do fogo (tecla 1).",
    "tut.reef.touch": "Recifes bloqueiam os barcos inimigos. Ponha alguns na frente dos canhões, para os barcos pararem debaixo do fogo.",
    "tut.dock": "Cais",
    "tut.dock.text": "O cais produz os botes que atacam as outras ilhas. Junte 120 de ouro e construa um (tecla 7).",
    "tut.dock.touch": "O cais produz os botes que atacam as outras ilhas. Junte 120 de ouro e construa um.",
    "tut.fleet": "Mandar a frota",
    "tut.fleet.text": "Quando os botes surgirem, clique no mapa para mandá-los até lá. Sua ilha nasce protegida: aperte Espaço para atacar, sabendo que a partir daí também podem atacar você.",
    "tut.fleet.touch": "Quando os botes surgirem, toque no mapa para mandá-los até lá. Sua ilha nasce protegida: toque em PvP para atacar, sabendo que a partir daí também podem atacar você.",
    "tut.arsenal": "Arsenal",
    "tut.arsenal.text": "O Arsenal (tecla 6) pesquisa melhorias para a frota: casco reforçado, velas novas, canhões de bordo e cortina de névoa. Com a ferramenta do Arsenal, clique nele para comprar a próxima.",
    "tut.arsenal.touch": "O Arsenal pesquisa melhorias para a frota: casco reforçado, velas novas, canhões de bordo e cortina de névoa. Com a ferramenta do Arsenal, toque nele para comprar a próxima.",
    "tut.layout": "Como montar a base",
    "tut.layout.intro": "Comece sempre pelos moinhos: sem ouro não há base. Depois escolha um estilo:",
    "tut.layout.fort": "<b>Fortaleza:</b> nenhum cais, muitos canhões e recifes. Você não ataca, mas fica difícil de afundar e junta ouro.",
    "tut.layout.mixed": "<b>Equilibrada:</b> mais canhões do que cais. Defende bem e ainda manda botes.",
    "tut.upgrade": "Evoluções",
    "tut.upgrade.text": "Para evoluir, escolha a ferramenta de uma construção e clique numa igual que já está no mapa. Na primeira evolução você escolhe um de dois caminhos, e a escolha é definitiva.",
    "tut.upgrade.touch": "Para evoluir, escolha a ferramenta de uma construção e toque numa igual que já está no mapa. Na primeira evolução você escolhe um de dois caminhos, e a escolha é definitiva.",
    "tut.ach": "Conquistas",
    "tut.ach.text": "Jogando, você ganha conquistas. Cada uma vira uma insígnia para usar embaixo do seu nome, escolhida no menu.",
    "tut.chat": "Chat e regras",
    "tut.chat.open": "Enter abre a conversa com todos.",
    "tut.chat.openTouch": "O botão Chat abre a conversa com todos.",
    "tut.chat.intro": "Para o mar ser bom para todo mundo:",
    "tut.chat.rule1": "trate os outros capitães com respeito;",
    "tut.chat.rule2": "nada de ofensas, palavrões ou preconceito;",
    "tut.chat.rule3": "não passe dados pessoais, como endereço, telefone ou senhas.",
    "tut.chat.mute": "Se alguém incomodar, clique no nome dele no chat para silenciar.",
    "tut.chat.muteTouch": "Se alguém incomodar, toque no nome dele no chat para silenciar.",
    "news.title": "Novidades",
    "news.close": "Fechar novidades",
    "news.version": "Versão {v}",
    "news.current": "atual",
    "news.added": "Novidades",
    "news.fixed": "Correções",
    "news.reload": "Saiu a versão {v}. Recarregue a página para jogar com ela.",
  },

  en: {
    "lang.pt": "Brazil (São Paulo)",
    "lang.en": "English (USA)",
    "lang.de": "German (Frankfurt)",
    "menu.language": "Language",
    "menu.subtitle": "Raise your island. Arm the coast. Launch your fleet.",
    "menu.name": "Captain's name",
    "menu.defaultName": "Captain",
    "menu.flag": "Flag",
    "menu.flagN": "Flag {n}",
    "menu.tag": "Badge",
    "menu.noTag": "No badge",
    "menu.earnTag": "Earn one by playing",
    "menu.play": "Set sail",
    "menu.connecting": "Connecting...",
    "menu.retry": "Try again",
    "menu.news": "What's new",
    "menu.serverDown": "Couldn't reach the server. Try again in a moment.",
    "common.close": "Close",
    "settings.title": "Settings",
    "settings.close": "Close settings",
    "settings.aim": "Aim",
    "settings.aimLock": "Locked aim",
    "settings.aimNote": "Click the map to lock the mouse: the game's cursor moves with your sensitivity and, at the edge of the screen, pans the map. Esc releases the mouse.",
    "settings.sensi": "Aim sensitivity",
    "settings.aimSize": "Crosshair size",
    "settings.chat": "Chat",
    "settings.showChat": "Show the chat",
    "settings.chatNote": "When it's off, you neither see nor send messages.",
    "settings.tutorial": "Tutorial",
    "settings.replay": "Replay the tutorial",
    "settings.camera": "Camera",
    "settings.cameraSpeed": "Camera speed",
    "settings.reset": "Restore defaults",
    "settings.done": "Done",
    "aim.locked": "Aim locked. Esc releases the mouse.",
    "tool.swap": "Swap places",
    "tool.swapDesc": "Drag a building onto another to swap them.",
    "tool.delete": "Remove",
    "tool.deleteDesc": "Click a building to remove it and get half its price back.",
    "tool.max": "max",
    "tool.gold": "{n} gold",
    "tool.hp": "{n} health",
    "tool.range": "{n} range",
    "tool.limit": "at most {n}",
    "tool.evolves": " Upgrades into {a} or {b}.",
    "hud.gold": "Gold",
    "hud.islandHp": "Island health",
    "hud.island": "Island",
    "hud.fleet": "Fleet",
    "fleet.soldier": "Dinghies",
    "fleet.tank": "Frigates",
    "fleet.siege": "Galleons",
    "boats.soldier": "dinghies",
    "boats.tank": "frigates",
    "boats.siege": "galleons",
    "deny.limit": "Limit reached: at most {n} ({name})",
    "deny.noRoom": "It doesn't fit here: there's already a building in that spot",
    "deny.gold": "Not enough gold: {n} short",
    "deny.dockMax": "This dock is already at its top level",
    "deny.buildingMax": "This building is already at its top level",
    "deny.allResearch": "All research is done",
    "deny.swap": "These buildings don't fit if swapped",
    "toast.dockReady": "{name} ready: builds {boats}",
    "toast.noBoats": "You have no boats yet: build a dock",
    "toast.rotate": "Tip: turn your phone sideways to see more of the map",
    "toast.copied": "Link copied: send it to a friend",
    "toast.sendLink": "Send this link: {url}",
    "hint.maxLevel": "Top level",
    "hint.allResearch": "Everything researched",
    "hint.choose": "Click to choose the upgrade",
    "hint.pathLevel": "{path}, level {n}",
    "upgrade.title": "{name}: choose the upgrade",
    "upgrade.next": "Level 2: {desc}",
    "upgrade.note": "The choice is final. Keys 1 and 2 choose, Esc closes.",
    "upgrade.done": "{name}: {path}, level {n}",
    "touch.cancel": "Cancel",
    "touch.chat": "Chat",
    "battle.someone": "A captain",
    "battle.youSank": "You sank {name}'s island!",
    "battle.sank": "{name} sank",
    "battle.underAttack": "Your island is under attack!",
    "net.waiting": "Connected, waiting for the island...",
    "net.disconnected": "Disconnected",
    "net.protectionEnd": "Protection is over: your island can now be attacked",
    "net.pvpOn": "PvP on: you can now attack and be attacked",
    "plate.safe": "Protected: {s} s",
    "plate.pvp": "PvP on",
    "lb.title": "Leaderboard",
    "lb.empty": "No players",
    "lb.online1": "{n} captain online",
    "lb.online": "{n} captains online",
    "lb.pvpHint": "Space: turn on PvP",
    "lb.alone": "Waiting for other captains. Meanwhile, strengthen your island.",
    "lb.invite": "Copy invite",
    "ach.title": "Achievements",
    "ach.close": "Close achievements",
    "ach.toast": "Achievement: {name}",
    "end.sunk": "Sunk",
    "end.destroyedShort": "Your island was destroyed.",
    "end.sunkBy": "Your island was sunk by {name}. ",
    "end.destroyed": "Your island was destroyed. ",
    "end.lasted": "You held out for {time} and destroyed {targets}.",
    "end.minutes": "{m} min {s} s",
    "end.seconds": "{s} s",
    "end.target1": "1 target",
    "end.targets": "{n} targets",
    "end.lost": "Connection lost",
    "end.lostText": "The match ended because the connection to the server dropped.",
    "end.again": "Set sail again",
    "end.menu": "Back to menu",
    "chat.placeholder": "Message to everyone",
    "chat.label": "Chat message",
    "chat.hint": "Enter: chat · click a name to mute",
    "chat.join": "{name} set sail.",
    "chat.leave": "{name} left the sea.",
    "chat.wait": "Easy, captain: wait {s} s to send another message.",
    "chat.muteTitle": "Mute {name}",
    "chat.muted": "You muted {name}.",
    "chat.unmuted": "You can hear {name} again.",
    "chat.undo": "Undo",
    "tut.count": "Step {i} of {n}",
    "tut.skip": "Skip tutorial",
    "tut.wait": "Do this to continue",
    "tut.ok": "Got it",
    "tut.finish": "Fair winds!",
    "tut.done": "Tutorial complete. Fair winds, captain!",
    "tut.skipped": "Tutorial skipped. You can replay it in the settings.",
    "tut.keys": "W A S D move the camera · H goes back to the island",
    "tut.keysTouch": "The joystick moves the camera · Island goes back home",
    "tut.mill": "Windmills",
    "tut.mill.text": "Gold pays for everything, and a windmill makes gold every second. Click the Windmill (key 3), then near your island.",
    "tut.mill.touch": "Gold pays for everything, and a windmill makes gold every second. Tap the Windmill, then near your island.",
    "tut.hut": "Huts",
    "tut.hut.text": "Every hut raises your fleet's dinghy limit by 2. Build one (key 4).",
    "tut.hut.touch": "Every hut raises your fleet's dinghy limit by 2. Build one.",
    "tut.gun": "Cannons",
    "tut.gun.text": "Cannons fire at enemy boats that come close. The Long gun (key 5) reaches farther and hits harder, but costs more. Build a cannon (key 2).",
    "tut.gun.touch": "Cannons fire at enemy boats that come close. The Long gun reaches farther and hits harder, but costs more. Build a cannon.",
    "tut.reef": "Reefs",
    "tut.reef.text": "Reefs block enemy boats. Put a few in front of your cannons, so boats stop right under fire (key 1).",
    "tut.reef.touch": "Reefs block enemy boats. Put a few in front of your cannons, so boats stop right under fire.",
    "tut.dock": "Docks",
    "tut.dock.text": "The dock builds the dinghies that attack other islands. Save 120 gold and build one (key 7).",
    "tut.dock.touch": "The dock builds the dinghies that attack other islands. Save 120 gold and build one.",
    "tut.fleet": "Sending the fleet",
    "tut.fleet.text": "When dinghies appear, click the map to send them there. Your island starts protected: press Space to attack, knowing that from then on others can attack you too.",
    "tut.fleet.touch": "When dinghies appear, tap the map to send them there. Your island starts protected: tap PvP to attack, knowing that from then on others can attack you too.",
    "tut.arsenal": "Arsenal",
    "tut.arsenal.text": "The Arsenal (key 6) researches fleet upgrades: reinforced hull, new sails, deck guns and fog curtain. With the Arsenal tool, click it to buy the next one.",
    "tut.arsenal.touch": "The Arsenal researches fleet upgrades: reinforced hull, new sails, deck guns and fog curtain. With the Arsenal tool, tap it to buy the next one.",
    "tut.layout": "How to lay out a base",
    "tut.layout.intro": "Always start with windmills: no gold, no base. Then pick a style:",
    "tut.layout.fort": "<b>Fortress:</b> no docks, lots of cannons and reefs. You don't attack, but you're hard to sink and you pile up gold.",
    "tut.layout.mixed": "<b>Balanced:</b> more cannons than docks. It defends well and still sends dinghies.",
    "tut.upgrade": "Upgrades",
    "tut.upgrade.text": "To upgrade, pick a building's tool and click one of the same kind that's already on the map. On the first upgrade you choose one of two paths, and the choice is final.",
    "tut.upgrade.touch": "To upgrade, pick a building's tool and tap one of the same kind that's already on the map. On the first upgrade you choose one of two paths, and the choice is final.",
    "tut.ach": "Achievements",
    "tut.ach.text": "Playing earns you achievements. Each one becomes a badge to wear under your name, chosen in the menu.",
    "tut.chat": "Chat and rules",
    "tut.chat.open": "Enter opens the chat with everyone.",
    "tut.chat.openTouch": "The Chat button opens the chat with everyone.",
    "tut.chat.intro": "To keep the sea good for everyone:",
    "tut.chat.rule1": "treat the other captains with respect;",
    "tut.chat.rule2": "no insults, swearing or prejudice;",
    "tut.chat.rule3": "don't share personal details, like your address, phone number or passwords.",
    "tut.chat.mute": "If someone bothers you, click their name in the chat to mute them.",
    "tut.chat.muteTouch": "If someone bothers you, tap their name in the chat to mute them.",
    "news.title": "What's new",
    "news.close": "Close what's new",
    "news.version": "Version {v}",
    "news.current": "current",
    "news.added": "New",
    "news.fixed": "Fixes",
    "news.reload": "Version {v} is out. Reload the page to play it.",
  },

  de: {
    "lang.pt": "Brasilien (São Paulo)",
    "lang.en": "Englisch (USA)",
    "lang.de": "Deutsch (Frankfurt)",
    "menu.language": "Sprache",
    "menu.subtitle": "Errichte deine Insel. Bewaffne die Küste. Schick deine Flotte los.",
    "menu.name": "Name des Kapitäns",
    "menu.defaultName": "Kapitän",
    "menu.flag": "Flagge",
    "menu.flagN": "Flagge {n}",
    "menu.tag": "Abzeichen",
    "menu.noTag": "Kein Abzeichen",
    "menu.earnTag": "Erspiel dir eines",
    "menu.play": "In See stechen",
    "menu.connecting": "Verbinde...",
    "menu.retry": "Nochmal versuchen",
    "menu.news": "Neuigkeiten",
    "menu.serverDown": "Der Server ist nicht erreichbar. Versuch es gleich noch einmal.",
    "common.close": "Schließen",
    "settings.title": "Einstellungen",
    "settings.close": "Einstellungen schließen",
    "settings.aim": "Zielen",
    "settings.aimLock": "Fixiertes Zielen",
    "settings.aimNote": "Klick auf die Karte, um die Maus zu fixieren: Der Spielcursor bewegt sich nach deiner Empfindlichkeit und verschiebt am Bildschirmrand die Karte. Esc gibt die Maus frei.",
    "settings.sensi": "Zielempfindlichkeit",
    "settings.aimSize": "Größe des Fadenkreuzes",
    "settings.chat": "Chat",
    "settings.showChat": "Chat anzeigen",
    "settings.chatNote": "Wenn er aus ist, siehst und sendest du keine Nachrichten.",
    "settings.tutorial": "Tutorial",
    "settings.replay": "Tutorial wiederholen",
    "settings.camera": "Kamera",
    "settings.cameraSpeed": "Kamerageschwindigkeit",
    "settings.reset": "Standard wiederherstellen",
    "settings.done": "Fertig",
    "aim.locked": "Zielen fixiert. Esc gibt die Maus frei.",
    "tool.swap": "Plätze tauschen",
    "tool.swapDesc": "Zieh ein Gebäude auf ein anderes, um sie zu tauschen.",
    "tool.delete": "Abreißen",
    "tool.deleteDesc": "Klick auf ein Gebäude, um es abzureißen und den halben Preis zurückzubekommen.",
    "tool.max": "max.",
    "tool.gold": "{n} Gold",
    "tool.hp": "{n} Leben",
    "tool.range": "{n} Reichweite",
    "tool.limit": "höchstens {n}",
    "tool.evolves": " Wird zu {a} oder {b}.",
    "hud.gold": "Gold",
    "hud.islandHp": "Leben der Insel",
    "hud.island": "Insel",
    "hud.fleet": "Flotte",
    "fleet.soldier": "Beiboote",
    "fleet.tank": "Fregatten",
    "fleet.siege": "Galeonen",
    "boats.soldier": "Beiboote",
    "boats.tank": "Fregatten",
    "boats.siege": "Galeonen",
    "deny.limit": "Limit erreicht: höchstens {n} ({name})",
    "deny.noRoom": "Passt hier nicht: An dieser Stelle steht schon ein Gebäude",
    "deny.gold": "Nicht genug Gold: Es fehlen {n}",
    "deny.dockMax": "Dieser Hafen ist schon auf der höchsten Stufe",
    "deny.buildingMax": "Dieses Gebäude ist schon auf der höchsten Stufe",
    "deny.allResearch": "Alle Forschungen sind abgeschlossen",
    "deny.swap": "Getauscht passen diese Gebäude nicht",
    "toast.dockReady": "{name} fertig: baut {boats}",
    "toast.noBoats": "Du hast noch keine Boote: Bau einen Hafen",
    "toast.rotate": "Tipp: Halte das Handy quer, um mehr von der Karte zu sehen",
    "toast.copied": "Link kopiert: Schick ihn einem Freund",
    "toast.sendLink": "Schick diesen Link: {url}",
    "hint.maxLevel": "Höchste Stufe",
    "hint.allResearch": "Alles erforscht",
    "hint.choose": "Klick, um die Verbesserung zu wählen",
    "hint.pathLevel": "{path}, Stufe {n}",
    "upgrade.title": "{name}: Wähle die Verbesserung",
    "upgrade.next": "Stufe 2: {desc}",
    "upgrade.note": "Die Wahl ist endgültig. Tasten 1 und 2 wählen, Esc schließt.",
    "upgrade.done": "{name}: {path}, Stufe {n}",
    "touch.cancel": "Abbrechen",
    "touch.chat": "Chat",
    "battle.someone": "Ein Kapitän",
    "battle.youSank": "Du hast die Insel von {name} versenkt!",
    "battle.sank": "{name} ist gesunken",
    "battle.underAttack": "Deine Insel wird angegriffen!",
    "net.waiting": "Verbunden, warte auf die Insel...",
    "net.disconnected": "Getrennt",
    "net.protectionEnd": "Schutz vorbei: Deine Insel kann jetzt angegriffen werden",
    "net.pvpOn": "PvP an: Du kannst jetzt angreifen und angegriffen werden",
    "plate.safe": "Geschützt: {s} s",
    "plate.pvp": "PvP an",
    "lb.title": "Rangliste",
    "lb.empty": "Keine Spieler",
    "lb.online1": "{n} Kapitän online",
    "lb.online": "{n} Kapitäne online",
    "lb.pvpHint": "Leertaste: PvP einschalten",
    "lb.alone": "Warte auf andere Kapitäne. Stärke solange deine Insel.",
    "lb.invite": "Einladung kopieren",
    "ach.title": "Erfolge",
    "ach.close": "Erfolge schließen",
    "ach.toast": "Erfolg: {name}",
    "end.sunk": "Versenkt",
    "end.destroyedShort": "Deine Insel wurde zerstört.",
    "end.sunkBy": "Deine Insel wurde von {name} versenkt. ",
    "end.destroyed": "Deine Insel wurde zerstört. ",
    "end.lasted": "Du hast {time} durchgehalten und {targets} zerstört.",
    "end.minutes": "{m} Min. {s} s",
    "end.seconds": "{s} s",
    "end.target1": "1 Ziel",
    "end.targets": "{n} Ziele",
    "end.lost": "Verbindung verloren",
    "end.lostText": "Die Partie ist vorbei, weil die Verbindung zum Server abgebrochen ist.",
    "end.again": "Erneut in See stechen",
    "end.menu": "Zurück zum Menü",
    "chat.placeholder": "Nachricht an alle",
    "chat.label": "Chatnachricht",
    "chat.hint": "Enter: chatten · Namen anklicken zum Stummschalten",
    "chat.join": "{name} ist in See gestochen.",
    "chat.leave": "{name} hat das Meer verlassen.",
    "chat.wait": "Ruhig, Kapitän: Warte {s} s bis zur nächsten Nachricht.",
    "chat.muteTitle": "{name} stummschalten",
    "chat.muted": "Du hast {name} stummgeschaltet.",
    "chat.unmuted": "Du hörst {name} wieder.",
    "chat.undo": "Rückgängig",
    "tut.count": "Schritt {i} von {n}",
    "tut.skip": "Tutorial überspringen",
    "tut.wait": "Mach das, um weiterzukommen",
    "tut.ok": "Verstanden",
    "tut.finish": "Guten Wind!",
    "tut.done": "Tutorial abgeschlossen. Guten Wind, Kapitän!",
    "tut.skipped": "Tutorial übersprungen. Du kannst es in den Einstellungen wiederholen.",
    "tut.keys": "W A S D bewegen die Kamera · H führt zurück zur Insel",
    "tut.keysTouch": "Der Joystick bewegt die Kamera · Insel führt nach Hause",
    "tut.mill": "Windmühlen",
    "tut.mill.text": "Gold bezahlt alles, und eine Windmühle macht jede Sekunde Gold. Klick auf die Windmühle (Taste 3) und dann neben deine Insel.",
    "tut.mill.touch": "Gold bezahlt alles, und eine Windmühle macht jede Sekunde Gold. Tipp auf die Windmühle und dann neben deine Insel.",
    "tut.hut": "Hütten",
    "tut.hut.text": "Jede Hütte erhöht das Beiboot-Limit deiner Flotte um 2. Bau eine (Taste 4).",
    "tut.hut.touch": "Jede Hütte erhöht das Beiboot-Limit deiner Flotte um 2. Bau eine.",
    "tut.gun": "Kanonen",
    "tut.gun.text": "Kanonen schießen auf feindliche Boote, die nahe kommen. Die Langrohrkanone (Taste 5) reicht weiter und trifft härter, kostet aber mehr. Bau eine Kanone (Taste 2).",
    "tut.gun.touch": "Kanonen schießen auf feindliche Boote, die nahe kommen. Die Langrohrkanone reicht weiter und trifft härter, kostet aber mehr. Bau eine Kanone.",
    "tut.reef": "Riffe",
    "tut.reef.text": "Riffe blockieren feindliche Boote. Setz ein paar vor deine Kanonen, damit die Boote direkt unter Beschuss anhalten (Taste 1).",
    "tut.reef.touch": "Riffe blockieren feindliche Boote. Setz ein paar vor deine Kanonen, damit die Boote direkt unter Beschuss anhalten.",
    "tut.dock": "Häfen",
    "tut.dock.text": "Der Hafen baut die Beiboote, die andere Inseln angreifen. Spar 120 Gold und bau einen (Taste 7).",
    "tut.dock.touch": "Der Hafen baut die Beiboote, die andere Inseln angreifen. Spar 120 Gold und bau einen.",
    "tut.fleet": "Die Flotte losschicken",
    "tut.fleet.text": "Wenn Beiboote auftauchen, klick auf die Karte, um sie dorthin zu schicken. Deine Insel startet geschützt: Drück die Leertaste, um anzugreifen – ab dann können andere auch dich angreifen.",
    "tut.fleet.touch": "Wenn Beiboote auftauchen, tipp auf die Karte, um sie dorthin zu schicken. Deine Insel startet geschützt: Tipp auf PvP, um anzugreifen – ab dann können andere auch dich angreifen.",
    "tut.arsenal": "Arsenal",
    "tut.arsenal.text": "Das Arsenal (Taste 6) erforscht Verbesserungen für die Flotte: verstärkter Rumpf, neue Segel, Bordkanonen und Nebelvorhang. Mit dem Arsenal-Werkzeug klickst du darauf, um die nächste zu kaufen.",
    "tut.arsenal.touch": "Das Arsenal erforscht Verbesserungen für die Flotte: verstärkter Rumpf, neue Segel, Bordkanonen und Nebelvorhang. Mit dem Arsenal-Werkzeug tippst du darauf, um die nächste zu kaufen.",
    "tut.layout": "So baust du deine Basis",
    "tut.layout.intro": "Fang immer mit Windmühlen an: ohne Gold keine Basis. Dann wähl einen Stil:",
    "tut.layout.fort": "<b>Festung:</b> keine Häfen, viele Kanonen und Riffe. Du greifst nicht an, bist aber schwer zu versenken und sammelst Gold.",
    "tut.layout.mixed": "<b>Ausgewogen:</b> mehr Kanonen als Häfen. Verteidigt gut und schickt trotzdem Beiboote los.",
    "tut.upgrade": "Verbesserungen",
    "tut.upgrade.text": "Zum Verbessern wählst du das Werkzeug eines Gebäudes und klickst auf ein gleiches, das schon auf der Karte steht. Bei der ersten Verbesserung wählst du einen von zwei Wegen, und die Wahl ist endgültig.",
    "tut.upgrade.touch": "Zum Verbessern wählst du das Werkzeug eines Gebäudes und tippst auf ein gleiches, das schon auf der Karte steht. Bei der ersten Verbesserung wählst du einen von zwei Wegen, und die Wahl ist endgültig.",
    "tut.ach": "Erfolge",
    "tut.ach.text": "Beim Spielen sammelst du Erfolge. Jeder wird zu einem Abzeichen unter deinem Namen, das du im Menü auswählst.",
    "tut.chat": "Chat und Regeln",
    "tut.chat.open": "Enter öffnet den Chat mit allen.",
    "tut.chat.openTouch": "Der Chat-Knopf öffnet den Chat mit allen.",
    "tut.chat.intro": "Damit das Meer für alle schön bleibt:",
    "tut.chat.rule1": "behandle die anderen Kapitäne mit Respekt;",
    "tut.chat.rule2": "keine Beleidigungen, Schimpfwörter oder Vorurteile;",
    "tut.chat.rule3": "gib keine persönlichen Daten weiter, etwa Adresse, Telefonnummer oder Passwörter.",
    "tut.chat.mute": "Wenn dich jemand stört, klick im Chat auf seinen Namen, um ihn stummzuschalten.",
    "tut.chat.muteTouch": "Wenn dich jemand stört, tipp im Chat auf seinen Namen, um ihn stummzuschalten.",
    "news.title": "Neuigkeiten",
    "news.close": "Neuigkeiten schließen",
    "news.version": "Version {v}",
    "news.current": "aktuell",
    "news.added": "Neu",
    "news.fixed": "Korrekturen",
    "news.reload": "Version {v} ist da. Lade die Seite neu, um sie zu spielen.",
  },
};

/* Names and descriptions kept in data. Portuguese is what the data already says. */
const DATA_TEXTS = {
  en: {
    buildings: [
      { name: "Reef", desc: "Blocks enemy boats from passing." },
      { name: "Cannon", desc: "Fires at the nearest enemy boat." },
      { name: "Windmill", desc: "Earns 1 gold per second." },
      { name: "Hut", desc: "Raises the dinghy limit by 2." },
      { name: "Long gun", desc: "Longer range and a much stronger shot." },
      { name: "Arsenal", desc: "With this tool, click it to research." },
      { name: "Dock", desc: "Builds dinghies. With this tool, click it to upgrade." },
    ],
    paths: {
      0: {
        A: ["Coral wall", "Much more health and, later, it repairs itself.", ["300 health", "500 health, and repairs itself 3/s", "800 health, and repairs itself 6/s"]],
        B: ["Razor reef", "Hurts boats that touch it and slows those passing nearby.", ["Hurts boats that touch it (6/s)", "12/s, and nearby boats are 30% slower", "20/s, and the slowdown rises to 50%"]],
      },
      1: {
        A: ["Rapid battery", "More damage and, at level 4, two targets at once.", ["16 damage/s", "20 damage/s and range 180", "26 damage/s, on 2 targets"]],
        B: ["Grapeshot", "The shot also hits the boats around the target.", ["Hits around the target (radius 40)", "Radius 55", "Radius 70, and whoever is hit is slowed"]],
      },
      2: {
        A: ["Gold works", "Earns more and more gold.", ["1.5 gold/s", "2 gold/s", "3 gold/s"]],
        B: ["Repair workshop", "Repairs nearby buildings and, at level 4, the island.", ["120 health, repairs 3/s around it", "Repairs 6/s, over a wider radius", "Repairs 10/s, and the island 5/s"]],
      },
      3: {
        A: ["Village", "More and more room for dinghies.", ["+3 to the dinghy limit", "+4 to the dinghy limit", "+5 to the dinghy limit"]],
        B: ["Sailors' school", "Stronger new boats. The best school counts; they don't add up.", ["+15% health on new boats", "+15% health and +15% damage", "+25% health and +25% damage"]],
      },
      4: {
        A: ["Marksman", "Ever longer range; at level 3, it sees through the fog curtain.", ["Range 280", "Range 300, and sees boats in the fog", "Range 320 and 30 damage/s"]],
        B: ["Piercing", "Much stronger against frigates and galleons.", ["+50% damage on frigates and galleons", "+100% damage on them", "The shot goes through and hits the boat behind"]],
      },
    },
    research: {
      armor: ["Reinforced hull", "+50% health for every boat"],
      booster: ["New sails", "Frigates and galleons get faster"],
      cannons: ["Deck guns", "Frigates and galleons fire from a distance"],
      cloak: ["Fog curtain", "Enemy cannons can't see frigates or galleons"],
    },
    tents: ["Dock", "Bigger dock", "Frigate shipyard", "Galleon shipyard"],
    achievements: {
      passive: ["Calm waters", "Wait for your starting protection to run out"],
      pvp: ["War flag", "Turn on PvP with the space bar"],
      power: ["Fair wind", "Build 5 windmills"],
      "very-powerful": ["Lord of the mills", "Build 10 windmills"],
      monster: ["First strike", "Reach an enemy island or building"],
      op: ["Complete island", "Have one building of every kind"],
      flexible: ["Change of plans", "Swap two buildings"],
      amateur: ["Sailor", "Destroy 5 targets in one match"],
      good: ["Privateer", "Destroy 20 targets in one match"],
      pro: ["Captain", "Destroy 50 targets in one match"],
      "not-normal": ["Admiral", "Destroy 100 targets in one match"],
      what: ["Terror of the seas", "Destroy 1000 targets in one match"],
    },
  },
  de: {
    buildings: [
      { name: "Riff", desc: "Hält feindliche Boote auf." },
      { name: "Kanone", desc: "Schießt auf das nächste feindliche Boot." },
      { name: "Windmühle", desc: "Bringt 1 Gold pro Sekunde." },
      { name: "Hütte", desc: "Erhöht das Beiboot-Limit um 2." },
      { name: "Langrohrkanone", desc: "Größere Reichweite und ein viel stärkerer Schuss." },
      { name: "Arsenal", desc: "Mit diesem Werkzeug anklicken, um zu forschen." },
      { name: "Hafen", desc: "Baut Beiboote. Mit diesem Werkzeug anklicken, um ihn zu verbessern." },
    ],
    paths: {
      0: {
        A: ["Korallenmauer", "Viel mehr Leben und später repariert sie sich selbst.", ["300 Leben", "500 Leben, repariert sich mit 3/s", "800 Leben, repariert sich mit 6/s"]],
        B: ["Scharfes Riff", "Verletzt Boote, die es berühren, und bremst die, die nahe vorbeifahren.", ["Verletzt Boote, die es berühren (6/s)", "12/s, und Boote in der Nähe sind 30 % langsamer", "20/s, und die Verlangsamung steigt auf 50 %"]],
      },
      1: {
        A: ["Schnellfeuerbatterie", "Mehr Schaden und auf Stufe 4 zwei Ziele gleichzeitig.", ["16 Schaden/s", "20 Schaden/s und Reichweite 180", "26 Schaden/s, auf 2 Ziele"]],
        B: ["Kartätsche", "Der Schuss trifft auch die Boote rund um das Ziel.", ["Trifft rund um das Ziel (Radius 40)", "Radius 55", "Radius 70, und Getroffene werden langsamer"]],
      },
      2: {
        A: ["Goldmühle", "Bringt immer mehr Gold.", ["1,5 Gold/s", "2 Gold/s", "3 Gold/s"]],
        B: ["Reparaturwerkstatt", "Repariert Gebäude in der Nähe und auf Stufe 4 die Insel.", ["120 Leben, repariert 3/s im Umkreis", "Repariert 6/s, in einem größeren Umkreis", "Repariert 10/s, und die Insel 5/s"]],
      },
      3: {
        A: ["Dorf", "Immer mehr Platz für Beiboote.", ["+3 beim Beiboot-Limit", "+4 beim Beiboot-Limit", "+5 beim Beiboot-Limit"]],
        B: ["Matrosenschule", "Stärkere neue Boote. Die beste Schule zählt, sie addieren sich nicht.", ["+15 % Leben für neue Boote", "+15 % Leben und +15 % Schaden", "+25 % Leben und +25 % Schaden"]],
      },
      4: {
        A: ["Scharfschütze", "Immer größere Reichweite; auf Stufe 3 sieht er durch den Nebelvorhang.", ["Reichweite 280", "Reichweite 300, und sieht Boote im Nebel", "Reichweite 320 und 30 Schaden/s"]],
        B: ["Durchschlag", "Viel stärker gegen Fregatten und Galeonen.", ["+50 % Schaden gegen Fregatten und Galeonen", "+100 % Schaden gegen sie", "Der Schuss geht durch und trifft das Boot dahinter"]],
      },
    },
    research: {
      armor: ["Verstärkter Rumpf", "+50 % Leben für alle Boote"],
      booster: ["Neue Segel", "Fregatten und Galeonen werden schneller"],
      cannons: ["Bordkanonen", "Fregatten und Galeonen schießen aus der Ferne"],
      cloak: ["Nebelvorhang", "Feindliche Kanonen sehen weder Fregatten noch Galeonen"],
    },
    tents: ["Hafen", "Großer Hafen", "Fregattenwerft", "Galeonenwerft"],
    achievements: {
      passive: ["Ruhige See", "Warte, bis dein Anfangsschutz abläuft"],
      pvp: ["Kriegsflagge", "Schalte PvP mit der Leertaste ein"],
      power: ["Rückenwind", "Bau 5 Windmühlen"],
      "very-powerful": ["Herr der Mühlen", "Bau 10 Windmühlen"],
      monster: ["Erster Angriff", "Erreiche eine feindliche Insel oder ein Gebäude"],
      op: ["Vollständige Insel", "Hab ein Gebäude von jeder Art"],
      flexible: ["Planänderung", "Tausche zwei Gebäude"],
      amateur: ["Matrose", "Zerstöre 5 Ziele in einer Partie"],
      good: ["Freibeuter", "Zerstöre 20 Ziele in einer Partie"],
      pro: ["Kapitän", "Zerstöre 50 Ziele in einer Partie"],
      "not-normal": ["Admiral", "Zerstöre 100 Ziele in einer Partie"],
      what: ["Schrecken der Meere", "Zerstöre 1000 Ziele in einer Partie"],
    },
  },
};

let LANG = "pt";

function loadLanguage() {
  let saved = null;
  try {
    saved = localStorage.getItem(LANG_KEY);
  } catch {
    /* no storage */
  }
  if (LANGUAGES.includes(saved)) return saved;
  const browser = (navigator.language || "pt").toLowerCase();
  if (browser.startsWith("de")) return "de";
  if (browser.startsWith("en")) return "en";
  return "pt";
}

/* The text for `key` in the current language, with {name}-style holes filled. */
function t(key, vars) {
  let text = TEXTS[LANG][key];
  if (text === undefined) text = TEXTS.pt[key];
  if (text === undefined) return key;
  if (vars) text = text.replace(/\{(\w+)\}/g, (hole, name) => (name in vars ? String(vars[name]) : hole));
  return text;
}

/* Numbers, dates and the like follow the language (1,5 in Portuguese, 1.5 in English). */
function locale() {
  return LOCALES[LANG];
}

/* ---------- data (buildings, paths, research, docks, achievements) ---------- */

let dataOriginal = null; // the Portuguese texts, kept the first time

function snapshotData() {
  const paths = {};
  COMBAT.buildingStats.forEach((stat, i) => {
    if (!stat.paths) return;
    paths[i] = {};
    for (const key of ["A", "B"]) {
      const p = stat.paths[key];
      paths[i][key] = [p.name, p.summary, p.levels.map((l) => l.desc)];
    }
  });
  const research = {};
  for (const r of COMBAT.armoryResearch) research[r.key] = [r.name, r.desc];
  const achievementTexts = {};
  for (const a of ACHIEVEMENTS) achievementTexts[a.id] = [a.name, a.desc];
  return {
    buildings: BUILDINGS.map((b) => ({ name: b.name, desc: b.desc })),
    paths,
    research,
    tents: COMBAT.tents.slice(1).map((tier) => tier.name),
    achievements: achievementTexts,
  };
}

function applyDataTexts() {
  if (!dataOriginal) dataOriginal = snapshotData();
  const data = DATA_TEXTS[LANG] || dataOriginal;

  BUILDINGS.forEach((b, i) => {
    const tr = data.buildings[i] || dataOriginal.buildings[i];
    b.name = tr.name;
    b.desc = tr.desc;
  });

  COMBAT.buildingStats.forEach((stat, i) => {
    if (!stat.paths) return;
    for (const key of ["A", "B"]) {
      const tr = (data.paths[i] && data.paths[i][key]) || dataOriginal.paths[i][key];
      const p = stat.paths[key];
      p.name = tr[0];
      p.summary = tr[1];
      p.levels.forEach((level, n) => (level.desc = tr[2][n]));
    }
  });

  for (const r of COMBAT.armoryResearch) {
    const tr = data.research[r.key] || dataOriginal.research[r.key];
    r.name = tr[0];
    r.desc = tr[1];
  }

  COMBAT.tents.forEach((tier, i) => {
    if (tier) tier.name = data.tents[i - 1] || dataOriginal.tents[i - 1];
  });

  for (const a of ACHIEVEMENTS) {
    const tr = data.achievements[a.id] || dataOriginal.achievements[a.id];
    a.name = tr[0];
    a.desc = tr[1];
  }
}

/* ---------- page ---------- */

function translatePage() {
  document.documentElement.lang = locale();
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }

  // the menu's own picker: each language named in the current one
  const picker = document.getElementById("menu-lang");
  if (picker) {
    for (const option of picker.options) option.textContent = t("lang." + option.value);
    picker.value = LANG;
  }
}

const languageListeners = [];

/* Code that writes text itself registers here to redraw it in the new language. */
function onLanguageChange(fn) {
  languageListeners.push(fn);
}

function setLanguage(code) {
  if (!LANGUAGES.includes(code)) return;
  LANG = code;
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch {
    /* not saved: it lasts until the page closes */
  }
  applyDataTexts();
  translatePage();
  for (const fn of languageListeners) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

LANG = loadLanguage();

// Runs before every other module's DOMContentLoaded (this script is loaded first),
// so the buttons, panels and lists they build already come out translated.
window.addEventListener("DOMContentLoaded", () => {
  applyDataTexts();
  translatePage();
  const picker = document.getElementById("menu-lang");
  if (picker) picker.addEventListener("change", () => setLanguage(picker.value));
});
