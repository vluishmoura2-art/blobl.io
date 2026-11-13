# hightide.io

Jogo multiplayer de navegador, somente online: você ergue sua ilha, arma a costa, produz barcos e ataca as ilhas dos outros capitães.

## Como rodar

Requer [Node.js](https://nodejs.org) 22 ou mais novo, porque os testes usam o `WebSocket` nativo do Node.

```bash
npm install
```

```bash
npm start
```

Depois, abra <http://localhost:8080>. Para testar o multiplayer, abra várias abas.

## Testes

O comando abaixo roda os testes de regras (sem rede) e o teste do multiplayer. Para ver a taxa de quadros no navegador, abra o jogo com `?fps` no fim do endereço, como em <http://localhost:8080/?fps>.

```bash
npm test
```

## Controles

| Ação | Comando |
|---|---|
| Mover a câmera | `W` `A` `S` `D` ou setas |
| Escolher construção | `1` a `7` ou a barra na parte de baixo |
| Cancelar seleção | `Esc` |
| Construir ou mandar os barcos navegarem | Clique esquerdo |
| Evoluir uma construção, o cais ou pesquisar no arsenal | Com a ferramenta dela selecionada, clique na construção. Recife, canhão, moinho, cabana e canhão longo têm dois caminhos: a primeira evolução escolhe um deles |
| Trocar duas construções de lugar | Modo Trocar: arraste uma até a outra |
| Remover construção | Modo Remover: clique nela |
| Ativar o PvP antes do fim da proteção | `Espaço` |
| Voltar à sua ilha | `H` |

No celular ou tablet: o joystick no canto inferior esquerdo move a câmera, um toque no mapa funciona como o clique (a prévia segue o dedo e a peça é construída ao soltar), os botões **PvP**, **Ilha** e **Cancelar** substituem as teclas, e um toque longo em um botão da barra mostra a dica dele.

## Regras e equilíbrio

Preços, vida, dano e velocidades ficam todos em [`shared/combat.js`](shared/combat.js). O servidor guarda o ouro e confere cada jogada usando esse mesmo arquivo, então basta editá-lo para mudar o equilíbrio.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `index.html` | Página e interface |
| `CSS/style.css` | Estilos da interface |
| `JS/art.js` | Desenhos da ilha, das construções e dos barcos |
| `JS/main.js` | Regras no cliente, carta náutica e controles |
| `JS/net.js` | Conexão com o servidor, outros jogadores e placar |
| `JS/battle.js` | Mira, tiros, explosões, movimento suave e avisos na tela |
| `JS/tutorial.js` | Tutorial guiado em balões |
| `JS/settings.js` | Configurações e mira presa com sensi |
| `JS/chat.js` | Chat geral, silenciar jogadores |
| `JS/touch.js` | Joystick, botões e dicas para telas de toque |
| `JS/upgrades.js` | Evoluções das construções e painel de escolha do caminho |
| `JS/achievements.js` | Conquistas, salvas apenas no navegador do jogador |
| `shared/combat.js` | Regras e valores do jogo, usados pelo cliente e pelo servidor |
| `shared/chat-filter.js` | Filtro de palavrões do chat, aplicado no servidor |
| `server.js` | Servidor WebSocket, validação das jogadas, combate e arquivos do jogo |
| `test/mp-test.js` | Teste de integração do multiplayer |
