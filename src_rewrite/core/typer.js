import { playTeletypeClick } from "./audio.js";
import {
    parseAndFormatToVRAM,
    allocateVRAMLine,
    appendCharToVRAM,
    setVRAMLine,
    snapToRow1,
    getLastVRAMIndex,
    shouldPageBreak,
    triggerPagerWait,
    renderScreen
} from "./vram.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Types content into the foxOS VRAM Framebuffer with authentic teletypewriter cadence.
 * 
 * @param {HTMLElement} container - Unused in VRAM mode (kept for backwards-compat signature)
 * @param {string|Array<string>} content - Text content or array of lines
 * @param {object} options:
 *   - speed: ms delay per character (default: 12)
 *   - lineDelay: ms delay between lines (default: 60)
 *   - cpuLoad: 0-100 artificial CPU strain cadence variance
 *   - pager: boolean (default: true), pauses stream when content exceeds display height
 *   - jitter: 0-1 timing irregularity
 *   - onChar: optional callback fired per character
 */
export async function type(container, content, options = {}) {
    const {
        speed = 12,
        lineDelay = 60,
        cpuLoad = 15,
        pager = true,
        jitter = 0.2,
        onChar = null
    } = options;

    const rawString = Array.isArray(content) ? content.join("\n") : content;
    const lines = parseAndFormatToVRAM(rawString);

    let skip = false;
    const skipHandler = (e) => {
        if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
        skip = true;
    };
    const visibilityHandler = () => {
        if (document.hidden) skip = true;
    };

    window.addEventListener("keydown", skipHandler, { capture: true });
    window.addEventListener("mousedown", skipHandler, { capture: true });
    document.addEventListener("visibilitychange", visibilityHandler);

    try {
        for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i];

            // ── 1. Hardware Page Break Check ──
            const nextLineIndex = getLastVRAMIndex() + 1;
            if (pager && shouldPageBreak(nextLineIndex) && i > 0) {
                const action = await triggerPagerWait();
                if (action === "quit") {
                    break;
                }
            }

            // ── 2. Allocate Line in VRAM ──
            const vramLineIdx = allocateVRAMLine();

            const isHTML = options.html || /<[a-z][\s\S]*>/i.test(lineText);

            // Strip trailing invisible whitespace from line
            const cleanLine = lineText.replace(/[\s\u2800\u00A0]+$/, "");

            if (cleanLine.length === 0) {
                setVRAMLine(vramLineIdx, "");
            } else if (skip || speed <= 0 || isHTML) {
                setVRAMLine(vramLineIdx, cleanLine);
            } else {
                // Find start of first visible character on the line
                let firstVisibleIdx = 0;
                while (
                    firstVisibleIdx < cleanLine.length &&
                    (!cleanLine[firstVisibleIdx].trim() || cleanLine[firstVisibleIdx] === "\u2800" || cleanLine[firstVisibleIdx] === "\u00A0")
                ) {
                    firstVisibleIdx++;
                }

                // If line is purely whitespace, set and proceed
                if (firstVisibleIdx >= cleanLine.length) {
                    setVRAMLine(vramLineIdx, cleanLine);
                } else {
                    // Fast-forward initial leading whitespace instantly to first visible character
                    if (firstVisibleIdx > 0) {
                        const leadingWhitespace = cleanLine.substring(0, firstVisibleIdx);
                        appendCharToVRAM(vramLineIdx, leadingWhitespace);
                    }

                    for (let charIndex = firstVisibleIdx; charIndex < cleanLine.length; charIndex++) {
                        if (skip || document.hidden) {
                            setVRAMLine(vramLineIdx, cleanLine.replace(/\{\{pause:\d+\}\}/g, ""));
                            break;
                        }

                        // ── Check for Inline Pause Token (e.g. {{pause:250}}) ──
                        if (cleanLine.startsWith("{{pause:", charIndex)) {
                            const endIdx = cleanLine.indexOf("}}", charIndex);
                            if (endIdx !== -1) {
                                const pauseMs = parseInt(cleanLine.substring(charIndex + 8, endIdx), 10) || 100;
                                charIndex = endIdx + 1; // Advance past }}
                                await sleep(pauseMs);
                                continue;
                            }
                        }

                        const char = cleanLine[charIndex];
                        appendCharToVRAM(vramLineIdx, char);
                        if (onChar) onChar(char);

                        // Rule A: Middle spaces are NOT skipped.
                        // Rule B: Clicks only play on visible, non-blank characters.
                        const isBlank = !char.trim() || char === "\u2800" || char === "\u00A0";
                        if (!isBlank) {
                            playTeletypeClick();
                        }

                        // Cadence & High-Impact CPU Strain Variance
                        let charDelay = speed;
                        if (jitter > 0) {
                            const variance = (Math.random() * 2 - 1) * (speed * jitter);
                            charDelay = Math.max(1, charDelay + variance);
                        }
                        if (cpuLoad > 0) {
                            const loadFactor = cpuLoad / 100;
                            charDelay = Math.max(1, charDelay * (1 + loadFactor * 1.5));
                            if (Math.random() < Math.min(0.40, loadFactor * 0.35)) {
                                charDelay += Math.floor(Math.random() * (loadFactor * 220) + 40);
                            }
                        }

                        await sleep(charDelay);
                    }
                }
            }

            if (!skip && lineDelay > 0 && i < lines.length - 1) {
                let actualLineDelay = lineDelay;
                if (cpuLoad > 0) {
                    const loadFactor = cpuLoad / 100;
                    actualLineDelay = lineDelay * (1 + loadFactor * 1.2);
                }
                await sleep(actualLineDelay);
            }
        }
    } finally {
        window.removeEventListener("keydown", skipHandler, { capture: true });
        window.removeEventListener("mousedown", skipHandler, { capture: true });
        document.removeEventListener("visibilitychange", visibilityHandler);
    }
}
