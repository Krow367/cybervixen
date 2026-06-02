import { openWindow, closeWindow } from "../../windows.js";
import { clear, boot } from "../../screen.js";
import { type } from "../../io.js";

export default async function () {
    const terminalEl = document.querySelector(".terminal");
    const rect = terminalEl.getBoundingClientRect();
    const style = getComputedStyle(terminalEl);
    const paddingLeft = parseFloat(style.paddingLeft);
    const paddingTop = parseFloat(style.paddingTop);
    const scrollTop = terminalEl.scrollTop;
    if (!localStorage.getItem("helpRepaired")) {
        openWindow("repair");
    }
    else {
        await type("You've already repaired the help file! You're welcome to play the game again, but nothing new will happen.")
        openWindow("repair");
    }
    await new Promise(resolve => {
        setTimeout(() => init(rect.left + paddingLeft, rect.top, resolve), 50);
    });
}



const ROWS = 3;
const COLS = 3;
const tileW = 18;
const tileH = 9;
var board = [0, 1, 2, 3, 4, 5, 6, 7, 8];
var emptyIndex = 3;
const solved = [0, 1, 2, 3, 4, 5, 6, 7, 8];
let tileContents = [];
const terminalInput = document.getElementById("input");

let gameController = null;

export function init(offsetLeft = 0, offsetTop = 0, onDone = () => { }) {

    // Kill any previous game's listeners in one shot
    gameController?.abort();
    gameController = new AbortController();
    const { signal } = gameController;

    tileContents = sliceArt(); // now the <pre> exists in the DOM
    shuffle();
    renderBoard();
    document.addEventListener("keydown", (e) => handleKeyDown(e, onDone), {signal });
    terminalInput.removeEventListener("keydown", onkeydown);
    debugState();
    const puzzleGrid = document.getElementById("puzzle-grid");
    puzzleGrid.style.position = "absolute";
    puzzleGrid.style.left = offsetLeft + "px";
    puzzleGrid.style.top = offsetTop + "px";
}



function sliceArt() {
    // Grab the raw art string from the hidden <pre> element
    const raw = document.getElementById("art-source").textContent;

    // Split into individual lines, remove any empty lines caused by
    // leading/trailing newlines in the <pre> block
    const lines = raw.split('\n').filter(line => line.length > 0);

    const tiles = [];

    // Loop over the 3 tile rows
    for (let row = 0; row < ROWS; row++) {

        // Grab just the 9 lines that belong to this tile row
        const rowLines = lines.slice(row * tileH, (row + 1) * tileH);

        // Loop over the 3 tile columns
        for (let col = 0; col < COLS; col++) {

            // For each line in this row, cut out just this tile's 18 characters
            const tileLines = rowLines.map(line => line.substring(col * tileW, (col + 1) * tileW));

            // Join the 9 lines back into one string and store it
            tiles.push(tileLines.join('\n'));
        }
    }

    // tiles[0] = top-left, tiles[4] = center, tiles[8] = bottom-right
    return tiles;
}

function shuffle() {
    let lastSwap = -1;
    const shuffleMax = globalThis.DEBUG ? 2 : 300;
    console.log(globalThis.DEBUG)
    let currentShuffle = 0;

    while (currentShuffle < shuffleMax) {
        const candidates = [];
        const left = emptyIndex - 1;
        const right = emptyIndex + 1;
        const above = emptyIndex - COLS;
        const below = emptyIndex + COLS;
        // Check left neighbor (index - 1): valid if in same row
        if (left >= 0 && Math.floor(left / COLS) === Math.floor(emptyIndex / COLS)) {
            candidates.push(left);
        }
        // Check right neighbor (index + 1): valid if in same row
        if (right < ROWS * COLS && Math.floor(right / COLS) === Math.floor(emptyIndex / COLS)) {
            candidates.push(right);
        }
        // Check above neighbor (index - COLS): valid if result >= 0
        if (above >= 0) {
            candidates.push(above);
        }
        // Check below neighbor (index + COLS): valid if result < total tiles
        if (below < ROWS * COLS) {
            candidates.push(below);
        }
        const filtered = candidates.filter(c => c !== lastSwap);

        const chosen = filtered[Math.floor(Math.random() * filtered.length)];

        // Swap chosen tile with empty slot in the board array
        board[emptyIndex] = board[chosen];
        board[chosen] = 3; // 3 is the empty tile identity
        lastSwap = emptyIndex;
        emptyIndex = chosen;
        currentShuffle++
    };

};

function renderBoard() {
    let puzzleGrid = document.getElementById("puzzle-grid");
    puzzleGrid.innerHTML = "";

    for (let i = 0; i < board.length; i++) {
        let div = document.createElement("div");

        if (board[i] === 3) {
            div.className = "puzzle-tile empty";
        } else {
            div.className = "puzzle-tile";
            div.textContent = tileContents[board[i]];
            div.addEventListener("click", () => handleClick(i));
        }
        puzzleGrid.appendChild(div);
    }
}

function debugState() {
    console.log("=== PUZZLE STATE ===");
    console.log("board:", board);
    console.log("emptyIndex:", emptyIndex);
    console.log("solved:", solved);

    // Print the board as a visual grid
    let grid = "";
    for (let i = 0; i < ROWS * COLS; i++) {
        grid += board[i] === 8 ? " _" : " " + board[i];
        if ((i + 1) % COLS === 0) grid += "\n";
    }
    console.log("grid:\n" + grid);

    // Check win condition manually
    const isWon = board.every((val, i) => val === solved[i]);
    console.log("win condition met:", isWon);
}


async function handleKeyDown(e, onDone) {
    const leftTile = emptyIndex - 1;
    const rightTile = emptyIndex + 1;
    const aboveTile = emptyIndex - COLS;
    const belowTile = emptyIndex + COLS;
    let validMove = "";

    if (e.key === "ArrowUp" || e.key === "w") {
        //Move the tile BELOW empty space UP (emptyIndex + COLS)
        if (belowTile < ROWS * COLS) {
            validMove = belowTile;
        }
    }
    else if (e.key === "ArrowDown" || e.key === "s") {
        //move the tile ABOVE empty space DOWN (emptyIndex - COLS)
        if (aboveTile >= 0) {
            validMove = aboveTile;

        }
    }
    else if (e.key === "ArrowLeft" || e.key === "a") {
        //Move the tile RIGHT of the empty space LEFT (emptyIndex + 1)
        if (rightTile < ROWS * COLS && Math.floor(rightTile / COLS) === Math.floor(emptyIndex / COLS)) {
            validMove = rightTile;
        }
    }
    else if (e.key === "ArrowRight" || e.key === "d") {
        //Move the tile LEFT of empty space RIGHT (emptyIndex - 1)
        if (leftTile >= 0 && Math.floor(leftTile / COLS) === Math.floor(emptyIndex / COLS)) {
            validMove = leftTile;
        }

    }
    else if (e.key === "Escape") {
        gameController?.abort();
        closeWindow("repair");
        await type("File repair aborted. All progress has been lost. Run Repair to try again.", { initialWait: 0, wait: 0 });
        onDone();
    }
    else {
        return;
    }
    // We need to bail if no valid move was found.
    if (validMove === "") return;

    const chosen = validMove;
    board[emptyIndex] = board[chosen];
    board[chosen] = 3;
    emptyIndex = chosen;
    renderBoard();
    checkWin(onDone);
}

async function checkWin(onDone) {
    const isWon = board.every((val, i) => val === solved[i]);
    const puzzleGrid = document.getElementById("puzzle-grid");
    const artText = document.getElementById("art-source").textContent.trim();
    if (isWon) {
        const emptyTile = document.querySelector(".puzzle-tile.empty");
        emptyTile.textContent = tileContents[3];
        emptyTile.classList.remove("empty");
        puzzleGrid.classList.add("puzzle-solved");
        puzzleGrid.style.borderColor = "transparent";
        gameController?.abort();
        localStorage.setItem("helpRepaired", "true");
        await new Promise(r => setTimeout(r, 2000));
        closeWindow("repair");
        terminalInput.addEventListener("keydown", onkeydown);
        if (!localStorage.getItem("helpRepaired")) {
            clear();
            await type([
                { kind: "type", text: "File sucessfully repaired." },
                { kind: "type", text: "System Rebooting in.....3" },
                { kind: "replace", line: -1, index: 24, char: "3", wait: 1000 },
                { kind: "replace", line: -1, index: 24, char: "2", wait: 1000 },
                { kind: "replace", line: -1, index: 24, char: "1", wait: 1000 },
                { kind: "replace", line: -1, index: 24, char: "0", wait: 1000 },
            ]);
            boot();
        }
        else {
            await type("Nice! You did it again! Bet you can't do it quicker.", { initialWait: 0 })
            onDone();
        }
    }
}
