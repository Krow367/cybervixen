import { clear, boot } from "../../screen.js";
import { type, alert } from "../../io.js";
import { registerGame, abortGame } from "../../games.js";

// Inject CSS and art-source HTML once on first load
let _loaded = false;
async function ensureAssets() {
    if (_loaded) return;
    _loaded = true;

    // CSS
    const link = document.createElement("link");
    link.rel   = "stylesheet";
    link.href  = "./commands/repair/repair.css";
    document.head.appendChild(link);

    // Art source HTML (the hidden <pre> the puzzle needs)
    const html = await fetch("./commands/repair/repair.html").then(r => r.text());
    document.body.insertAdjacentHTML("beforeend", html);
}

export default async function () {
    await ensureAssets();
    if (localStorage.getItem("helpRepaired")) {
        await type("You've already repaired the help file! You're welcome to play the game again, but nothing new will happen.");
    }

    clear();

    await new Promise(resolve => {
        setTimeout(() => init(resolve), 50);
    });
}

// ─── Puzzle constants ─────────────────────────────────────────────────────────

const ROWS = 3;
const COLS = 3;
const tileW = 18;
const tileH = 9;
const solved = [0, 1, 2, 3, 4, 5, 6, 7, 8];

// ─── Puzzle state ─────────────────────────────────────────────────────────────

var board = [0, 1, 2, 3, 4, 5, 6, 7, 8];
var emptyIndex = 3;
let tileContents = [];

// ─── Init ─────────────────────────────────────────────────────────────────────

export function init(onDone = () => {}) {
    // Reset board state for replays
    board = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    emptyIndex = 3;

    const controller = new AbortController();
    registerGame("repair", controller);
    const { signal } = controller;

    tileContents = sliceArt();
    shuffle();
    renderBoard();

    document.addEventListener("keydown", (e) => handleKeyDown(e, onDone), { signal });

    debugState();
}

// ─── Art slicing ──────────────────────────────────────────────────────────────

function sliceArt() {
    const raw   = document.getElementById("art-source").textContent;
    const lines = raw.split("\n").filter(line => line.length > 0);
    const tiles = [];

    for (let row = 0; row < ROWS; row++) {
        const rowLines = lines.slice(row * tileH, (row + 1) * tileH);
        for (let col = 0; col < COLS; col++) {
            const tileLines = rowLines.map(line => line.substring(col * tileW, (col + 1) * tileW));
            tiles.push(tileLines.join("\n"));
        }
    }
    return tiles;
}

// ─── Shuffle ──────────────────────────────────────────────────────────────────

function shuffle() {
    let lastSwap = -1;
    const shuffleMax = globalThis.DEBUG ? 2 : 300;
    let currentShuffle = 0;

    while (currentShuffle < shuffleMax) {
        const candidates = [];
        const left  = emptyIndex - 1;
        const right = emptyIndex + 1;
        const above = emptyIndex - COLS;
        const below = emptyIndex + COLS;

        if (left >= 0  && Math.floor(left  / COLS) === Math.floor(emptyIndex / COLS)) candidates.push(left);
        if (right < ROWS * COLS && Math.floor(right / COLS) === Math.floor(emptyIndex / COLS)) candidates.push(right);
        if (above >= 0)            candidates.push(above);
        if (below < ROWS * COLS)   candidates.push(below);

        const filtered = candidates.filter(c => c !== lastSwap);
        const chosen   = filtered[Math.floor(Math.random() * filtered.length)];

        board[emptyIndex] = board[chosen];
        board[chosen]     = 3;
        lastSwap          = emptyIndex;
        emptyIndex        = chosen;
        currentShuffle++;
    }
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderBoard() {
    const terminal  = document.querySelector(".terminal");
    let puzzleGrid  = document.getElementById("puzzle-grid");

    // Create the grid if it doesn't exist yet, otherwise reuse it
    if (!puzzleGrid) {
        puzzleGrid = document.createElement("div");
        puzzleGrid.id = "puzzle-grid";
        terminal.appendChild(puzzleGrid);
    }

    puzzleGrid.innerHTML = "";

    for (let i = 0; i < board.length; i++) {
        const div = document.createElement("div");
        if (board[i] === 3) {
            div.className = "puzzle-tile empty";
        } else {
            div.className = "puzzle-tile";
            div.textContent = tileContents[board[i]];
            div.addEventListener("click", () => handleClick(i));
        }
        puzzleGrid.appendChild(div);
    }

    // Directions hint below the grid
    let directions = document.getElementById("directions");
    if (!directions) {
        directions = document.createElement("div");
        directions.id = "directions";
        directions.textContent = "Use WASD or Arrow Keys to move tiles — Escape to quit";
        terminal.appendChild(directions);
    }
}

// ─── Debug ────────────────────────────────────────────────────────────────────

/* function debugState() {
    console.log("=== PUZZLE STATE ===");
    console.log("board:", board);
    console.log("emptyIndex:", emptyIndex);
    let grid = "";
    for (let i = 0; i < ROWS * COLS; i++) {
        grid += board[i] === 3 ? " _" : " " + board[i];
        if ((i + 1) % COLS === 0) grid += "\n";
    }
    console.log("grid:\n" + grid);
    console.log("win condition met:", board.every((val, i) => val === solved[i]));
} */

// ─── Input handling ───────────────────────────────────────────────────────────

async function handleKeyDown(e, onDone) {
    const leftTile  = emptyIndex - 1;
    const rightTile = emptyIndex + 1;
    const aboveTile = emptyIndex - COLS;
    const belowTile = emptyIndex + COLS;
    let validMove   = "";

    if (e.key === "ArrowUp" || e.key === "w") {
        if (belowTile < ROWS * COLS) validMove = belowTile;
    } else if (e.key === "ArrowDown" || e.key === "s") {
        if (aboveTile >= 0) validMove = aboveTile;
    } else if (e.key === "ArrowLeft" || e.key === "a") {
        if (rightTile < ROWS * COLS && Math.floor(rightTile / COLS) === Math.floor(emptyIndex / COLS)) validMove = rightTile;
    } else if (e.key === "ArrowRight" || e.key === "d") {
        if (leftTile >= 0 && Math.floor(leftTile / COLS) === Math.floor(emptyIndex / COLS)) validMove = leftTile;
    } else if (e.key === "Escape") {
        abortGame("repair");
        clear();
        alert("File repair aborted. All progress has been lost. Run Repair to try again.",{remove: true});
        onDone();
        return;
    } else {
        return;
    }

    if (validMove === "") return;

    board[emptyIndex] = board[validMove];
    board[validMove]  = 3;
    emptyIndex        = validMove;
    renderBoard();
    checkWin(onDone);
}

function handleClick(i) {
    const leftTile  = emptyIndex - 1;
    const rightTile = emptyIndex + 1;
    const aboveTile = emptyIndex - COLS;
    const belowTile = emptyIndex + COLS;
    const neighbors = [leftTile, rightTile, aboveTile, belowTile];

    if (!neighbors.includes(i)) return;

    // Validate row boundary for left/right moves
    if ((i === leftTile || i === rightTile) && Math.floor(i / COLS) !== Math.floor(emptyIndex / COLS)) return;

    board[emptyIndex] = board[i];
    board[i]          = 3;
    emptyIndex        = i;
    renderBoard();
}

// ─── Win condition ────────────────────────────────────────────────────────────

async function checkWin(onDone) {
    const isWon = board.every((val, i) => val === solved[i]);
    if (!isWon) return;

    const puzzleGrid = document.getElementById("puzzle-grid");

    // Fill in the empty tile
    const emptyTile = document.querySelector(".puzzle-tile.empty");
    emptyTile.textContent = tileContents[3];
    emptyTile.classList.remove("empty");
    puzzleGrid.classList.add("puzzle-solved");

    abortGame("repair");
    localStorage.setItem("helpRepaired", "true");

    await new Promise(r => setTimeout(r, 2000));
    clear();

    if (localStorage.getItem("helpRepaired")) {
        // First time win — reboot sequence
        await type([
            { kind: "type", text: "Help file successfully repaired." },
            { kind: "type", text: "\nSystem Rebooting in.....3" },
            { kind: "replace", index: -1, char: "2", wait: 1000 },
            { kind: "replace", index: -1, char: "1", wait: 1000 },
            { kind: "replace", index: -1, char: "0", wait: 1000 },
        ], { initialWait: 0 });
        boot();
    } else {
        await type("Nice! You did it again! Bet you can't do it quicker.", { initialWait: 0 });
        onDone();
    }
}
