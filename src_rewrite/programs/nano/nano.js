/**
 * nano.js — In-Terminal Text Editor Cartridge for foxOS
 * 
 * Takes over the full terminal display raster to provide an authentic,
 * distraction-free 1980s text editing environment.
 * 
 * Features:
 * - Top Status Bar: File Path, State, Modified indicator
 * - Main Text Buffer: Full in-place line editing, cursor navigation, Enter, Backspace
 * - Bottom Hotkey Bar: ^O WriteOut (Save), ^X Exit, ^K Cut Line, ^U Paste Line
 * - VFS Integration: Saves edits directly into Virtual File System and localStorage NVRAM
 */

import { readFileContent, writeFileContent } from "../../core/vfs.js";
import { playKeyClick, playRelayThump, playDiskSeek, playBell } from "../../core/audio.js";

/**
 * Launches the in-terminal nano editor for a target file.
 * 
 * @param {string} targetFile - File path to edit (e.g. "NOTES/TODO.TXT")
 * @param {object} ctx - Terminal execution context
 */
export async function launchNano(targetFile, ctx) {
    if (!targetFile) {
        ctx.error("Usage: nano <filename>\nExample: nano NOTES/TODO.TXT");
        return;
    }

    const terminal = document.getElementById("terminal-buffer");
    const outputLines = document.getElementById("output-lines");
    const activePromptLine = document.getElementById("active-prompt-line");

    // Hide standard command buffer & prompt
    outputLines.style.display = "none";
    activePromptLine.style.display = "none";

    // Read initial file content from VFS
    let content = "";
    let isNewFile = false;
    const fileRes = await readFileContent(targetFile);
    const isReadOnly = !!fileRes.readOnly;

    if (fileRes.content !== undefined) {
        content = fileRes.content;
    } else {
        isNewFile = true;
    }

    // Lines state
    let lines = content ? content.split("\n") : [""];
    let cursorRow = 0;
    let cursorCol = 0;
    let isModified = false;
    let statusMessage = isReadOnly 
        ? `[ Read-Only / View Mode (${lines.length} lines) ]` 
        : (isNewFile ? "[ New File ]" : `[ Read ${lines.length} lines ]`);
    let cutBuffer = "";

    // Create nano UI overlay inside terminal container
    const nanoEl = document.createElement("div");
    nanoEl.id = "nano-editor";
    nanoEl.className = "nano-container";
    nanoEl.innerHTML = `
        <!-- Top Status Bar -->
        <div class="nano-header">
            <span class="nano-brand">foxOS nano v1.33.7</span>
            <span class="nano-filename">File: ${targetFile}</span>
            <span class="nano-modified" id="nano-mod-status">${isReadOnly ? "[ Read-Only ]" : (isModified ? "[ Modified ]" : "")}</span>
        </div>

        <!-- Main Editable Body -->
        <div class="nano-body" id="nano-lines-container" tabindex="0"></div>

        <!-- Status / Message Line -->
        <div class="nano-status-msg" id="nano-status-msg">${statusMessage}</div>

        <!-- Bottom Hotkey Legend -->
        <div class="nano-footer">
            <div class="nano-key-item"><span class="nano-key">^O</span> WriteOut</div>
            <div class="nano-key-item"><span class="nano-key">^R</span> Read File</div>
            <div class="nano-key-item"><span class="nano-key">^K</span> Cut Line</div>
            <div class="nano-key-item"><span class="nano-key">^X</span> Exit</div>
            <div class="nano-key-item"><span class="nano-key">^G</span> Get Help</div>
            <div class="nano-key-item"><span class="nano-key">^W</span> Where Is</div>
            <div class="nano-key-item"><span class="nano-key">^U</span> Paste Line</div>
            <div class="nano-key-item"><span class="nano-key">^C</span> Cur Pos</div>
        </div>
    `;

    terminal.appendChild(nanoEl);

    const bodyEl = nanoEl.querySelector("#nano-lines-container");
    const modEl = nanoEl.querySelector("#nano-mod-status");
    const statusMsgEl = nanoEl.querySelector("#nano-status-msg");

    function updateHeaderStatus() {
        modEl.textContent = isModified ? "[ Modified ]" : "";
    }

    function setStatus(msg) {
        statusMessage = msg;
        statusMsgEl.textContent = msg;
    }

    function renderBuffer() {
        bodyEl.innerHTML = "";
        lines.forEach((lineText, rIdx) => {
            const rowDiv = document.createElement("div");
            rowDiv.className = "nano-line";

            if (rIdx === cursorRow) {
                // Active line with cursor
                const left = lineText.slice(0, cursorCol);
                const charUnderCursor = lineText[cursorCol] || " ";
                const right = lineText.slice(cursorCol + 1);

                const leftSpan = document.createElement("span");
                leftSpan.textContent = left;

                const cursorSpan = document.createElement("span");
                cursorSpan.className = "nano-cursor";
                cursorSpan.textContent = charUnderCursor;

                const rightSpan = document.createElement("span");
                rightSpan.textContent = right;

                rowDiv.appendChild(leftSpan);
                rowDiv.appendChild(cursorSpan);
                rowDiv.appendChild(rightSpan);
            } else {
                rowDiv.textContent = lineText || " ";
            }
            bodyEl.appendChild(rowDiv);
        });

        // Auto-scroll cursor into view if text exceeds monitor rows
        const activeLineEl = bodyEl.children[cursorRow];
        if (activeLineEl) {
            activeLineEl.scrollIntoView({ block: "nearest" });
        }
    }

    renderBuffer();
    bodyEl.focus();

    // ─── Keyboard Event Interceptor ──────────────────────────────────────────
    return new Promise((resolve) => {
        const handleKeyDown = async (e) => {
            // Hotkeys with Control Key
            if (e.ctrlKey) {
                const key = e.key.toLowerCase();

                // ^O: WriteOut (Save to VFS)
                if (key === "o") {
                    e.preventDefault();
                    playDiskSeek(3);
                    const fullText = lines.join("\n");
                    const writeRes = writeFileContent(targetFile, fullText);
                    if (writeRes.success) {
                        isModified = false;
                        updateHeaderStatus();
                        setStatus(`[ Wrote ${lines.length} lines to ${targetFile} ]`);
                        playBell(1000, 0.05);
                    } else {
                        setStatus(`[ ERROR: ${writeRes.error} ]`);
                        playBell(400, 0.15);
                    }
                    return;
                }

                // ^X: Exit nano
                if (key === "x") {
                    e.preventDefault();
                    if (!isModified) {
                        playRelayThump();
                        cleanup();
                        resolve();
                        return;
                    }

                    // Authentic In-Terminal Nano Prompt (Y = Yes, N = No, ^C/ESC = Cancel)
                    setStatus("Save modified buffer? (Y=Yes, N=No, ^C=Cancel)");
                    playBell(800, 0.05);

                    const promptHandler = (pe) => {
                        pe.preventDefault();
                        pe.stopPropagation();
                        const pKey = pe.key.toLowerCase();

                        if (pKey === "y") {
                            window.removeEventListener("keydown", promptHandler, { capture: true });
                            playDiskSeek(2);
                            writeFileContent(targetFile, lines.join("\n"));
                            playRelayThump();
                            cleanup();
                            resolve();
                        } else if (pKey === "n") {
                            window.removeEventListener("keydown", promptHandler, { capture: true });
                            playRelayThump();
                            cleanup();
                            resolve();
                        } else if (pKey === "c" && pe.ctrlKey || pKey === "escape") {
                            window.removeEventListener("keydown", promptHandler, { capture: true });
                            setStatus("[ Cancelled ]");
                            playKeyClick("key");
                        }
                    };

                    window.addEventListener("keydown", promptHandler, { capture: true });
                    return;
                }

                // ^K: Cut Line
                if (key === "k") {
                    e.preventDefault();
                    playKeyClick("key");
                    cutBuffer = lines[cursorRow];
                    if (lines.length > 1) {
                        lines.splice(cursorRow, 1);
                        if (cursorRow >= lines.length) cursorRow = lines.length - 1;
                    } else {
                        lines[0] = "";
                    }
                    cursorCol = Math.min(cursorCol, lines[cursorRow].length);
                    isModified = true;
                    updateHeaderStatus();
                    setStatus(`[ Cut 1 line ]`);
                    renderBuffer();
                    return;
                }

                // ^U: Paste Line
                if (key === "u") {
                    e.preventDefault();
                    playKeyClick("key");
                    if (cutBuffer !== undefined) {
                        lines.splice(cursorRow + 1, 0, cutBuffer);
                        cursorRow++;
                        cursorCol = 0;
                        isModified = true;
                        updateHeaderStatus();
                        setStatus(`[ Pasted line ]`);
                        renderBuffer();
                    }
                    return;
                }

                // ^G: Help
                if (key === "g") {
                    e.preventDefault();
                    setStatus("foxOS nano Help: Use ^O to Write/Save, ^X to Exit, Arrow keys to navigate.");
                    return;
                }

                // ^C: Show cursor position
                if (key === "c") {
                    e.preventDefault();
                    setStatus(`line ${cursorRow + 1}/${lines.length} (${Math.round(((cursorRow+1)/lines.length)*100)}%), col ${cursorCol + 1}`);
                    return;
                }
                return;
            }

            // Normal Navigation & Editing Keys
            if (e.key === "ArrowUp") {
                e.preventDefault();
                playKeyClick("key");
                if (cursorRow > 0) {
                    cursorRow--;
                    cursorCol = Math.min(cursorCol, lines[cursorRow].length);
                    renderBuffer();
                }
                return;
            }

            if (e.key === "ArrowDown") {
                e.preventDefault();
                playKeyClick("key");
                if (cursorRow < lines.length - 1) {
                    cursorRow++;
                    cursorCol = Math.min(cursorCol, lines[cursorRow].length);
                    renderBuffer();
                }
                return;
            }

            if (e.key === "ArrowLeft") {
                e.preventDefault();
                playKeyClick("key");
                if (cursorCol > 0) {
                    cursorCol--;
                    renderBuffer();
                } else if (cursorRow > 0) {
                    cursorRow--;
                    cursorCol = lines[cursorRow].length;
                    renderBuffer();
                }
                return;
            }

            if (e.key === "ArrowRight") {
                e.preventDefault();
                playKeyClick("key");
                if (cursorCol < lines[cursorRow].length) {
                    cursorCol++;
                    renderBuffer();
                } else if (cursorRow < lines.length - 1) {
                    cursorRow++;
                    cursorCol = 0;
                    renderBuffer();
                }
                return;
            }

            if (e.key === "Home") {
                e.preventDefault();
                cursorCol = 0;
                renderBuffer();
                return;
            }

            if (e.key === "End") {
                e.preventDefault();
                cursorCol = lines[cursorRow].length;
                renderBuffer();
                return;
            }

            if (e.key === "Backspace") {
                e.preventDefault();
                playKeyClick("key");
                if (cursorCol > 0) {
                    const curLine = lines[cursorRow];
                    lines[cursorRow] = curLine.slice(0, cursorCol - 1) + curLine.slice(cursorCol);
                    cursorCol--;
                    isModified = true;
                    updateHeaderStatus();
                    renderBuffer();
                } else if (cursorRow > 0) {
                    // Merge with previous line
                    const prevLen = lines[cursorRow - 1].length;
                    lines[cursorRow - 1] += lines[cursorRow];
                    lines.splice(cursorRow, 1);
                    cursorRow--;
                    cursorCol = prevLen;
                    isModified = true;
                    updateHeaderStatus();
                    renderBuffer();
                }
                return;
            }

            if (e.key === "Delete") {
                e.preventDefault();
                playKeyClick("key");
                const curLine = lines[cursorRow];
                if (cursorCol < curLine.length) {
                    lines[cursorRow] = curLine.slice(0, cursorCol) + curLine.slice(cursorCol + 1);
                    isModified = true;
                    updateHeaderStatus();
                    renderBuffer();
                } else if (cursorRow < lines.length - 1) {
                    lines[cursorRow] += lines[cursorRow + 1];
                    lines.splice(cursorRow + 1, 1);
                    isModified = true;
                    updateHeaderStatus();
                    renderBuffer();
                }
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();
                playKeyClick("enter");
                const curLine = lines[cursorRow];
                const left = curLine.slice(0, cursorCol);
                const right = curLine.slice(cursorCol);

                lines[cursorRow] = left;
                lines.splice(cursorRow + 1, 0, right);
                cursorRow++;
                cursorCol = 0;
                isModified = true;
                updateHeaderStatus();
                renderBuffer();
                return;
            }

            // Printable Characters
            if (e.key.length === 1 && !e.altKey && !e.metaKey) {
                e.preventDefault();
                if (e.key === " ") {
                    playKeyClick("space");
                } else {
                    playKeyClick("key");
                }
                const curLine = lines[cursorRow];
                lines[cursorRow] = curLine.slice(0, cursorCol) + e.key + curLine.slice(cursorCol);
                cursorCol++;
                isModified = true;
                updateHeaderStatus();
                renderBuffer();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        function cleanup() {
            window.removeEventListener("keydown", handleKeyDown);
            nanoEl.remove();
            outputLines.style.display = "block";
            activePromptLine.style.display = "flex";
            ctx.print(`[nano] Closed buffer for ${targetFile}.`);
            ctx.setInputEnabled(true);
        }
    });
}
