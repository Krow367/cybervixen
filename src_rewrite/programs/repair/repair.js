/**
 * repair.js — foxOS In-Terminal Memory Restoration Diagnostic (REPAIR)
 * 
 * Runs directly in the terminal CRT buffer:
 * - Interactive 3x3 sliding puzzle rendered inside the terminal
 * - Solvable random-walk tile shuffling
 * - WASD, Arrow Keys, and Click-to-slide support
 * - Escape key to abort
 * - Restores help file integrity in localStorage
 * - Triggers firmware commit and system warm reboot sequence
 */

import { runBootSequence } from "../../core/boot.js";
import { playRelayThump, playBootChime, playBell } from "../../core/audio.js";
import { FOXHOUND_BADGE } from "../../core/art.js";
import { unlockCipher } from "../ciphers/ciphers.js";

const ASCII_ART = FOXHOUND_BADGE;

export async function launchRepair(ctx) {
    const isRepaired = localStorage.getItem("helpRepaired") === "true";
    if (isRepaired) {
        ctx.print("[SYSTEM] System help buffer integrity is already at 100%. Re-running diagnostic simulator...\n");
    }

    const ROWS = 3;
    const COLS = 3;
    const tileW = 18;
    const tileH = 9;

    // 1. Slice raw ASCII lines into 9 equal tiles (18ch wide x 9 lines high)
    const rawLines = ASCII_ART.trim().split("\n");
    const tileContents = [];

    for (let r = 0; r < ROWS; r++) {
        const rowLines = rawLines.slice(r * tileH, (r + 1) * tileH);
        for (let c = 0; c < COLS; c++) {
            const tileLines = rowLines.map(line => {
                const padded = line.padEnd(54, " ");
                return padded.substring(c * tileW, (c + 1) * tileW);
            });
            tileContents.push(tileLines.join("\n"));
        }
    }

    // 2. Solvable Random-Walk Shuffle
    let board = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let emptyIndex = 3; // Start with slot 3 as the open slot

    function shuffle() {
        let lastSwap = -1;
        const shuffleSteps = 80;
        for (let s = 0; s < shuffleSteps; s++) {
            const candidates = [];
            const left  = emptyIndex - 1;
            const right = emptyIndex + 1;
            const above = emptyIndex - COLS;
            const below = emptyIndex + COLS;

            if (left >= 0 && Math.floor(left / COLS) === Math.floor(emptyIndex / COLS)) candidates.push(left);
            if (right < ROWS * COLS && Math.floor(right / COLS) === Math.floor(emptyIndex / COLS)) candidates.push(right);
            if (above >= 0) candidates.push(above);
            if (below < ROWS * COLS) candidates.push(below);

            const filtered = candidates.filter(c => c !== lastSwap);
            const chosen = filtered[Math.floor(Math.random() * filtered.length)];

            board[emptyIndex] = board[chosen];
            board[chosen] = 3;
            lastSwap = emptyIndex;
            emptyIndex = chosen;
        }
    }
    shuffle();

    // 3. Clear terminal & disable standard command input line
    ctx.clear();
    ctx.setInputEnabled(false);

    // 4. Create and mount interactive diagnostic DOM directly in terminal
    const terminal = document.querySelector(".terminal");
    const container = document.createElement("div");
    container.id = "repair-diagnostic-container";
    container.style.padding = "0.5rem 0";
    terminal.appendChild(container);

    const header = document.createElement("div");
    header.style.marginBottom = "1rem";
    header.innerHTML = `
        <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 4px;">SERENITY INDUSTRIES // MEMORY MATRIX DIAGNOSTIC</div>
        <div style="font-size: 1.2rem; opacity: 0.8;">[SYSTEM] Align the 9 memory sectors to restore HELP buffer integrity.</div>
        <div style="font-size: 1.1rem; opacity: 0.7; margin-top: 4px;">Controls: WASD / Arrow Keys or Click tiles to slide — [ESC] to abort</div>
    `;
    container.appendChild(header);

    const grid = document.createElement("div");
    grid.id = "puzzle-grid";
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(3, 18ch)";
    grid.style.gap = "2px";
    grid.style.margin = "1rem 0";
    grid.style.width = "fit-content";
    grid.style.fontFamily = "'Hack', monospace";
    grid.style.fontSize = "1.05rem";
    grid.style.lineHeight = "1.15";
    container.appendChild(grid);

    const statusBanner = document.createElement("div");
    statusBanner.style.marginTop = "1rem";
    statusBanner.style.fontSize = "1.2rem";
    statusBanner.style.fontWeight = "bold";
    statusBanner.textContent = "STATUS: CORRUPTED MEMORY SECTORS DETECTED";
    container.appendChild(statusBanner);

    function renderBoard(isSolved = false) {
        grid.innerHTML = "";
        grid.style.gap = isSolved ? "0px" : "2px";

        for (let i = 0; i < 9; i++) {
            const tile = document.createElement("div");
            tile.className = "puzzle-tile";
            tile.style.width = "18ch";
            tile.style.whiteSpace = "pre";
            tile.style.fontFamily = "'Hack', monospace";
            tile.style.fontSize = "inherit";
            tile.style.lineHeight = "inherit";
            tile.style.boxSizing = "border-box";
            tile.style.color = "var(--phosphor)";
            tile.style.textShadow = "var(--phosphor-glow)";

            if (i === emptyIndex && !isSolved) {
                tile.className += " empty";
                tile.style.border = "1px dashed rgba(var(--phosphor-rgb), 0.2)";
                tile.style.background = "rgba(0, 0, 0, 0.4)";
                tile.style.cursor = "default";
                tile.textContent = "";
            } else {
                tile.style.border = isSolved ? "1px solid transparent" : "1px solid rgba(var(--phosphor-rgb), 0.25)";
                tile.style.background = "rgba(2, 9, 2, 0.9)";
                tile.style.cursor = isSolved ? "default" : "pointer";
                tile.textContent = tileContents[board[i]];
                if (!isSolved) {
                    tile.addEventListener("click", () => handleTileClick(i));
                }
            }

            grid.appendChild(tile);
        }
        terminal.scrollTop = terminal.scrollHeight;
    }

    function checkVictory() {
        return board.every((val, idx) => val === idx);
    }

    function isAdjacent(pos1, pos2) {
        const r1 = Math.floor(pos1 / 3), c1 = pos1 % 3;
        const r2 = Math.floor(pos2 / 3), c2 = pos2 % 3;
        return (Math.abs(r1 - r2) + Math.abs(c1 - c2)) === 1;
    }

    function moveTile(pos) {
        if (!isAdjacent(pos, emptyIndex)) return;

        playRelayThump();

        // Perform standard tile swap
        const temp = board[emptyIndex];
        board[emptyIndex] = board[pos];
        board[pos] = temp;
        emptyIndex = pos;

        if (checkVictory()) {
            finishVictory();
        } else {
            renderBoard(false);
        }
    }

    function handleTileClick(pos) {
        moveTile(pos);
    }

    async function finishVictory() {
        cleanup();
        playBootChime();
        localStorage.setItem("helpRepaired", "true");
        unlockCipher("circuit_repair");
        renderBoard(true);

        statusBanner.innerHTML = `
            <div style="color: var(--phosphor); background: rgba(var(--phosphor-rgb), 0.2); padding: 6px 14px; border: 1px solid var(--phosphor); width: fit-content; margin-top: 10px;">
                ★ MATRIX INTEGRITY 100% RESTORED ★
            </div>
            <div id="reboot-countdown" style="margin-top: 12px; font-size: 1.25rem; font-weight: bold; letter-spacing: 1px;">
                [SYSTEM] Applying reconstructed sector patches...
            </div>
        `;

        const countdownEl = statusBanner.querySelector("#reboot-countdown");
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        await sleep(1200);
        countdownEl.textContent = "SYSTEM REBOOTING IN 3...";
        await sleep(800);
        countdownEl.textContent = "SYSTEM REBOOTING IN 2...";
        await sleep(800);
        countdownEl.textContent = "SYSTEM REBOOTING IN 1...";
        await sleep(800);

        // Remove diagnostic puzzle DOM before boot sequence runs
        container.remove();
        ctx.clear();

        // Execute warm reboot with firmware update POST
        await runBootSequence(ctx, true);
    }

    function handleKeyDown(e) {
        const leftTile  = emptyIndex - 1;
        const rightTile = emptyIndex + 1;
        const aboveTile = emptyIndex - COLS;
        const belowTile = emptyIndex + COLS;

        if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
            if (belowTile < ROWS * COLS) { e.preventDefault(); moveTile(belowTile); }
        } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
            if (aboveTile >= 0) { e.preventDefault(); moveTile(aboveTile); }
        } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
            if (rightTile < ROWS * COLS && Math.floor(rightTile / COLS) === Math.floor(emptyIndex / COLS)) { e.preventDefault(); moveTile(rightTile); }
        } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
            if (leftTile >= 0 && Math.floor(leftTile / COLS) === Math.floor(emptyIndex / COLS)) { e.preventDefault(); moveTile(leftTile); }
        } else if (e.key === "Escape") {
            e.preventDefault();
            cleanup();
            container.remove();
            playBell(440, 0.1);
            ctx.clear();
            ctx.setInputEnabled(true);
            ctx.print("[SYSTEM ALERT] File repair aborted. Memory state uncommitted. Type 'repair' to retry.");
        }
    }

    function cleanup() {
        window.removeEventListener("keydown", handleKeyDown);
    }

    window.addEventListener("keydown", handleKeyDown);
    renderBoard(false);
}
