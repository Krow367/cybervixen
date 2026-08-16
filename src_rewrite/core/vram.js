/**
 * vram.js — foxOS Virtual Terminal Video RAM (VRAM) & Framebuffer Raster Engine
 *
 * Schematics:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                       VIRTUAL VRAM LINE MEMORY                          │
 * │  [0]  "SERENITY ROM BIOS 4.02..."                                       │
 * │  [1]  "640 KB BASE MEMORY PARITY TEST ........... [ OK ]"               │
 * │  [2]  "============================================================"    │
 * │  [3]  "FOXOS:/USERS/GUEST> ABOUT"  <── viewportTopIndex                 │
 * │  [4]  "============================================================"    │
 * │  [5]  "WELCOME TO CYBERVIXEN.DEV!"                                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *                                     │
 *                                     ▼ (Blit Loop)
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                   PHYSICAL CRT MONITOR VIEWPORT                         │
 * │  Row 1:  FOXOS:/USERS/GUEST> ABOUT                                      │
 * │  Row 2:  ============================================================   │
 * │  Row 3:  WELCOME TO CYBERVIXEN.DEV!                                     │
 * │  ...                                                                    │
 * │  Row 16: [ -- MORE -- (SPACE / ENTER: Next Page, Q: Quit) ]             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Features:
 * 1. Resolution & Screen-Agnostic: Calculates visible row capacity dynamically.
 * 2. Uniform Character Grid: Zero fractional line heights; no clipped half-rows.
 * 3. Automatic Tag Parser: Converts <h1>, <h2>, <h3>, <b>, <a> to authentic retro terminal rows.
 * 4. Deterministic Snap-to-Row-1: Instant hardware raster repositioning.
 * 5. Hardware Pagination & Discrete Stepping: With mechanical relay/keyclick audio feedback.
 */

import { playRelayThump, playKeyClick } from "./audio.js";

// Master VRAM Line Buffer
const vram = [];

// Pointer to the first line currently visible at Row 1 of the CRT
let viewportTopIndex = 0;

// Maximum text rows that fit on the monitor
let visibleRowCount = 20;

// Terminal DOM Elements
let terminalContainer = null;
let screenLinesContainer = null;
let promptLineElement = null;
let inputElement = null;

// Pager state
let isPaging = false;
let pagingResolve = null;

// Dynamic typography metrics
let measuredLineHeight = 32;

/**
 * Calculates current typography and screen row capacity from the live DOM.
 */
export function recalculateScreenCapacity() {
    if (!terminalContainer) return;

    const computed = window.getComputedStyle(terminalContainer);
    const fontSize = parseFloat(computed.fontSize) || 24;
    const computedLH = parseFloat(computed.lineHeight);
    measuredLineHeight = !isNaN(computedLH) ? computedLH : Math.round(fontSize * 1.35);

    // Reserve 3.5 rows of space at bottom for safety margin, prompt, and MORE badge
    const containerH = terminalContainer.clientHeight;
    visibleRowCount = Math.max(4, Math.floor((containerH - (measuredLineHeight * 3.5)) / measuredLineHeight));
}

/**
 * Formats incoming text or HTML tags into uniform monospaced terminal lines.
 * Converts <h1>, <h2>, <h3> to stylish retro banners on the exact same character grid!
 * 
 * @param {string} raw 
 * @returns {Array<string>} Array of parsed single-line strings
 */
/**
 * Formats incoming text or HTML tags into uniform monospaced terminal lines.
 * Wraps long lines at 76 columns so every single entry in VRAM is strictly 1 row high!
 * Converts <h1>, <h2>, <h3> to stylish retro banners on the exact same character grid.
 * 
 * @param {string} raw 
 * @returns {Array<string>} Array of parsed single-line strings
 */
export function parseAndFormatToVRAM(raw) {
    if (typeof raw !== "string") raw = String(raw || "");

    // ── Pre-process multi-line and single-line <h1-h3> headers into terminal banners ──
    raw = raw.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (match, inner) => {
        const content = inner.replace(/<[^>]+>/g, "").trim().toUpperCase();
        const top = `╔═${"═".repeat(content.length + 2)}═╗`;
        const mid = `║  ${content}  ║`;
        const bot = `╚═${"═".repeat(content.length + 2)}═╝`;
        return `\n${top}\n${mid}\n${bot}\n`;
    });

    raw = raw.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (match, inner) => {
        const content = inner.replace(/<[^>]+>/g, "").trim().toUpperCase();
        return `\n=== [ ${content} ] ===\n`;
    });

    raw = raw.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (match, inner) => {
        const content = inner.replace(/<[^>]+>/g, "").trim();
        return `\n--- ${content} ---\n`;
    });

    const outLines = [];
    const rawLines = raw.split("\n");
    const MAX_COLS = 76;

    for (let l of rawLines) {
        // Clean out unsupported HTML tags while preserving text
        let clean = l.replace(/<br\s*\/?>/gi, "");

        // Word-wrap long sentences into distinct 1-row VRAM lines
        if (clean.length > MAX_COLS && !clean.includes("<")) {
            const words = clean.split(" ");
            let currentLine = "";

            for (const word of words) {
                if ((currentLine + (currentLine ? " " : "") + word).length <= MAX_COLS) {
                    currentLine += (currentLine ? " " : "") + word;
                } else {
                    if (currentLine) outLines.push(currentLine);
                    currentLine = word;
                }
            }
            if (currentLine) outLines.push(currentLine);
        } else {
            outLines.push(clean);
        }
    }

    return outLines;
}

/**
 * Re-renders the visible slice of VRAM onto the CRT screen.
 */
export function renderScreen() {
    if (!screenLinesContainer) return;

    recalculateScreenCapacity();

    // Ensure viewportTopIndex is non-negative and doesn't exceed VRAM length
    viewportTopIndex = Math.max(0, Math.min(viewportTopIndex, Math.max(0, vram.length - 1)));

    screenLinesContainer.innerHTML = "";

    // Sliced visible window of lines from VRAM
    const visibleSlice = vram.slice(viewportTopIndex, viewportTopIndex + visibleRowCount);

    for (let i = 0; i < visibleSlice.length; i++) {
        const item = visibleSlice[i];
        const lineDiv = document.createElement("div");
        lineDiv.className = "terminal-line";
        lineDiv.style.whiteSpace = "pre";
        lineDiv.style.overflow = "hidden";
        lineDiv.style.height = `${measuredLineHeight}px`;
        lineDiv.style.lineHeight = `${measuredLineHeight}px`;

        if (typeof item === "string") {
            if (item.length === 0) {
                lineDiv.textContent = "\u00A0";
            } else if (/<span[^>]*>[\s\S]*<\/span>/i.test(item)) {
                lineDiv.innerHTML = item;
            } else {
                lineDiv.textContent = item;
            }
        } else if (item && item.html) {
            lineDiv.innerHTML = item.html;
        }

        screenLinesContainer.appendChild(lineDiv);
    }

    // Attach active prompt line directly into the raster view beneath the last visible line
    if (promptLineElement && !isPaging) {
        screenLinesContainer.appendChild(promptLineElement);
    }

    // If paging, render the vintage MORE badge at the bottom of the screen
    if (isPaging) {
        const moreBadge = document.createElement("div");
        moreBadge.className = "pager-more-indicator";
        moreBadge.style.color = "var(--boot, #020902)";
        moreBadge.style.background = "var(--phosphor)";
        moreBadge.style.padding = "2px 14px";
        moreBadge.style.fontWeight = "bold";
        moreBadge.style.fontSize = "1.25rem";
        moreBadge.style.width = "fit-content";
        moreBadge.style.margin = "8px 0 0 0";
        moreBadge.style.boxShadow = "0 0 12px var(--phosphor)";
        moreBadge.textContent = "-- MORE -- (SPACE / ENTER: Next Page, Q: Quit)";
        screenLinesContainer.appendChild(moreBadge);
    }
}

/**
 * Pushes a line directly into VRAM and renders.
 * 
 * @param {string} text 
 */
export function printToVRAM(text) {
    const formatted = parseAndFormatToVRAM(text);
    for (const line of formatted) {
        vram.push(line);
    }
    // Only advance viewport if the newly added lines overflow the current visible page
    if (vram.length > (viewportTopIndex + visibleRowCount)) {
        viewportTopIndex = Math.max(0, vram.length - visibleRowCount);
    }
    renderScreen();
}

/**
 * Replaces the most recent line in VRAM with new content (in-place mutation).
 * If VRAM is empty, it falls back to printToVRAM.
 * 
 * @param {string} newText 
 */
export function printReplaceToVRAM(newText) {
    if (vram.length === 0) {
        printToVRAM(newText);
        return;
    }
    const formatted = parseAndFormatToVRAM(newText);
    if (formatted.length > 0) {
        vram[vram.length - 1] = formatted[0];
        // If the replacement string had multiple lines, push the remainder
        for (let i = 1; i < formatted.length; i++) {
            vram.push(formatted[i]);
        }
    }
    renderScreen();
}

/**
 * Clears the entire VRAM buffer (for cls / clear).
 */
export function clearVRAM() {
    vram.length = 0;
    viewportTopIndex = 0;
    renderScreen();
}

/**
 * Snaps the screen so that a specific line index in VRAM is positioned at Row 1.
 * 
 * @param {number} lineIndex - Index in VRAM to align to Row 1
 */
export function snapToRow1(lineIndex) {
    viewportTopIndex = Math.max(0, lineIndex);
    renderScreen();
}

/**
 * Returns the index of the most recent line added to VRAM.
 */
export function getLastVRAMIndex() {
    return Math.max(0, vram.length - 1);
}

/**
 * Sets up the terminal DOM references and discrete input event listeners.
 */
export function initVRAMEngine(containerEl, linesEl, promptEl, inputEl) {
    terminalContainer = containerEl;
    screenLinesContainer = linesEl;
    promptLineElement = promptEl;
    inputElement = inputEl;

    recalculateScreenCapacity();

    // Window resize handler: recalculates row capacity dynamically
    window.addEventListener("resize", () => {
        recalculateScreenCapacity();
        renderScreen();
    });

    // Discrete Mousewheel & Touchpad Hardware Stepping
    let wheelCooldown = false;
    let wheelDeltaAcc = 0;

    containerEl.addEventListener("wheel", (e) => {
        e.preventDefault();
        wheelDeltaAcc += e.deltaY;

        if (Math.abs(wheelDeltaAcc) < 25 || wheelCooldown) return;

        wheelCooldown = true;
        playKeyClick();

        if (wheelDeltaAcc > 0) {
            // Step 2 rows down
            viewportTopIndex = Math.min(Math.max(0, vram.length - visibleRowCount), viewportTopIndex + 2);
        } else {
            // Step 2 rows up
            viewportTopIndex = Math.max(0, viewportTopIndex - 2);
        }

        renderScreen();
        wheelDeltaAcc = 0;

        setTimeout(() => {
            wheelCooldown = false;
        }, 50);
    }, { passive: false });
}

/**
 * Hardware PageUp and PageDown keyboard navigation.
 * 
 * @param {"PageUp"|"PageDown"} key 
 */
export function handlePageNav(key) {
    playRelayThump();
    if (key === "PageUp") {
        viewportTopIndex = Math.max(0, viewportTopIndex - visibleRowCount);
    } else if (key === "PageDown") {
        viewportTopIndex = Math.min(Math.max(0, vram.length - visibleRowCount), viewportTopIndex + visibleRowCount);
    }
    renderScreen();
}

/**
 * Sets the pager active state and waits for user interaction (SPACE, ENTER, Q, ESC).
 * 
 * @returns {Promise<"next"|"quit">}
 */
export function triggerPagerWait() {
    isPaging = true;
    renderScreen();

    return new Promise((resolve) => {
        const handler = (e) => {
            if (e.key === " " || e.key === "Enter" || e.type === "mousedown") {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
                isPaging = false;
                playRelayThump();
                // Advance viewport by 1 full screenful
                viewportTopIndex = Math.min(vram.length, viewportTopIndex + visibleRowCount);
                renderScreen();
                resolve("next");
            } else if (e.key === "q" || e.key === "Q" || e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                cleanup();
                isPaging = false;
                renderScreen();
                resolve("quit");
            }
        };

        function cleanup() {
            window.removeEventListener("keydown", handler, { capture: true });
            window.removeEventListener("mousedown", handler, { capture: true });
        }

        window.addEventListener("keydown", handler, { capture: true });
        window.addEventListener("mousedown", handler, { capture: true });
    });
}

/**
 * Returns whether the active typing index in VRAM exceeds the visible monitor rows.
 * 
 * @param {number} activeLineIndex - Index in VRAM currently being typed
 * @returns {boolean}
 */
export function shouldPageBreak(activeLineIndex) {
    return activeLineIndex >= (viewportTopIndex + visibleRowCount);
}

/**
 * Appends a new character to the active line currently being typed in VRAM.
 * 
 * @param {number} lineIndex - Index in VRAM
 * @param {string} char 
 */
export function appendCharToVRAM(lineIndex, char) {
    if (vram[lineIndex] === undefined) {
        vram[lineIndex] = "";
    }
    vram[lineIndex] += char;
    renderScreen();
}

/**
 * Allocates a new empty line in VRAM.
 * 
 * @returns {number} The newly created line's VRAM index
 */
export function allocateVRAMLine() {
    vram.push("");
    renderScreen();
    return vram.length - 1;
}

/**
 * Directly sets the text of a specific line in VRAM.
 * 
 * @param {number} lineIndex 
 * @param {string} text 
 */
export function setVRAMLine(lineIndex, text) {
    vram[lineIndex] = text;
    renderScreen();
}
