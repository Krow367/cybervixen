import { clear } from "../../screen.js";
import { type, alert } from "../../io.js";
import { registerGame, abortGame } from "../../games.js";

let _loaded = false;

async function ensureAssets() {
    if (_loaded) return;
    _loaded = true;

    const crt = document.getElementById("crt");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/foxClaw/foxclaw.css";
    document.head.appendChild(link);

    const html = await fetch("/foxClaw/foxclaw.html").then(r => r.text());
    crt.insertAdjacentHTML("afterbegin", html);
}

export default async function () {
    await ensureAssets();
    clear();
    await new Promise(resolve => setTimeout(() => init(resolve), 50));
}

export function init(onDone = () => { }) {
    const controller = new AbortController();
    registerGame("foxclaw", controller);
    const { signal } = controller;

    resetState();
    render();

    document.addEventListener("keydown", e => handleKeyDown(e, onDone), { signal });
    document.addEventListener("keyup", e => handleKeyUp(e), { signal });
}

const MAP_W = 20;
const MAP_H = 12;
const WALL = "#";
const FLOOR = ".";
const PLAYER = "@";

let gameOver = false;
let pendingAction = null;

let map = [];
let player = {};
let messages = [];
let enemies = [];

function resetState() {
    map = Array.from({ length: MAP_H }, (_, y) =>
        Array.from({ length: MAP_W }, (_, x) => {
            if (y === 0 || y === MAP_H - 1 || x === 0 || x === MAP_W - 1) return WALL;
            return FLOOR;
        })
    );

    player = { x: 1, y: 1, hp: 10, attack: 5, defense: 3, type: "player", };
    messages = ["Use WASD or Arrow Keys to move. Escape quits."];
    enemies = [spawnEnemy("daemon", 4, 4)];
}

function spawnEnemy(type, x, y) {
    const base = enemyDefs[type];
    return {
        id: crypto.randomUUID(),
        type,
        x,
        y,
        hp: base.hp,
        attack: base.attack,
        defense: base.defense,
        vision: base.vision,
        speed: base.speed,
        glyph: base.glyph,
        color: base.color,
        alive: true
    };
}

function render() {
    const root = document.getElementById("foxclaw-root");
    if (!root) return;

    const rows = [];
    for (let y = 0; y < MAP_H; y++) {
        let line = "";
        for (let x = 0; x < MAP_W; x++) {
            line += getGlyph(x, y);
        }
        rows.push(line);
    }

    root.innerHTML = `
<pre class="foxclaw-map">${rows.join("\n")}</pre>
<div class="foxclaw-hud">HP: ${player.hp}</div>
<div class="foxclaw-log">${messages.slice(-4).join("<br>")}</div>
    `;
}

function getGlyph(x, y) {
    if (player.x === x && player.y === y) return PLAYER;

    const enemy = enemies.find(e => e.alive && e.x === x && e.y === y);
    if (enemy) return enemy.glyph;

    /*     const item = items.find(i => i.x === x && i.y === y);
        if (item) return item.glyph; */

    return map[y][x];
}

function pushMessage(text) {
    messages.push(text);
    render();
}

//Player's turn
function tryMove(dx, dy) {
    const nx = player.x + dx;
    const ny = player.y + dy;

    if (map[ny]?.[nx] === WALL) {
        pushMessage("You bump into a wall.");
        return;
    }

    const enemy = enemies.find(e => e.alive && e.x === nx && e.y === ny);
    if (enemy) {
        attack(player, enemy);
        if (enemy.alive) {
            enemyTurn();
        } else {
            pushMessage(`The ${enemy.type} dies.`);
            player.x = nx;
            player.y = ny;
            enemyTurn();
        }
        render();
        return;
    }

    player.x = nx;
    player.y = ny;
    enemyTurn();
    render();
}

//enemy turn
function enemyTurn() {
    for (const enemy of enemies) {
        if (!enemy.alive) continue;

        if (isAdjacent(enemy, player)) {
            attack(enemy, player);
            continue;
        }

        if (canSee(enemy, player, map)) {
            inCombat = true;
            moveToward(enemy, player, map, enemies);
        } else {
            inCombat = false;
        }
    }
}

const heldKeys = new Set();
let inCombat = false;

function handleKeyDown(e, onDone) {
    const el = document.getElementById("alert-frame");
    if (e.key === "Escape") {
        stopGame(onDone);
        el?.classList.add("hidden");
        return;
    }
    if (gameOver) {
        if (e.key === "y" || e.key === "Y") {
            gameOver = false;
            pendingAction = null;
            resetState();
            render();
            el?.classList.add("hidden");

        }
        return;
    }

    const isMoveKey =
        e.key === "ArrowUp" || e.key === "w" ||
        e.key === "ArrowDown" || e.key === "s" ||
        e.key === "ArrowLeft" || e.key === "a" ||
        e.key === "ArrowRight" || e.key === "d";

    if (!isMoveKey) return;

    if (inCombat && e.repeat) return;

    if (heldKeys.has(e.key) && inCombat) return;

    heldKeys.add(e.key);

    if (e.key === "ArrowUp" || e.key === "w") return tryMove(0, -1);
    if (e.key === "ArrowDown" || e.key === "s") return tryMove(0, 1);
    if (e.key === "ArrowLeft" || e.key === "a") return tryMove(-1, 0);
    if (e.key === "ArrowRight" || e.key === "d") return tryMove(1, 0);
}

function handleKeyUp(e) {
    heldKeys.delete(e.key);
}

function stopGame(onDone) {
    const root = document.getElementById("foxclaw-root");
    if (root) root.remove();

    abortGame("foxclaw");
    clear();
    onDone();
}


// Enemy Definitions
const enemyDefs = {
    daemon: {
        glyph: "d",
        color: "#ca0202ff",
        hp: 8,
        attack: 3,
        defense: 2,
        vision: 3,
        speed: 1,
    }
};

function isAdjacent(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function attack(attacker, defender) {
    const damage = Math.max(1, attacker.attack - defender.defense);
    defender.hp -= damage;
    if (defender.hp <= 0) defender.alive = false;
    pushMessage(`The ${attacker.type} attacks ${defender.type} for ${damage} damage!`);

    if (defender === player && player.hp <= 0) {
        handlePlayerDeath();
    }
}

function canSee(enemy, player, map) {
    const dx = Math.sign(player.x - enemy.x);
    const dy = Math.sign(player.y - enemy.y);
    let x = enemy.x;
    let y = enemy.y;

    while (x !== player.x || y !== player.y) {
        x += dx;
        y += dy;
        if (x === player.x && y === player.y) return true;
        if (map[y]?.[x] === "#") return false;
    }
    return true;
}

function moveToward(enemy, player, map, enemies) {
    const stepX = Math.sign(player.x - enemy.x);
    const stepY = Math.sign(player.y - enemy.y);

    const tryX = { x: enemy.x + stepX, y: enemy.y };
    const tryY = { x: enemy.x, y: enemy.y + stepY };

    if (stepX !== 0 && isOpen(tryX.x, tryX.y, map, enemies)) {
        enemy.x = tryX.x;
        enemy.y = tryX.y;
        return;
    }

    if (stepY !== 0 && isOpen(tryY.x, tryY.y, map, enemies)) {
        enemy.x = tryY.x;
        enemy.y = tryY.y;
    }
}

function isOpen(x, y, map, enemies) {
    if (map[y]?.[x] === "#") return false;
    if (enemies.some(e => e.alive && e.x === x && e.y === y)) return false;
    return true;
}

function handlePlayerDeath() {
    if (gameOver) return;

    gameOver = true;
    pendingAction = "restart-run";
    alert("YOU DIED :: PRESS Y TO RESTART OR ESC TO QUIT");
    render();
}