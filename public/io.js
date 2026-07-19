/**
 * io.js — Input / Output & Command Parser (Streamlined)
 */

import pause from "./pause.js";
import { openWindow, setupFakeScrollbar, syncWindowBackground } from "./windows.js";
import { commands } from "./commands.js";

export { openWindow };

// ─── Command history ──────────────────────────────────────────────────────────

const prev = (() => {
    try {
        const storage = localStorage.getItem("commandHistory");
        return JSON.parse(storage) || [];
    } catch {
        return [];
    }
})();
let historyIndex = -1;
let tmp = "";

function addToHistory(cmd) {
    if (!cmd) return;
    prev.unshift(cmd);
    historyIndex = -1;
    tmp = "";
    try {
        localStorage.setItem("commandHistory", JSON.stringify(prev));
    } catch { /* storage quota exceeded */ }
}

// ─── Typed-block tracking ─────────────────────────────────────────────────────

const typedBlocks = [];

function getChar(char) {
    if (typeof char !== "string") return null;
    if (char === "\n") return document.createElement("br");

    const span = document.createElement("span");
    span.className = "char";
    span.dataset.char = char;
    if (char === " ") {
        span.innerHTML = "&nbsp;";
    } else {
        span.textContent = char;
    }
    return span;
}

function createTypedBlock(typer) {
    const block = { typer, lines: [] };
    typedBlocks.push(block);
    return block;
}

function createTypedLine(block) {
    const line = document.createElement("div");
    line.className = "typed-line";
    const lineState = { el: line, chars: [] };
    block.lines.push(lineState);
    block.typer.appendChild(line);
    return lineState;
}

function resolveBlock(blockRef = -1) {
    const idx = blockRef < 0 ? typedBlocks.length + blockRef : blockRef;
    return typedBlocks[idx] || null;
}

function resolveLine(block, lineRef = -1) {
    if (!block) return null;
    const idx = lineRef < 0 ? block.lines.length + lineRef : lineRef;
    return block.lines[idx] || null;
}

function appendCharToLine(lineState, char) {
    const node = getChar(char);
    if (!node) return null;
    lineState.el.appendChild(node);
    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains("char")) {
        lineState.chars.push(node);
    }
    return node;
}

function replaceCharInLine(lineState, index, char) {
    if (!lineState) return null;
    const i = index < 0 ? lineState.chars.length + index : index;
    const target = lineState.chars[i];
    if (!target) return null;
    const next = getChar(char);
    if (!next) return null;
    target.replaceWith(next);
    lineState.chars[i] = next;
    return next;
}

function normalizeWait(wait, payload) {
    return typeof wait === "function" ? wait(payload) : wait;
}

// ─── Core typing engine ───────────────────────────────────────────────────────

async function typeStringIntoBlock(text, block, options, container) {
    const { wait = 30, lineWait = 100, getSkip } = options;
    let lineState = createTypedLine(block);

    for (const char of text.split("")) {
        const skip = getSkip?.();
        if (char === "\n") {
            lineState.el.appendChild(document.createElement("br"));
            scroll(container);
            if (!skip && wait > 0) {
                const newlineDelay = normalizeWait(wait, { char, line: lineState, block });
                if (newlineDelay) await pause(newlineDelay / 1000);
                if (lineWait) await pause(lineWait / 1000);
            }
            lineState = createTypedLine(block);
            continue;
        }

        appendCharToLine(lineState, char);
        if (wait > 0 && !skip) {
            scroll(container);
            const charDelay = normalizeWait(wait, { char, line: lineState, block });
            if (charDelay) {
                // Add natural key press jitter (±20% variation)
                const jitter = Math.random() * 0.4 + 0.8;
                await pause((charDelay * jitter) / 1000);
            }
        }
    }

    scroll(container);
}

async function runTypeOps(ops, block, options, container) {
    const { getSkip } = options;
    for (const op of ops) {
        if (!op) continue;
        const skip = getSkip?.();

        if (typeof op === "string") {
            await typeStringIntoBlock(op, block, options, container);
            continue;
        }

        if (op.kind === "type") {
            await typeStringIntoBlock(op.text ?? "", block, {
                ...options,
                wait: op.wait ?? options.wait,
                lineWait: op.lineWait ?? options.lineWait,
            }, container);
            continue;
        }

        if (op.kind === "replace") {
            const targetBlock = resolveBlock(op.block ?? -1);
            const targetLine = resolveLine(targetBlock, op.line ?? -1);
            replaceCharInLine(targetLine, op.index ?? -1, op.char ?? " ");
            scroll(container);
            if (!skip) {
                const delay = normalizeWait(op.wait ?? options.wait ?? 0, { op, block: targetBlock, line: targetLine });
                if (delay) await pause(delay / 1000);
            }
            continue;
        }

        if (op.kind === "pause" && op.wait && !skip) {
            await pause(op.wait / 1000);
        }
    }
}

export async function alert(text, options = {}) {
    const frame = document.getElementById("alert-frame");
    const body = document.getElementById("ab");
    const { remove = false } = options;
    if (frame && frame.classList.contains("hidden")) {
        frame.classList.remove("hidden");
        syncWindowBackground(frame);
        body.innerHTML = text;
        if (remove) {
            await pause(2);
            frame.classList.add("hidden");
        }
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function type(text, options = {}, container = document.querySelector(".terminal")) {
    if (!text || !container) return;

    const {
        wait = 30,
        initialWait = 500,
        finalWait = 500,
        lineWait = 100,
        hideCursor = false,
    } = options;

    const typer = document.createElement("div");
    typer.className = `typer active${hideCursor ? " no-cursor" : ""}`;
    container.appendChild(typer);

    const block = createTypedBlock(typer);

    let skip = false;
    const skipHandler = () => {
        skip = true;
    };
    window.addEventListener("keydown", skipHandler);
    window.addEventListener("mousedown", skipHandler);

    const runOptions = {
        ...options,
        wait,
        lineWait,
        getSkip: () => skip
    };

    if (initialWait && !skip) await pause(initialWait / 1000);

    if (Array.isArray(text) && text.every(item => typeof item === "string")) {
        for (const t of text) {
            await typeStringIntoBlock(t, block, runOptions, container);
            if (lineWait && !skip) await pause(lineWait / 1000);
        }
    } else if (Array.isArray(text)) {
        await runTypeOps(text, block, runOptions, container);
    } else {
        await typeStringIntoBlock(text, block, runOptions, container);
    }

    if (finalWait && !skip) await pause(finalWait / 1000);
    typer.classList.remove("active", "no-cursor");

    window.removeEventListener("keydown", skipHandler);
    window.removeEventListener("mousedown", skipHandler);
}

export function isPrintable(keycode) {
    return (
        (keycode > 47 && keycode < 58) ||
        keycode === 32 ||
        (keycode > 64 && keycode < 91) ||
        (keycode > 95 && keycode < 112) ||
        (keycode > 185 && keycode < 193) ||
        (keycode > 218 && keycode < 223)
    );
}

export function moveCaretToEnd(el) {
    if (!window.getSelection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

let audioCtx;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    return audioCtx;
}

function beep(freq = 680, duration = 0.05, volume = 0.15) {
    try {
        const ctx = initAudio();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.value = volume;

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
    } catch { /* browser blocked audio or not supported */ }
}

export async function input(pw) {
    return new Promise((resolve) => {
        const terminal = document.querySelector(".terminal");
        if (!terminal) return resolve("");

        const inputEl = document.createElement("span");
        inputEl.id = "input";
        if (pw) {
            inputEl.classList.add("password");
            inputEl.style.webkitTextSecurity = "disc";
            inputEl.style.textSecurity = "disc";
        }
        inputEl.setAttribute("contenteditable", "true");
        inputEl.setAttribute("spellcheck", "false");

        const onKeyDown = (event) => {
            if (event.key === "Enter") {
                beep();
                event.preventDefault();
                inputEl.setAttribute("contenteditable", "false");
                inputEl.removeEventListener("keydown", onKeyDown);
                const result = cleanInput(inputEl.textContent);
                addToHistory(result);
                resolve(result);
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                if (historyIndex === -1) tmp = inputEl.textContent;
                historyIndex = Math.min(prev.length - 1, historyIndex + 1);
                if (historyIndex >= 0) {
                    inputEl.textContent = prev[historyIndex];
                    moveCaretToEnd(inputEl);
                }
            } else if (event.key === "ArrowDown") {
                event.preventDefault();
                historyIndex = Math.max(-1, historyIndex - 1);
                inputEl.textContent = historyIndex === -1 ? tmp : prev[historyIndex];
                moveCaretToEnd(inputEl);
            }
        };

        inputEl.addEventListener("keydown", onKeyDown);
        terminal.appendChild(inputEl);
        inputEl.focus();
    });
}

export async function parse(rawInput) {
    const cmd = cleanInput(rawInput);
    if (!cmd) return;

    if (!/^[\w\s-]+$/.test(cmd)) throw new Error("Invalid command.");

    // Filter naughty words first so they are correctly intercepted
    const naughty = ["fuck", "shit", "die", "ass", "cunt"];
    if (naughty.some(word => cmd.includes(word))) {
        throw new Error("Please don't use that language");
    }

    const parts = cmd.split(/\s+/);
    const cmdName = parts[0];
    const args = parts.slice(1);

    // Match full command string first for registry compatibility
    let entry = commands.get(cmd);
    if (!entry) {
        entry = commands.get(cmdName);
    }

    if (!entry) throw new Error(`Unknown command: ${cmd}`);

    if (entry.alias) {
        const aliasEntry = commands.get(entry.alias);
        if (!aliasEntry) throw new Error(`Unknown command: ${cmd}`);
        entry = aliasEntry;
    }

    const runtimeEntry = {
        ...entry,
        args,
        theme: entry.theme || args[0]
    };

    let module;
    try {
        module = await import(runtimeEntry.module);
    } catch (e) {
        console.error(e);
        throw new Error(e instanceof TypeError ? `Unknown command: ${cmd}` : "Error while executing command");
    }

    module.stylesheets?.forEach(name => {
        const dir = runtimeEntry.module.replace("/index.mjs", "");
        _addStylesheet(`${dir}/${name}.css`);
    });

    if (module.output) await type(module.output);
    await pause();
    await module.default?.(runtimeEntry);
}

export function cleanInput(input) {
    return input ? input.toLowerCase().trim() : "";
}

export function scroll(el = document.querySelector(".terminal")) {
    if (el) el.scrollTop = 10000000;
}

export async function prompt(text, pw = false) {
    await type(text);
    return input(pw);
}

export async function waitForKey() {
    return new Promise((resolve) => {
        const handle = () => {
            document.removeEventListener("keyup", handle);
            document.removeEventListener("click", handle);
            resolve();
        };
        document.addEventListener("keyup", handle);
        document.addEventListener("click", handle);
    });
}

function _addStylesheet(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = href;
    document.head.appendChild(link);
}

// ─── Recipe helpers ───────────────────────────────────────────────────────────

let _recipesSetupDone = false;

export async function loadRecipeList() {
    const win = document.getElementById("recipes");
    if (!win) return;

    if (win.classList.contains("loading-template")) {
        await new Promise(resolve => win.addEventListener("template-loaded", resolve, { once: true }));
    }

    const sidebar = win.querySelector("[data-sidebar-content]");
    const content = win.querySelector("[data-content]");
    if (!sidebar) return;

    if (!_recipesSetupDone) {
        _recipesSetupDone = true;
        sidebar.addEventListener("click", async (e) => {
            const link = e.target.closest("a[data-recipe]");
            if (!link) return;
            e.preventDefault();
            content.innerHTML = await fetch(link.dataset.recipe).then(r => r.text());
            win.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
        });
    }

    const files = await fetch("/recipes/index.json").then(r => r.json());
    sidebar.innerHTML = files
        .map(name => {
            const label = name
                .replace(".html", "")
                .replaceAll("-", " ")
                .replace(/\b\w/g, c => c.toUpperCase());
            return `<p><a href="#" data-recipe="/recipes/${name}">${label}</a></p>`;
        })
        .join("");
}

// ─── Blog helpers ─────────────────────────────────────────────────────────────

let _blogSetupDone = false;
let _blogLoaded = false;

export async function loadBlogPosts() {
    const win = document.getElementById("blog");
    if (!win) return;

    if (win.classList.contains("loading-template")) {
        await new Promise(resolve => win.addEventListener("template-loaded", resolve, { once: true }));
    }

    const sidebar = win.querySelector("[data-sidebar-content]");
    const content = win.querySelector("[data-content]");
    const viewport = win.querySelector(".content [data-viewport]");
    if (!sidebar || !content) return;

    if (!_blogSetupDone) {
        _blogSetupDone = true;
        sidebar.addEventListener("click", (e) => {
            const link = e.target.closest("a[data-anchor]");
            if (!link) return;
            e.preventDefault();
            const target = viewport?.querySelector(link.dataset.anchor);
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    if (_blogLoaded) return;
    _blogLoaded = true;

    const files = await fetch("/blog/index.json").then(r => r.json());

    // Fetch all post templates in parallel
    const postsHTML = await Promise.all(
        files.map(name => fetch(`/blog/${name}`).then(r => r.text()))
    );

    files.forEach((name, index) => {
        const html = postsHTML[index];
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        const firstId = tmp.querySelector("[id]")?.id ?? name.replace(".html", "");
        const label = name.replace(".html", "").replaceAll("-", ".");

        content.insertAdjacentHTML("beforeend", html);
        sidebar.insertAdjacentHTML(
            "beforeend",
            `<p><a href="#" data-anchor="#${firstId}">${label}</a></p>`
        );
    });

    win.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
}
