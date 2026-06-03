/**
 * io.js — Input / Output & Command Parser
 *
 * Responsible for:
 *   - The typewriter effect used to print text to the terminal.
 *   - Reading keyboard input from the terminal's contenteditable span.
 *   - Command history (localStorage-backed).
 *   - Parsing and dispatching terminal commands via commands.js registry.
 *
 * Imports FROM: windows.js, commands.js
 * Imported BY:  screen.js, command modules
 *
 * Dependency chain (no cycles):
 *   windows.js  ←  io.js  ←  screen.js  ←  command modules
 */

import pause from "./pause.js";
import { handleClick } from "./ui.mjs";
import { openWindow, setupFakeScrollbar } from "./windows.js";
import { commands } from "./commands.js";

export { openWindow };

// ─── Command history ──────────────────────────────────────────────────────────

function getHistory() {
    const storage = localStorage.getItem("commandHistory");
    if (!storage) return [];
    try {
        const json = JSON.parse(storage);
        return Array.isArray(json) ? json : [];
    } catch {
        return [];
    }
}

function addToHistory(cmd) {
    prev         = [cmd, ...prev];
    historyIndex = -1;
    tmp          = "";
    try {
        localStorage.setItem("commandHistory", JSON.stringify(prev));
    } catch { /* storage quota — silently ignore */ }
}

let prev         = getHistory();
let historyIndex = -1;
let tmp          = "";

// ─── Typed-block tracking ─────────────────────────────────────────────────────

/**
 * A "typed block" represents one call to type(). It contains the container
 * div (.typer) and an array of line state objects, each tracking the line's
 * DOM element and every character span within it. Keeping references here
 * allows later calls to replace individual characters in-place.
 *
 * Structure: { typer: Element, lines: Array<{ el: Element, chars: Array<Element> }> }
 */
const typedBlocks = [];

// ─── DOM character helpers ────────────────────────────────────────────────────

/**
 * Converts a raw character into the appropriate DOM node:
 *   "\n" → <br>
 *   " "  → <span class="char"> with &nbsp;
 *   other → <span class="char"> with the literal character
 */
function getChar(char) {
    if (typeof char !== "string") return null;

    if (char === "\n") return document.createElement("br");

    const span = document.createElement("span");
    span.classList.add("char");
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
    const line      = document.createElement("div");
    line.classList.add("typed-line");
    const lineState = { el: line, chars: [] };
    block.lines.push(lineState);
    block.typer.appendChild(line);
    return lineState;
}

function resolveBlock(blockRef = -1) {
    if (typeof blockRef !== "number") return blockRef || null;
    const index = blockRef < 0 ? typedBlocks.length + blockRef : blockRef;
    return typedBlocks[index] || null;
}

function resolveLine(block, lineRef = -1) {
    if (!block) return null;
    if (typeof lineRef !== "number") return lineRef || null;
    const index = lineRef < 0 ? block.lines.length + lineRef : lineRef;
    return block.lines[index] || null;
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

/**
 * Replaces the character span at a given index within a line.
 * Supports negative indices: -1 = last char, -2 = second to last, etc.
 */
function replaceCharInLine(lineState, index, char) {
    if (!lineState) return null;
    const i      = index < 0 ? lineState.chars.length + index : index;
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
    const { wait = 30, lineWait = 100 } = options;

    let lineState = createTypedLine(block);

    for (const char of text.split("")) {
        if (char === "\n") {
            lineState.el.appendChild(document.createElement("br"));
            scroll(container);
            const newlineDelay = normalizeWait(wait, { char, line: lineState, block });
            if (newlineDelay) await pause(newlineDelay / 1000);
            if (lineWait)     await pause(lineWait     / 1000);
            lineState = createTypedLine(block);
            continue;
        }

        appendCharToLine(lineState, char);
        scroll(container);

        const charDelay = normalizeWait(wait, { char, line: lineState, block });
        if (charDelay) await pause(charDelay / 1000);
    }
}

/**
 * Executes an array of typed operations in sequence.
 *
 * Supported operation kinds:
 *   "type"    — type a string with optional per-op wait overrides
 *   "replace" — replace a single char in an existing line (supports negative index)
 *   "pause"   — wait without typing
 *
 * Example:
 *   await type([
 *     { kind: "type",    text: "Rebooting in.....3" },
 *     { kind: "replace", index: -1, char: "2", wait: 1000 },
 *     { kind: "replace", index: -1, char: "1", wait: 1000 },
 *     { kind: "replace", index: -1, char: "0", wait: 1000 },
 *   ]);
 */
async function runTypeOps(ops, block, options, container) {
    for (const op of ops) {
        if (!op) continue;

        if (typeof op === "string") {
            await typeStringIntoBlock(op, block, options, container);
            continue;
        }

        if (op.kind === "type") {
            await typeStringIntoBlock(op.text ?? "", block, {
                ...options,
                wait:     op.wait     ?? options.wait,
                lineWait: op.lineWait ?? options.lineWait,
            }, container);
            continue;
        }

        if (op.kind === "replace") {
            const targetBlock = resolveBlock(op.block ?? -1);
            const targetLine  = resolveLine(targetBlock, op.line ?? -1);
            replaceCharInLine(targetLine, op.index ?? -1, op.char ?? " ");
            scroll(container);
            const delay = normalizeWait(op.wait ?? options.wait ?? 0, { op, block: targetBlock, line: targetLine });
            if (delay) await pause(delay / 1000);
            continue;
        }

        if (op.kind === "pause") {
            if (op.wait) await pause(op.wait / 1000);
        }
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Types the given text into a terminal container with a typewriter effect.
 *
 * @param {string|string[]|Object[]} text
 *   A plain string, array of strings, or array of operation objects.
 *
 * @param {Object}  [options]
 * @param {number|Function} [options.wait=30]         Delay (ms) between characters.
 * @param {number}  [options.initialWait=1000]         Delay (ms) before starting.
 * @param {number}  [options.lineWait=100]             Extra delay (ms) after each newline.
 * @param {number}  [options.finalWait=500]            Delay (ms) after finishing.
 * @param {boolean} [options.hideCursor=false]         Hide the blinking cursor while typing.
 *
 * @param {Element} [container]  Target element; defaults to .terminal.
 */
export async function type(
    text,
    options   = {},
    container = document.querySelector(".terminal")
) {
    if (!text) return;

    const {
        wait        = 30,
        initialWait = 1000,
        finalWait   = 500,
        lineWait    = 100,
        hideCursor  = false,
    } = options;

    const typer = document.createElement("div");
    typer.classList.add("typer", "active");
    if (hideCursor) typer.classList.add("no-cursor");

    container.appendChild(typer);

    const block = createTypedBlock(typer);

    if (initialWait) await pause(initialWait / 1000);

    if (Array.isArray(text) && text.every(item => typeof item === "string")) {
        for (const t of text) {
            await typeStringIntoBlock(t, block, { ...options, wait, lineWait }, container);
            if (lineWait) await pause(lineWait / 1000);
        }
    } else if (Array.isArray(text)) {
        await runTypeOps(text, block, { ...options, wait, lineWait }, container);
    } else {
        await typeStringIntoBlock(text, block, { ...options, wait, lineWait }, container);
    }

    await pause(finalWait / 1000);

    typer.classList.remove("active");
    if (hideCursor) typer.classList.remove("no-cursor");
}

/**
 * Returns true when the keyCode is a printable character.
 */
export function isPrintable(keycode) {
    return (
        (keycode > 47 && keycode < 58)   ||
        keycode === 32                    ||
        (keycode > 64 && keycode < 91)   ||
        (keycode > 95 && keycode < 112)  ||
        (keycode > 185 && keycode < 193) ||
        (keycode > 218 && keycode < 223)
    );
}

/**
 * Moves the browser caret to the end of a contenteditable element.
 */
export function moveCaretToEnd(el) {
    if (!document.createRange) return;
    const range     = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

/**
 * Renders a live terminal input span and resolves the returned Promise with
 * the typed text when the user presses Enter.
 *
 * @param {boolean} [pw=false]  If true, masks input as a password.
 * @returns {Promise<string>}
 */
export async function input(pw) {
    return new Promise((resolve) => {
        const onKeyDown = (event) => {
            if (event.keyCode === 13) {
                event.preventDefault();
                event.target.setAttribute("contenteditable", false);
                const result = cleanInput(event.target.textContent);
                addToHistory(result);
                resolve(result);

            } else if (event.keyCode === 38) {
                if (historyIndex === -1) tmp = event.target.textContent;
                historyIndex = Math.min(prev.length - 1, historyIndex + 1);
                event.target.textContent = prev[historyIndex];
                if (pw) _maskInput(event.target);
                moveCaretToEnd(event.target);

            } else if (event.keyCode === 40) {
                historyIndex = Math.max(-1, historyIndex - 1);
                event.target.textContent = prev[historyIndex] || tmp;
                if (pw) _maskInput(event.target);
                moveCaretToEnd(event.target);

            } else if (event.keyCode === 8) {
                if (event.target.textContent.length === 1) {
                    event.preventDefault();
                    event.target.innerHTML = "";
                }
                if (pw) requestAnimationFrame(() => _maskInput(event.target));

            } else if (isPrintable(event.keyCode) && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                const keyCode = event.keyCode;
                const chrCode = keyCode - 48 * Math.floor(keyCode / 48);
                const chr     = String.fromCharCode(96 <= keyCode ? chrCode : keyCode);
                const span    = document.createElement("span");
                span.classList.add("char");
                span.textContent = chr;
                event.target.appendChild(span);
                if (pw) _maskInput(event.target);
                moveCaretToEnd(event.target);
            }
        };

        const terminal = document.querySelector(".terminal");
        const inputEl  = document.createElement("span");
        inputEl.setAttribute("id", "input");
        if (pw) inputEl.classList.add("password");
        inputEl.setAttribute("contenteditable", true);
        inputEl.addEventListener("keydown", onKeyDown);
        terminal.appendChild(inputEl);
        inputEl.focus();
    });
}

function _maskInput(el) {
    el.setAttribute("data-pw", Array(el.textContent.length).fill("*").join(""));
}

/**
 * Looks up a raw command string in the commands registry and dispatches it.
 * Resolves aliases, loads the module, runs its default export.
 *
 * @param {string} rawInput
 */
export async function parse(rawInput) {
    const cmd = cleanInput(rawInput);
    if (!cmd) return;

    // Validate: only word characters, spaces, hyphens
    if (!/^[\w\s-]+$/.test(cmd)) throw new Error("Invalid command");

    // Look up in registry, following one level of alias
    let entry = commands.get(cmd);
    if (!entry) throw new Error(`Unknown command: ${cmd}`);
    if (entry.alias) {
        entry = commands.get(entry.alias);
        if (!entry) throw new Error(`Unknown command: ${cmd}`);
    }

    // Naughty word filter
    const naughty = ["fuck", "shit", "die", "ass", "cunt"];
    if (naughty.some(word => cmd.includes(word))) {
        throw new Error("Please don't use that language");
    }

    // Load the module
    let module;
    try {
        module = await import(entry.module);
    } catch (e) {
        console.error(e);
        e.message = e instanceof TypeError
            ? `Unknown command: ${cmd}`
            : "Error while executing command";
        throw e;
    }

    // Load any CSS the module declares
    module.stylesheets?.forEach(name => {
        const dir = entry.module.replace("/index.mjs", "");
        _addStylesheet(`${dir}/${name}.css`);
    });

    await type(module.output);
    await pause();
    await module.default?.();
}

export function cleanInput(input) {
    return input.toLowerCase().trim();
}

export function scroll(el = document.querySelector(".terminal")) {
    el.scrollTop = el.scrollHeight;
}

/**
 * Types a prompt string then immediately awaits user input.
 *
 * @param {string}  text
 * @param {boolean} [pw=false]
 * @returns {Promise<string>}
 */
export async function prompt(text, pw = false) {
    await type(text);
    return input(pw);
}

/**
 * Resolves when the user next presses any key or clicks anywhere.
 *
 * @returns {Promise<void>}
 */
export async function waitForKey() {
    return new Promise((resolve) => {
        const handle = () => {
            document.removeEventListener("keyup",  handle);
            document.removeEventListener("click",  handle);
            resolve();
        };
        document.addEventListener("keyup",  handle);
        document.addEventListener("click",  handle);
    });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _addStylesheet(href) {
    if (document.querySelector(`link[href="${href}"]`)) return; // already loaded
    const link  = document.createElement("link");
    link.rel    = "stylesheet";
    link.type   = "text/css";
    link.href   = href;
    document.head.appendChild(link);
}

// ─── Recipe helpers ───────────────────────────────────────────────────────────

let _recipesSetupDone = false;

/**
 * Fetches recipes/index.json and populates the sidebar with links.
 * The sidebar click handler is also attached here on first call.
 * Safe to call multiple times — setup only runs once.
 */
export async function loadRecipeList() {
    const win = document.getElementById("recipes");
    if (!win) return;

    const sidebar = win.querySelector("[data-sidebar-content]");
    const content = win.querySelector("[data-content]");
    if (!sidebar) return;

    // Wire the sidebar click listener once
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
let _blogLoaded    = false;

/**
 * Fetches blog/index.json, loads each post file in order, appends them
 * into the single scrolling content pane, and populates the sidebar
 * with anchor links that scroll to each post.
 *
 * The sidebar click listener is also attached here on first call.
 * Safe to call multiple times — posts are only loaded once.
 */
export async function loadBlogPosts() {
    const win = document.getElementById("blog");
    if (!win) return;

    const sidebar  = win.querySelector("[data-sidebar-content]");
    const content  = win.querySelector("[data-content]");
    const viewport = win.querySelector(".content [data-viewport]");
    if (!sidebar || !content) return;

    // Wire the sidebar click listener once
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

    // Posts are only fetched and appended once
    if (_blogLoaded) return;
    _blogLoaded = true;

    const files = await fetch("/blog/index.json").then(r => r.json());

    for (const name of files) {
        const html = await fetch(`/blog/${name}`).then(r => r.text());

        // Parse the fragment to find the first element with an id — used as scroll target
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        const firstId = tmp.querySelector("[id]")?.id ?? name.replace(".html", "");

        // Derive a human-readable label from the filename (e.g. "6-01-26" → "6.01.26")
        const label = name.replace(".html", "").replaceAll("-", ".");

        content.insertAdjacentHTML("beforeend", html);
        sidebar.insertAdjacentHTML(
            "beforeend",
            `<p><a href="#" data-anchor="#${firstId}">${label}</a></p>`
        );
    }

    // Refresh fake scrollbars now that content has been injected
    win.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
}
