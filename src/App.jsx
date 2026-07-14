import React, { useState, useEffect, useRef } from "react";
// import ProgressSprite removed – using demo sprite instead
// CSS for ProgressSprite removed – not needed
import { Heart, Crosshair, Package, Syringe, Bomb, Zap, Dices, RotateCcw } from "lucide-react";
import AudioManager from "./audioManager";

// ============ CONFIG DO JOGO ============
const FINAL_TILE = 40;
const WARNING_TILE = 39;
const START_TILE = 1;
const QUESTION_TILES = [4, 8, 12, 18, 21, 25, 32, 36];
const SAVE_KEY = "combatente_save_v1";
const START_AMMO = 12;
const START_LIFE = 50;

const DECK_COMPOSITION = [
  ...Array(6).fill("atirador"),
  ...Array(3).fill("municao"),
  ...Array(3).fill("socorro"),
  ...Array(2).fill("granada"),
  ...Array(1).fill("adrenalina"),
];

const CARD_INFO = {
  atirador: { label: "ATIRADOR INIMIGO", icon: Crosshair, tone: "red" },
  municao: { label: "MUNIÇÃO", icon: Package, tone: "amber" },
  socorro: { label: "PRIMEIROS-SOCORROS", icon: Syringe, tone: "green" },
  granada: { label: "GRANADA", icon: Bomb, tone: "amber" },
  adrenalina: { label: "ADRENALINA", icon: Zap, tone: "red" },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function freshGame() {
  return {
    position: START_TILE,
    life: START_LIFE,
    lifeCap: START_LIFE,
    ammo: START_AMMO,
    inventory: { socorro: 0, municao: 0, granada: 0, adrenalina: 0 },
    deck: shuffle(DECK_COMPOSITION),
    deckPos: 0,
    visited: [],
    gateResolved: false,
    phase: "map", // map | reveal | battle | win | fail
    revealCard: undefined,
    revealContext: null,
    battle: null,
    log: ["> Missão iniciada. Escape da área inimiga, fuja para a fronteira."],
    bleedTurns: 0,
    canPlayCard: false,
    showMapCardPicker: false,
  };
}

function drawFromDeck(g) {
  if (g.deckPos >= g.deck.length) return { card: null, deckPos: g.deckPos };
  return { card: g.deck[g.deckPos], deckPos: g.deckPos + 1 };
}

function resolveRoll(roll) {
  if (roll === 1) {
    const coin = Math.random() < 0.5 ? "cara" : "coroa";
    if (coin === "cara") return { roll, coin, damage: 0, text: "Tiro evitado! (1 + cara)" };
    return { roll, coin, damage: 1, text: "Tiro de raspão. (1 + coroa)" };
  }
  if (roll === 6) {
    const coin = Math.random() < 0.5 ? "cara" : "coroa";
    if (coin === "cara") return { roll, coin, damage: "INSTA", text: "HEADSHOT! Alvo derrotado instantaneamente." };
    return { roll, coin, damage: 10, text: "Crítico! Dano bônus (+4)." };
  }
  return { roll, damage: roll, text: `Dano direto: ${roll}.` };
}

function stepMovement(g, roll) {
  let pos = g.position;
  let visited = g.visited;
  let log = [...g.log, `> Dado: ${roll}`];
  let trigger = null;

  for (let i = 0; i < roll; i++) {
    if (pos >= FINAL_TILE) break;
    const next = pos + 1;
    if (!g.gateResolved && next >= WARNING_TILE) {
      pos = WARNING_TILE;
      trigger = { type: "gate" };
      break;
    }
    pos = next;
    if (QUESTION_TILES.includes(pos) && !visited.includes(pos)) {
      visited = [...visited, pos];
      trigger = { type: "question" };
      break;
    }
    if (pos === FINAL_TILE) {
      trigger = { type: "win" };
      break;
    }
  }

  log.push(`> Combatente avança para a casa ${String(pos).padStart(2, "0")}.`);
  let ng = { ...g, position: pos, visited, log };

  if (trigger?.type === "win") {
    ng.phase = "win";
    ng.log = [...ng.log, "> Você atravessou a fronteira! Missão cumprida."];
    return ng;
  }
  if (trigger?.type === "gate") {
    const draw = drawFromDeck(g);
    ng.deckPos = draw.deckPos;
    ng.revealContext = "gate";
    ng.revealCard = draw.card;
    ng.phase = "reveal";
    ng.log = [...ng.log, "> ⚠ Um inimigo guarda o portão da fronteira!"];
    return ng;
  }
  if (trigger?.type === "question") {
    const draw = drawFromDeck(g);
    ng.deckPos = draw.deckPos;
    ng.revealContext = "field";
    ng.revealCard = draw.card;
    ng.phase = "reveal";
    ng.log = [...ng.log, "> Casa misteriosa revelada!"];
    return ng;
  }
  ng.canPlayCard = true;
  return ng;
}

function startBattleFromCard(g, card, ctx, coin) {
  let log = [...g.log];
  if (card === null) {
    log.push("> O baralho está vazio. Nada acontece.");
    if (ctx === "gate") {
      log.push("> O guardião do portão avança para o combate.");
      return {
        ...g,
        revealCard: undefined,
        phase: "battle",
        log,
        battle: { enemies: [15], enemyIndex: 0, enemyHP: 15, turn: coin === "cara" ? "player" : "enemy", usedSocorro: false, usedMunicao: false, isGate: true },
      };
    }
    return { ...g, revealCard: undefined, phase: "map", log };
  }
  if (card === "atirador") {
    log.push("> Um Atirador Inimigo surge dos arbustos!");
    const enemies = ctx === "gate" ? [15, 15] : [15];
    return {
      ...g,
      revealCard: undefined,
      phase: "battle",
      log,
      battle: { enemies, enemyIndex: 0, enemyHP: enemies[0], turn: coin === "cara" ? "player" : "enemy", usedSocorro: false, usedMunicao: false, isGate: ctx === "gate" },
    };
  }
  const inventory = { ...g.inventory, [card]: g.inventory[card] + 1 };
  log.push(`> Item coletado: ${CARD_INFO[card].label}.`);
  if (ctx === "gate") {
    log.push("> Com o item guardado, o Combatente enfrenta o guardião do portão.");
    return {
      ...g,
      inventory,
      revealCard: undefined,
      phase: "battle",
      log,
      battle: { enemies: [15], enemyIndex: 0, enemyHP: 15, turn: coin === "cara" ? "player" : "enemy", usedSocorro: false, usedMunicao: false, isGate: true },
    };
  }
  return { ...g, inventory, revealCard: undefined, phase: "map", log };
}

function handleEnemyDefeated(g, coinForNext) {
  const { battle } = g;
  let log = [...g.log];
  if (battle.isGate && battle.enemyIndex < battle.enemies.length - 1) {
    log.push("> Primeiro inimigo derrotado! O segundo avança.");
    const nextIndex = battle.enemyIndex + 1;
    return {
      ...g,
      log,
      battle: { ...battle, enemyIndex: nextIndex, enemyHP: battle.enemies[nextIndex], turn: coinForNext === "cara" ? "player" : "enemy", usedSocorro: false, usedMunicao: false },
    };
  }
  log.push("> Inimigo derrotado!");
  if (battle.isGate) {
    log.push("> O portão está livre! Avance para a fronteira.");
    return { ...g, log, phase: "map", battle: null, gateResolved: true };
  }
  return { ...g, log, phase: "map", battle: null };
}

function applyPlayerAttack(g, res) {
  let ammo = g.ammo - 1;
  let log = [...g.log, `> Você atira: ${res.text}`];
  let enemyHP = g.battle.enemyHP;
  enemyHP = res.damage === "INSTA" ? 0 : Math.max(0, enemyHP - res.damage);
  let battle = { ...g.battle, enemyHP };
  let ng = { ...g, ammo, battle, log };
  if (enemyHP <= 0) {
    const coin = Math.random() < 0.5 ? "cara" : "coroa";
    ng = handleEnemyDefeated(ng, coin);
  } else {
    ng.battle = { ...battle, turn: "enemy" };
  }
  if (ammo <= 0 && ng.phase !== "win") {
    ng.phase = "fail";
    ng.log = [...ng.log, "> Sem munição! A missão termina aqui."];
  }
  return ng;
}

function applyEnemyAttack(g, res) {
  let log = [...g.log, `> Inimigo atira: ${res.text}`];
  // Handle bleed instead of instant death (HEADSHOT)
  let life = g.life;
  let bleedTurns = g.bleedTurns;
  if (res.damage === "INSTA") {
    // Apply bleeding for 2 turns instead of instant kill
    bleedTurns = 2;
    log.push("> Sangramento iniciado! -2 HP por turno por 2 turnos.");
  } else {
    life = Math.max(0, g.life - res.damage);
  }
  let ng = { ...g, life, log, bleedTurns };
  if (life <= 0) {
    ng.phase = "fail";
    ng.log = [...ng.log, "> O Combatente foi derrotado."];
    return ng;
  }
  ng.battle = { ...g.battle, turn: "player" };
  return ng;
}

function applyGranada(g, roll, coin) {
  const inventory = { ...g.inventory, granada: g.inventory.granada - 1 };
  let log = [...g.log];
  let enemyHP = g.battle.enemyHP;
  if (coin === "cara") {
    log.push(`> Granada jogada: inimigo desvia! (dado ${roll})`);
  } else {
    const dmg = roll * 2;
    enemyHP = Math.max(0, enemyHP - dmg);
    log.push(`> Granada jogada: ACERTOU! Dano ${dmg} (dado ${roll} x2).`);
  }
  // Play grenade sound effect
  AudioManager.getInstance().playSfx('granada');
  let battle = { ...g.battle, enemyHP };
  let ng = { ...g, inventory, battle, log };
  if (enemyHP <= 0) {
    const c2 = Math.random() < 0.5 ? "cara" : "coroa";
    return handleEnemyDefeated(ng, c2);
  }
  ng.battle = { ...battle, turn: "enemy" };
  return ng;
}

// ============ COMPONENTE PRINCIPAL ============
export default function App() {
  const [game, setGame] = useState(freshGame());
  const [rolling, setRolling] = useState(false);
  const [rollDisplay, setRollDisplay] = useState(null);
  const [lastRoll, setLastRoll] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const loadedRef = useRef(false);
  const logEndRef = useRef(null);
  const mapAudioRef = useRef(null);
  const battleAudioRef = useRef(null);
  // Ref to demo sprite element
  const soldadoRef = useRef(null);

  // ---------- Bleed helper ----------
  function applyBleed(g) {
    if (g.bleedTurns && g.bleedTurns > 0) {
      const loss = 2;
      const life = Math.max(0, g.life - loss);
      const log = [...g.log, `> Sangramento causa -${loss} HP.`];
      const bleedTurns = g.bleedTurns - 1;
      let ng = { ...g, life, bleedTurns, log };
      if (life <= 0 && ng.phase !== "fail") {
      ng.phase = "fail";
    AudioManager.getInstance().playSfx('morreu');
        ng.log = [...ng.log, "> O Combatente sucumbiu aos ferimentos de sangramento."];
      }
      return ng;
    }
    return g;
  }


  // carregar save
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) setGame(JSON.parse(saved));
    } catch (e) {}
    loadedRef.current = true;
  }, []);

  // salvar save
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(game));
    } catch (e) {}
  }, [game]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [game.log]);

  // Sync demo sprite with game position and dice roll
  useEffect(() => {
    if (!soldadoRef.current) return;
    const totalTiles = 40;
    const pos = Math.min(Math.max(game.position, 1), totalTiles);
    const pct = ((pos - 1) / (totalTiles - 1)) * 100;
    const left = `calc(${pct}% - 50px)`; // center 100px sprite
    soldadoRef.current.style.left = left;
    // Choose animation based on movement state
    let animClass = "idle";
    if (isMoving) {
      if (lastRoll >= 4) animClass = "run";
      else animClass = "walk";
    }
    soldadoRef.current.className = animClass;
  }, [game.position, lastRoll, isMoving]);

  // Música de fundo: mapa vs batalha
  useEffect(() => {
    // Cria os elementos de áudio uma vez
    if (!mapAudioRef.current) {
      mapAudioRef.current = new Audio('/map-music.mp3');
      mapAudioRef.current.loop = true;
      mapAudioRef.current.volume = 0;
    }
    if (!battleAudioRef.current) {
      battleAudioRef.current = new Audio('/battle-music.mp3');
      battleAudioRef.current.loop = true;
      battleAudioRef.current.volume = 0;
    }

    const isBattle = game.phase === 'battle';
    const fadeIn  = isBattle ? battleAudioRef.current : mapAudioRef.current;
    const fadeOut = isBattle ? mapAudioRef.current    : battleAudioRef.current;

    // Fade out da faixa atual
    const STEP = 0.05;
    const INTERVAL = 60;
    const fadeOutInterval = setInterval(() => {
      if (fadeOut.volume > STEP) {
        fadeOut.volume = Math.max(0, fadeOut.volume - STEP);
      } else {
        fadeOut.volume = 0;
        fadeOut.pause();
        clearInterval(fadeOutInterval);
      }
    }, INTERVAL);

    // Fade in da nova faixa
    if (fadeIn.paused) {
      fadeIn.currentTime = fadeIn.currentTime || 0;
      fadeIn.play().catch(() => {}); // ignora erros de autoplay
    }
    const fadeInInterval = setInterval(() => {
      if (fadeIn.volume < 1 - STEP) {
        fadeIn.volume = Math.min(1, fadeIn.volume + STEP);
      } else {
        fadeIn.volume = 1;
        clearInterval(fadeInInterval);
      }
    }, INTERVAL);

    return () => {
      clearInterval(fadeOutInterval);
      clearInterval(fadeInInterval);
    };
  }, [game.phase]);

  // Turno do inimigo automático com delay
  useEffect(() => {
    if (game.phase === "battle" && game.battle?.turn === "enemy" && !rolling) {
      const timer = setTimeout(() => {
        enemyAttack();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [game.phase, game.battle?.turn, rolling]);

  function newGame() {
    localStorage.removeItem(SAVE_KEY);
    setGame(freshGame());
    setRollDisplay(null);
  }

  function rollMove() {
    if (game.phase !== "map" || rolling) return;
    setRolling(true);
    setTimeout(() => {
      const roll = 1 + Math.floor(Math.random() * 6);
      setRollDisplay({ type: "dice", value: roll });
      setGame((g) => stepMovement(g, roll));
      setLastRoll(roll);
      setIsMoving(true);
      // Reset to idle after movement animation (~1s)
      setTimeout(() => setIsMoving(false), 1100);
      setRolling(false);
    }, 650);
  }

  function confirmReveal() {
    const coin = Math.random() < 0.5 ? "cara" : "coroa";
    setGame((g) => startBattleFromCard(g, g.revealCard, g.revealContext, coin));
  }

  function playerAttack() {
    if (game.phase !== "battle" || game.battle.turn !== "player" || rolling) return;
    setRolling(true);
    AudioManager.getInstance().playSfx('tiro-curto');
    setTimeout(() => {
      const roll = 1 + Math.floor(Math.random() * 6);
      const res = resolveRoll(roll);
      setRollDisplay({ type: "dice", value: roll, coin: res.coin });
      // Apply attack then bleed effect
      setGame((g) => {
        const afterAttack = applyPlayerAttack(g, res);
        return applyBleed(afterAttack);
      });
      setRolling(false);
    }, 650);
  }

  function enemyAttack() {
    if (game.phase !== "battle" || game.battle.turn !== "enemy" || rolling) return;
    setRolling(true);
    AudioManager.getInstance().playSfxAt('tiro-curto', 0.5);
    setTimeout(() => {
      const roll = 1 + Math.floor(Math.random() * 6);
      const res = resolveRoll(roll);
      setRollDisplay({ type: "dice", value: roll, coin: res.coin });
      // Apply enemy attack then bleed effect (if any)
      setGame((g) => {
        const afterAttack = applyEnemyAttack(g, res);
        return applyBleed(afterAttack);
      });
      setRolling(false);
    }, 650);
  }

  function useSocorro() {
    if (game.phase !== "battle" || game.battle.turn !== "player") return;
    if (game.inventory.socorro <= 0 || game.battle.usedSocorro) return;
    setGame((g) => {
      const life = Math.min(g.lifeCap, g.life + 15);
      const inventory = { ...g.inventory, socorro: g.inventory.socorro - 1 };
      const log = [...g.log, "> Você usa Primeiros-Socorros (+15 vida). Turno perdido."];
      return { ...g, life, inventory, log, battle: { ...g.battle, usedSocorro: true, turn: "enemy" } };
    });
  }

  function useMunicao() {
    if (game.phase !== "battle" || game.battle.turn !== "player") return;
    if (game.inventory.municao <= 0 || game.battle.usedMunicao) return;
    setGame((g) => {
      const ammo = g.ammo + 3;
      const inventory = { ...g.inventory, municao: g.inventory.municao - 1 };
      const log = [...g.log, "> Você usa Munição (+3 tiros). Turno perdido."];
      return { ...g, ammo, inventory, log, battle: { ...g.battle, usedMunicao: true, turn: "enemy" } };
    });
  }

  function useGranada() {
    if (game.phase !== "battle" || game.battle.turn !== "player") return;
    if (game.inventory.granada <= 0 || rolling) return;
    setRolling(true);
    setTimeout(() => {
      const roll = 1 + Math.floor(Math.random() * 6);
      const coin = Math.random() < 0.5 ? "cara" : "coroa";
      setRollDisplay({ type: "dice", value: roll, coin });
      setGame((g) => applyGranada(g, roll, coin));
      setRolling(false);
    }, 650);
  }

  function playCardFromMap() {
    if (game.phase !== "map" || !game.canPlayCard || rolling) return;
    setGame(g => ({ ...g, showMapCardPicker: true }));
  }

  function pickMapCard(item) {
    if (game.inventory[item] <= 0) return;
    setGame(g => {
      const inventory = { ...g.inventory, [item]: g.inventory[item] - 1 };
      let log = [...g.log, `> Usou ${CARD_INFO[item].label} no mapa.`];
      let ng = { ...g, inventory, showMapCardPicker: false, log };
      
      if (item === 'adrenalina') {
        ng.life = 50;
        ng.lifeCap = 50;
      } else if (item === 'socorro') {
        ng.life = Math.min(ng.lifeCap, ng.life + 15);
      } else if (item === 'municao') {
        ng.ammo += 3;
      }
      return ng;
    });
  }

  function useAdrenalina() {
    if (game.inventory.adrenalina <= 0) return;
    if (game.phase !== "battle" && game.phase !== "map") return;
    setGame((g) => {
      const inventory = { ...g.inventory, adrenalina: g.inventory.adrenalina - 1 };
      const log = [...g.log, "> Adrenalina aplicada! Vida restaurada para 50."];
      return { ...g, inventory, life: 50, lifeCap: 50, log };
    });
  }

  const cardsLeft = game.deck.length - game.deckPos;

  return (
    <div className="cbt-wrapper">
      <div className="main-content">
        <div id="container-cenario">
          <div id="soldado" ref={soldadoRef} className="idle"></div>
        </div>
      </div>
      <aside className="log-panel">
        <h3 className="log-title">Histórico</h3>
        <div className="log-contents">
          {game.log.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </aside>
    </div>
    <style>{`
    /* --- CONTAINER DO CENÁRIO (150px de altura) --- */
    #container-cenario {
      width: 800px;
      height: 150px;
      border: 4px solid #555;
      position: relative;
      overflow: hidden;
      background-image: url('/sprite-bg.png');
      background-size: 100% 100%;
      background-position: bottom center;
      background-repeat: no-repeat;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
      margin: 0 auto 16px auto; /* center and space below */
    }
    #soldado {
      width: 100px;
      height: 100px;
      position: absolute;
      bottom: 8px;
      left: 0;
      background-repeat: no-repeat;
      background-size: auto 100%;
      transition: left 1s linear;
      image-rendering: pixelated;
    }
    /* Sprite animations */
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=VT323&family=Press+Start+2P&display=swap');

        .main-content {
          --bg: #060a06;
          --panel: #0c140c;
          --green: #3dff6e;
          --green-dim: #1c5c30;
          --amber: #ffb400;
          --red: #ff4d5e;
          --border: #235a34;
          font-family: 'Share Tech Mono', monospace;
          background: var(--panel);
          border-left: 2px solid var(--border);
          display: flex;
          flex-direction: column;
        }

        .battle-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 16px;
        }
        .battle-board {
          width: 100%;
          max-width: 950px;
          min-height: 580px;
          background-color: #0c140c;
          border: 4px solid var(--border);
          box-shadow: 0 0 40px rgba(61,255,110,0.3);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 20px;
          position: relative;
          font-family: 'Press Start 2P', monospace;
        }
        .main-content * { box-sizing: border-box; }
        .battle-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid var(--green);
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .battle-title {
          font-family: 'VT323', monospace;
          font-size: 28px;
          color: var(--red);
          text-shadow: 0 0 8px rgba(255,77,94,0.6);
        }
        .battle-hud {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .battle-hud-panel {
          background: rgba(12, 20, 12, 0.85);
          border: 2px solid var(--border);
          padding: 8px 12px;
          box-shadow: 0 0 10px rgba(61,255,110,0.15);
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
        }
        .battle-main-layout {
          display: flex;
          gap: 16px;
          margin-bottom: 12px;
          height: 290px;
        }
        @media (max-width: 768px) {
          .battle-main-layout {
            flex-direction: column;
            height: auto;
          }
        }
        .battle-scene {
          flex: 1.8;
          border: 2px solid var(--border);
          border-radius: 4px;
          background: linear-gradient(180deg, rgba(6,10,6,0.2) 0%, rgba(12,20,12,0.65) 100%), url('/bg-batalha.png') center/cover no-repeat;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 16px;
          box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.85);
        }
        @media (max-width: 768px) {
          .battle-scene {
            height: 220px;
          }
        }
        .battle-scene-sprites {
          display: flex;
          justify-content: space-around;
          align-items: center;
          flex: 1;
        }
        .battle-sprite-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .battle-sprite-box.enemy {
          animation: enemy-idle 2s ease-in-out infinite alternate;
        }
        .battle-sprite-box.player {
          animation: player-idle 2s ease-in-out infinite alternate;
        }
        @keyframes enemy-idle {
          from { transform: translateY(0); }
          to { transform: translateY(-4px); }
        }
        @keyframes player-idle {
          from { transform: translateY(0); }
          to { transform: translateY(-2px); }
        }
        .cbt-fighter-sprite {
          width: 80px;
          height: 80px;
          border: 2px solid var(--border);
          background: rgba(61,255,110,0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          image-rendering: pixelated;
        }
        .battle-sprite-box.enemy .cbt-fighter-sprite {
          border-color: var(--red);
          background: rgba(255,77,94,0.05);
        }
        .cbt-fighter-sprite img {
          max-width: 100%;
          max-height: 100%;
        }
        .battle-scene-status-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          width: 100%;
        }
        .battle-status-overlay-card {
          background: rgba(12, 20, 12, 0.85);
          border: 2px solid var(--border);
          border-radius: 4px;
          padding: 6px 10px;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        .battle-status-overlay-card.enemy {
          border-color: var(--red);
          background: rgba(20, 12, 12, 0.85);
        }
        .battle-status-overlay-card .name {
          font-size: 10px;
          letter-spacing: 1px;
          color: var(--green);
        }
        .battle-status-overlay-card.enemy .name {
          color: var(--red);
          text-align: right;
        }
        .battle-log-panel {
          flex: 1.2;
          background: rgba(4, 8, 4, 0.95);
          border: 2px solid var(--border);
          padding: 12px;
          height: 100%;
          overflow-y: auto;
          font-family: 'Share Tech Mono', monospace;
          font-size: 13px;
          color: var(--green-dim);
          text-align: left;
          box-shadow: inset 0 0 15px rgba(0,0,0,0.85);
        }
        @media (max-width: 768px) {
          .battle-log-panel {
            height: 140px;
          }
        }
        .battle-log-line {
          margin-bottom: 3px;
        }
        .battle-log-line.active {
          color: var(--green);
        }
        .battle-log-line.enemy {
          color: var(--red);
        }
        .battle-log-line.alert {
          color: var(--amber);
        }
        .battle-deck-area {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          background: rgba(12, 20, 12, 0.85);
          border: 2px solid var(--border);
          padding: 12px;
          margin-top: auto;
          flex-wrap: wrap;
        }
        .cards-container {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pixel-card {
          width: 72px;
          height: 100px;
          border: 2px solid var(--border);
          border-radius: 4px;
          position: relative;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          background-size: cover;
          background-position: center;
          image-rendering: pixelated;
        }
        .pixel-card:hover:not(.disabled) {
          transform: translateY(-6px);
          box-shadow: 0 4px 8px rgba(61,255,110,0.4);
          border-color: var(--green);
        }
        .pixel-card.disabled {
          opacity: 0.3;
          cursor: not-allowed;
          filter: grayscale(1);
          border-color: #2b2b2b;
        }
        .pixel-card-qty {
          position: absolute;
          top: -4px;
          right: -4px;
          background: var(--amber);
          color: #000;
          font-size: 8px;
          font-weight: bold;
          padding: 1px 4px;
          border: 1.5px solid #000;
          border-radius: 3px;
        }
        .deck-card {
          width: 48px;
          height: 68px;
          border: 2px solid var(--border);
          border-radius: 4px;
          background: url('/card-verse.png') center/cover no-repeat;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          image-rendering: pixelated;
          box-shadow: 2px 2px 0px rgba(0,0,0,0.5);
        }
        .deck-card-count {
          background: rgba(0,0,0,0.85);
          color: var(--amber);
          font-size: 8px;
          padding: 1px 3px;
          border: 1px solid var(--amber);
          border-radius: 2px;
          text-align: center;
        }
        .battle-actions-hud {
          display: flex;
          flex-direction: column;
          gap: 6px;
          align-items: flex-end;
        }
        .cbt-status-bar-container {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 9px;
        }
        .cbt-scanlines {
          position: relative;
        }
        .cbt-scanlines::before {
          content: "";
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            180deg,
            rgba(61,255,110,0.035) 0px,
            rgba(61,255,110,0.035) 1px,
            transparent 2px,
            transparent 3px
          );
          pointer-events: none;
          border-radius: inherit;
        }
        .cbt-wrap {
          max-width: 900px;
          margin: 0 auto;
        }
        .cbt-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          border-bottom: 1px solid var(--border);
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .cbt-title {
          font-family: 'VT323', monospace;
          font-size: 42px;
          letter-spacing: 4px;
          color: var(--green);
          text-shadow: 0 0 8px rgba(61,255,110,0.55);
          margin: 0;
        }
        .cbt-sub {
          font-size: 12px;
          color: var(--green-dim);
        }
        .cbt-reset {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--green-dim);
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          padding: 6px 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 1px;
        }
        .cbt-reset:hover { color: var(--red); border-color: var(--red); }
        .cbt-reset:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }

        .cbt-panel {
          border: 1px solid var(--border);
          background: var(--panel);
          padding: 12px 14px;
          margin-bottom: 12px;
          position: relative;
        }
        .cbt-panel-label {
          font-size: 11px;
          letter-spacing: 3px;
          color: var(--green-dim);
          margin-bottom: 8px;
          display: block;
        }

        .cbt-status-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        @media (min-width: 620px) {
          .cbt-status-grid { grid-template-columns: repeat(4, 1fr); }
        }
        .cbt-stat {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }
        .cbt-bar-outer {
          flex: 1;
          height: 12px;
          border: 1px solid var(--border);
          background: #081208;
        }
        .cbt-bar-inner {
          height: 100%;
          background: linear-gradient(90deg, var(--green-dim), var(--green));
          transition: width 0.35s ease;
        }
        .cbt-bar-inner.danger { background: linear-gradient(90deg, #6e0f18, var(--red)); }

        .cbt-inventory {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        .cbt-inv-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          border: 1px solid var(--border);
          padding: 4px 8px;
          background: #081208;
        }
        .cbt-inv-item button {
          background: transparent;
          border: 1px solid var(--green-dim);
          color: var(--green);
          font-family: 'Share Tech Mono', monospace;
          font-size: 10px;
          padding: 2px 6px;
          cursor: pointer;
          margin-left: 4px;
        }
        .cbt-inv-item button:disabled { opacity: 0.3; cursor: not-allowed; }
        .cbt-inv-item button:hover:not(:disabled) { border-color: var(--amber); color: var(--amber); }
        .cbt-inv-item button:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }

        .cbt-map-grid {
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          gap: 4px;
        }
        .cbt-tile {
          aspect-ratio: 1;
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          color: var(--green-dim);
          position: relative;
        }
        .cbt-tile.current {
          background: var(--green);
          color: #041004;
          font-weight: bold;
          box-shadow: 0 0 10px rgba(61,255,110,0.7);
        }
        .cbt-tile.question { color: var(--amber); border-color: var(--amber); }
        .cbt-tile.question.visited { color: var(--green-dim); border-color: var(--border); opacity: 0.5; }
        .cbt-tile.warning { color: var(--red); border-color: var(--red); }
        .cbt-tile.final { color: var(--amber); border-color: var(--amber); font-weight: bold; }
        .cbt-tile.passed { color: var(--green-dim); opacity: 0.6; }

        .cbt-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .cbt-btn {
          background: transparent;
          border: 1px solid var(--green);
          color: var(--green);
          font-family: 'Share Tech Mono', monospace;
          font-size: 13px;
          padding: 10px 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          letter-spacing: 1px;
        }
        .cbt-btn:hover:not(:disabled) { background: rgba(61,255,110,0.12); }
        .cbt-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .cbt-btn:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
        .cbt-btn.amber { border-color: var(--amber); color: var(--amber); }
        .cbt-btn.amber:hover:not(:disabled) { background: rgba(255,180,0,0.12); }
        .cbt-btn.red { border-color: var(--red); color: var(--red); }
        .cbt-btn.red:hover:not(:disabled) { background: rgba(255,77,94,0.12); }

        .cbt-roll-indicator {
          font-family: 'VT323', monospace;
          font-size: 28px;
          color: var(--amber);
          min-height: 34px;
        }
        .cbt-rolling { animation: cbt-spin 0.15s linear infinite; display: inline-block; }
        @keyframes cbt-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

        .cbt-log {
          height: 140px;
          overflow-y: auto;
          font-size: 12px;
          line-height: 1.6;
          color: var(--green-dim);
        }
        .cbt-log div:last-child { color: var(--green); }

        .cbt-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          padding: 16px;
        }
        .cbt-modal {
          background: var(--panel);
          border: 1px solid var(--green);
          box-shadow: 0 0 30px rgba(61,255,110,0.3);
          padding: 28px;
          max-width: 380px;
          width: 100%;
          text-align: center;
        }
        .cbt-modal-icon { margin-bottom: 12px; }
        .cbt-modal-title {
          font-family: 'VT323', monospace;
          font-size: 26px;
          letter-spacing: 2px;
          margin-bottom: 10px;
        }
        .cbt-modal-text { font-size: 13px; color: var(--green-dim); margin-bottom: 18px; }

        .cbt-battle-vs {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 10px;
        }
        .cbt-combatant { flex: 1; }
        .cbt-combatant-label { font-size: 11px; letter-spacing: 2px; color: var(--green-dim); margin-bottom: 4px; }
        .cbt-turn-flag {
          font-family: 'VT323', monospace;
          font-size: 20px;
          text-align: center;
          padding: 6px;
          margin: 10px 0;
          border: 1px dashed var(--border);
          color: var(--amber);
          letter-spacing: 2px;
        }

        .cbt-end-screen {
          text-align: center;
          padding: 40px 20px;
        }
        .cbt-end-title {
          font-family: 'VT323', monospace;
          font-size: 48px;
          letter-spacing: 3px;
          margin-bottom: 12px;
        }

        @media (prefers-reduced-motion: reduce) {
          .cbt-rolling { animation: none; }
          .cbt-bar-inner { transition: none; }
        }
      `}</style>

      <div className="cbt-wrap">
        <div className="cbt-header">
          <div>
            <h1 className="cbt-title">COMBATENTE</h1>
            <div className="cbt-sub">PROTÓTIPO DE MECÂNICAS · v0.1 · sem assets finais</div>
          </div>
          <button className="cbt-reset" onClick={newGame}>
            <RotateCcw size={12} /> NOVO JOGO
          </button>
        </div>

        {/* STATUS */}
        <div className="cbt-panel cbt-scanlines">
          <span className="cbt-panel-label">STATUS</span>
          <div className="cbt-status-grid">
            <div className="cbt-stat">
              <Heart size={16} color="var(--red)" />
              <div className="cbt-bar-outer">
                <div
                  className={`cbt-bar-inner ${game.life <= 5 ? "danger" : ""}`}
                  style={{ width: `${(game.life / game.lifeCap) * 100}%` }}
                />
              </div>
              <span>{game.life}/{game.lifeCap}</span>
            </div>
            <div className="cbt-stat">
              <Crosshair size={16} color="var(--amber)" />
              <span>MUNIÇÃO: {game.ammo}</span>
            </div>
            <div className="cbt-stat">
              <span>CASA: {String(game.position).padStart(2, "0")}/40</span>
            </div>
            <div className="cbt-stat">
              <span>BARALHO: {cardsLeft} restantes</span>
            </div>
          </div>

          <div className="cbt-inventory">
            <div className="cbt-inv-item">
              <Syringe size={14} color="var(--green)" /> SOCORRO x{game.inventory.socorro}
            </div>
            <div className="cbt-inv-item">
              <Package size={14} color="var(--amber)" /> MUNIÇÃO x{game.inventory.municao}
            </div>
            <div className="cbt-inv-item">
              <Bomb size={14} color="var(--amber)" /> GRANADA x{game.inventory.granada}
            </div>
            <div className="cbt-inv-item">
              <Zap size={14} color="var(--red)" /> ADRENALINA x{game.inventory.adrenalina}
              <button disabled={game.inventory.adrenalina <= 0 || game.phase === "fail" || game.phase === "win"} onClick={useAdrenalina}>
                USAR
              </button>
            </div>
          </div>
        </div>

        {/* MAPA */}
        {(game.phase === "map" || game.phase === "battle" || game.phase === "reveal") && (
          <div className="cbt-panel cbt-scanlines">
            <span className="cbt-panel-label">MAPA</span>
            <div className="cbt-map-grid">
              {Array.from({ length: FINAL_TILE }, (_, i) => i + 1).map((tile) => {
                const isCurrent = tile === game.position;
                const isQuestion = QUESTION_TILES.includes(tile);
                const isVisited = game.visited.includes(tile);
                const isWarning = tile === WARNING_TILE;
                const isFinal = tile === FINAL_TILE;
                const isPassed = tile < game.position;
                let cls = "cbt-tile";
                if (isCurrent) cls += " current";
                else if (isWarning) cls += " warning";
                else if (isFinal) cls += " final";
                else if (isQuestion) cls += ` question${isVisited ? " visited" : ""}`;
                else if (isPassed) cls += " passed";
                return (
                  <div key={tile} className={cls}>
                    {isFinal ? "FIM" : isWarning ? "!" : isQuestion && !isVisited ? "?" : String(tile).padStart(2, "0")}
                  </div>
                );
              })}
            </div>

            {game.phase === "map" && (
              <div className="cbt-actions">
                <button className="cbt-btn" onClick={rollMove} disabled={rolling}>
                  <Dices size={16} className={rolling ? "cbt-rolling" : ""} /> ROLAR DADO
                </button>
                <button className="cbt-btn amber" onClick={playCardFromMap} disabled={rolling || !game.canPlayCard}>USAR CARTA</button>
                <div className="cbt-roll-indicator">
                  {rolling ? "rolando..." : rollDisplay?.type === "dice" ? `🎲 ${rollDisplay.value}` : ""}
                </div>

                {/* MAP CARD PICKER MODAL */}
                {game.showMapCardPicker && (
                  <div className="cbt-modal-overlay">
                    <div className="cbt-modal">
                      <div className="cbt-modal-title">Usar Carta</div>
                      <div className="cbt-inventory-list">
                        {Object.entries(game.inventory).filter(([k, v]) => v > 0).map(([k, v]) => (
                          <div key={k} className="cbt-inventory-item">
                            <span>{CARD_INFO[k].label} ({v})</span>
                            <button className="cbt-btn" onClick={() => pickMapCard(k)}>Usar</button>
                          </div>
                        ))}
                      </div>
                      <button className="cbt-btn amber" onClick={() => setGame(g => ({...g, showMapCardPicker: false}))}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* REVEAL MODAL */}
        {game.phase === "reveal" && (
          <div className="cbt-modal-overlay">
            <div className="cbt-modal">
              {game.revealCard ? (
                <>
                  <div className="cbt-modal-icon">
                    {(() => {
                      const Icon = CARD_INFO[game.revealCard].icon;
                      return <Icon size={40} color={`var(--${CARD_INFO[game.revealCard].tone})`} />;
                    })()}
                  </div>
                  <div className="cbt-modal-title">{CARD_INFO[game.revealCard].label}</div>
                  <div className="cbt-modal-text">
                    {game.revealContext === "gate" ? "Carta revelada no portão da fronteira." : "Uma carta foi revelada na casa misteriosa."}
                  </div>
                </>
              ) : (
                <div className="cbt-modal-title">BARALHO VAZIO</div>
              )}
              <button className="cbt-btn amber" onClick={confirmReveal}>
                CONTINUAR
              </button>
            </div>
          </div>
        )}

        {/* BATALHA */}
        {game.phase === "battle" && (
            <BattleOverlay game={game} setGame={setGame} playerAttack={playerAttack} enemyAttack={enemyAttack} useGranada={useGranada} useMunicao={useMunicao} useSocorro={useSocorro} useAdrenalina={useAdrenalina} rolling={rolling} rollDisplay={rollDisplay} />
        )}

            
        {/* FIM DE JOGO */}
        {(game.phase === "win" || game.phase === "fail") && (
          <div className="cbt-panel cbt-scanlines cbt-end-screen">
            <div className="cbt-end-title" style={{ color: game.phase === "win" ? "var(--green)" : "var(--red)" }}>
              {game.phase === "win" ? "MISSÃO CUMPRIDA" : "MISSÃO FRACASSADA"}
            </div>
            <div className="cbt-modal-text">
              {game.phase === "win" ? "Parabéns, soldado. Sua equipe te espera." : "O Combatente não sobreviveu ao caminho de volta."}
            </div>
            <button className="cbt-btn" onClick={newGame}>
              <RotateCcw size={16} /> JOGAR NOVAMENTE
            </button>
          </div>
        )}

        {/* LOG */}
        <div className="cbt-panel cbt-scanlines">
          <span className="cbt-panel-label">REGISTRO</span>
          <div className="cbt-log">
            {game.log.slice(-40).map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- BattleOverlay Component ----------
function BattleOverlay({ game, setGame, playerAttack, enemyAttack, useGranada, useMunicao, useSocorro, useAdrenalina, rolling, rollDisplay }) {
  const isPlayerTurn = game.battle.turn === "player";
  const enemiesLeft = game.battle.enemies.length - game.battle.enemyIndex;
  
  // Get last 8 lines of battle log for narrative
  const battleLogs = game.log.slice(-8).map((line, idx) => {
    let cls = "battle-log-line";
    if (line.includes("Você") || line.includes("coletado")) cls += " active";
    else if (line.includes("Inimigo") || line.includes("Sangramento") || line.includes("derrotado")) cls += " enemy";
    else if (line.includes("🎲") || line.includes("Dado")) cls += " alert";
    return (
      <div key={idx} className={cls}>
        {line}
      </div>
    );
  });

  return (
    <div className="battle-overlay">
      <div className="battle-board cbt-scanlines">
        {/* Header */}
        <div className="battle-header">
          <div className="battle-title">CONFRONTO</div>
          <div style={{ fontSize: '10px', color: 'var(--green-dim)' }}>
            INIMIGOS RESTANTES: {enemiesLeft}
          </div>
        </div>

        {/* Top HUD */}
        <div className="battle-hud">
          <div className="battle-hud-panel">
            <Heart size={14} color="var(--red)" />
            <span>HP: {game.life}/{game.lifeCap}</span>
          </div>
          <div className="battle-hud-panel">
            <Crosshair size={14} color="var(--amber)" />
            <span>MUNIÇÃO: {game.ammo}</span>
          </div>
          {game.bleedTurns > 0 && (
            <div className="battle-hud-panel" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              <span>🩸 SANGRAMENTO ({game.bleedTurns}T)</span>
            </div>
          )}
        </div>

        {/* Main Grid: Scene Left, Log Right */}
        <div className="battle-main-layout">
          {/* Combat Scene with bg photo background */}
          <div className="battle-scene">

            {/* Overlaid Status Bars at the bottom of the photo */}
            <div className="battle-scene-status-row">
              {/* Player Status Card */}
              <div className="battle-status-overlay-card">
                <div className="name">COMBATENTE (VOCÊ)</div>
                <div className="cbt-status-bar-container">
                  <span>HP</span>
                  <div className="cbt-bar-outer" style={{ height: '8px', margin: 0 }}>
                    <div className={`cbt-bar-inner ${game.life <= 10 ? "danger" : ""}`} style={{ width: `${(game.life / game.lifeCap) * 100}%` }} />
                  </div>
                </div>
                <div style={{ fontSize: '8px', color: 'var(--green-dim)', marginTop: '2px' }}>HP: {game.life} / {game.lifeCap}</div>
              </div>
              {/* Progress Sprite */}
              <div className={`progress-sprite ${game.ammo <= 3 ? "walk" : game.ammo > 3 ? "run" : "idle"}`} />

              {/* Enemy Status Card */}
              <div className="battle-status-overlay-card enemy">
                <div className="name">ATIRADOR INIMIGO</div>
                <div className="cbt-status-bar-container" style={{ flexDirection: 'row-reverse' }}>
                  <span>HP</span>
                  <div className="cbt-bar-outer" style={{ height: '8px', margin: 0 }}>
                    <div className="cbt-bar-inner danger" style={{ width: `${(game.battle.enemyHP / 15) * 100}%` }} />
                  </div>
                </div>
                <div style={{ fontSize: '8px', color: 'var(--red)', textAlign: 'right', marginTop: '2px' }}>HP: {game.battle.enemyHP} / 15</div>
              </div>
            </div>
          </div>

          {/* Battle Log on the side */}
          <div className="battle-log-panel">
            <div style={{ fontSize: '9px', color: 'var(--green-dim)', letterSpacing: '1px', marginBottom: '8px', borderBottom: '1px dashed var(--border)', paddingBottom: '4px' }}>LOG DE BATALHA</div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {battleLogs}
            </div>
          </div>
        </div>

        {/* Cards and Deck Area */}
        <div className="battle-deck-area">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ fontSize: '9px', color: 'var(--green-dim)', letterSpacing: '1px' }}>SUAS CARTAS:</div>
            <div className="cards-container">
              {/* Granada Card */}
              <div 
                className={`pixel-card ${game.inventory.granada <= 0 || !isPlayerTurn || rolling ? "disabled" : ""}`}
                style={{ backgroundImage: "url('/card-granada.png')" }}
                onClick={() => { if (game.inventory.granada > 0 && isPlayerTurn && !rolling) useGranada(); }}
                title="Jogar Granada"
              >
                <div className="pixel-card-qty">x{game.inventory.granada}</div>
              </div>

              {/* Municao Card */}
              <div 
                className={`pixel-card ${game.inventory.municao <= 0 || !isPlayerTurn || game.battle.usedMunicao || rolling ? "disabled" : ""}`}
                style={{ backgroundImage: "url('/card-municao.png')" }}
                onClick={() => { if (game.inventory.municao > 0 && isPlayerTurn && !game.battle.usedMunicao && !rolling) useMunicao(); }}
                title="Recarregar Munição"
              >
                <div className="pixel-card-qty">x{game.inventory.municao}</div>
              </div>

              {/* Socorro Card */}
              <div 
                className={`pixel-card ${game.inventory.socorro <= 0 || !isPlayerTurn || game.battle.usedSocorro || rolling ? "disabled" : ""}`}
                style={{ backgroundImage: "url('/card-socorros.png')" }}
                onClick={() => { if (game.inventory.socorro > 0 && isPlayerTurn && !game.battle.usedSocorro && !rolling) useSocorro(); }}
                title="Usar Kit Primeiros Socorros"
              >
                <div className="pixel-card-qty">x{game.inventory.socorro}</div>
              </div>

              {/* Adrenalina Card */}
              <div 
                className={`pixel-card ${game.inventory.adrenalina <= 0 || !isPlayerTurn || rolling ? "disabled" : ""}`}
                style={{ backgroundImage: "url('/card-adrenalina.png')" }}
                onClick={() => { if (game.inventory.adrenalina > 0 && isPlayerTurn && !rolling) useAdrenalina(); }}
                title="Usar Adrenalina"
              >
                <div className="pixel-card-qty">x{game.inventory.adrenalina}</div>
              </div>
            </div>
          </div>

          {/* Deck (Secondary) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', opacity: 0.8 }}>
            <div style={{ fontSize: '8px', color: 'var(--green-dim)', letterSpacing: '0.5px' }}>BARALHO</div>
            <div className="deck-card" title="Baralho (Secundário)">
              <div className="deck-card-count">{(game.deck.length - game.deckPos)}</div>
            </div>
          </div>

          {/* Action HUD / Shoot Button */}
          <div className="battle-actions-hud">
            {isPlayerTurn ? (
              <>
                <button 
                  className="cbt-btn red" 
                  style={{ padding: '12px 20px', fontSize: '11px', fontWeight: 'bold' }} 
                  onClick={playerAttack} 
                  disabled={rolling}
                >
                  ATIRAR (-1 munição)
                </button>
                <div style={{ fontSize: '9px', color: 'var(--amber)', marginTop: '4px' }}>◀ SEU TURNO</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '9px', color: 'var(--red)', animation: 'pulse 1.2s infinite' }}>INIMIGO ATACANDO...</div>
                <style>{`
                  @keyframes pulse {
                    0% { opacity: 0.4; }
                    50% { opacity: 1; }
                    100% { opacity: 0.4; }
                  }
                `}</style>
              </>
            )}
            
            {/* Roll Display Indicator */}
            <div style={{ minHeight: '20px', marginTop: '6px', fontSize: '10px', color: 'var(--amber)' }}>
              {rolling ? "Rolar dado..." : rollDisplay?.value ? `🎲 ${rollDisplay.value}${rollDisplay.coin ? ` · 🪙 ${rollDisplay.coin}` : ""}` : ""}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


