/**
 * io.js — Input / Output & Command Parser
 *
 * Responsible for:
 *   - Fetching and injecting window HTML templates into the DOM on load.
 *   - The typewriter effect used to print text to the terminal.
 *   - Reading keyboard input from the terminal's contenteditable span.
 *   - Command history (localStorage-backed).
 *   - Parsing and dispatching terminal commands to their command modules.
 *   - Recipe-specific helpers (content loader, recipe list).
 *
 * Imports FROM: windows.js (openWindow, setupFakeScrollbar)
 * Imported BY:  screen.js, command modules
 */

/* eslint "no-unused-expressions": "off" */
import pause from "./pause.js";
import { handleClick } from "./ui.mjs";
import { openWindow, setupFakeScrollbar } from "./windows.js";

// Re-export openWindow so command modules can continue to import it from io.js
// without needing to know about windows.js directly.
export { openWindow };

// ─── Page bootstrap ───────────────────────────────────────────────────────────

// Fetch and inject each window's HTML into the document body before any other
// module code runs. Using top-level await here keeps the load order predictable.
const _windowFiles = [
    "./commands/blog/blog.html",
    "./commands/recipes/recipes.html",
    "./commands/about/about.html",
    "./commands/links/links.html",
    "./commands/repair/repair.html"
];

for (const path of _windowFiles) {
    const html = await fetch(path).then(r => r.text());
    document.body.insertAdjacentHTML("beforeend", html);
}

// ─── Command history ──────────────────────────────────────────────────────────

/** Loads the command history array from localStorage, returning [] on failure. */
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

/** Prepends a command to the in-memory history list and persists it. */
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
 * A "typed block" represents one call to type().  It contains the container
 * div (.typer) and an array of line state objects, each of which tracks the
 * line's DOM element and every character span within it.  Keeping references
 * here allows later calls to replace individual characters in-place (used by
 * the "replace" / "replaceMany" operation kinds).
 *
 * Structure:
 * {
 *   typer: Element,
 *   lines: Array<{ el: Element, chars: Array<Element> }>
 * }
 */
const typedBlocks = [];

// ─── DOM character helpers ────────────────────────────────────────────────────

/**
 * Converts a raw character into the appropriate DOM node for terminal output:
 *   "\n"  → <br>
 *   "\t"  → <span class="char"> with three &nbsp;
 *   " "   → <span class="char"> with &nbsp;
 *   other → <span class="char"> with the literal character
 */
function getChar(char) {
    if (typeof char !== "string") return null;

    if (char === "\n") {
        return document.createElement("br");
    }

    const span = document.createElement("span");
    span.classList.add("char");
    span.dataset.char = char;

    if (char === "\t") {
        span.innerHTML = "&nbsp;&nbsp;&nbsp;";
    } else if (char === " ") {
        span.innerHTML = "&nbsp;";
    } else {
        span.textContent = char;
    }
    return span;
}

/** Creates a new typed block attached to the given typer element. */
function createTypedBlock(typer) {
    const block = { typer, lines: [] };
    typedBlocks.push(block);
    return block;
}

/** Appends a new blank line div to a typed block and returns its state object. */
function createTypedLine(block) {
    const line      = document.createElement("div");
    line.classList.add("typed-line");
    const lineState = { el: line, chars: [] };
    block.lines.push(lineState);
    block.typer.appendChild(line);
    return lineState;
}

/**
 * Resolves a block reference to a typed block.
 * Accepts a numeric index (negative = from end) or an already-resolved block.
 */
function resolveBlock(blockRef = -1) {
    if (typeof blockRef !== "number") return blockRef || null;
    const index = blockRef < 0 ? typedBlocks.length + blockRef : blockRef;
    return typedBlocks[index] || null;
}

/**
 * Resolves a line reference within a typed block.
 * Accepts a numeric index (negative = from end) or an already-resolved line.
 */
function resolveLine(block, lineRef = -1) {
    if (!block) return null;
    if (typeof lineRef !== "number") return lineRef || null;
    const index = lineRef < 0 ? block.lines.length + lineRef : lineRef;
    return block.lines[index] || null;
}

/**
 * Appends a character (or pre-built node) to a line and tracks it in chars[].
 *
 * @param {Object}  lineState    Line state object from createTypedLine.
 * @param {string|Node} char     Character string or pre-built DOM node.
 * @param {boolean} processChars Whether to run char through getChar().
 */
function appendCharToLine(lineState, char, processChars = true) {
    const node = processChars ? getChar(char) : char;
    if (!node) return null;

    lineState.el.appendChild(node);

    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains("char")) {
        lineState.chars.push(node);
    }
    return node;
}

/**
 * Replaces the character span at a given index within a line with a new one.
 * Used by the "replace" / "replaceMany" operation kinds in type().
 */
function replaceCharInLine(lineState, index, char) {
    if (!lineState) return null;
    const target = lineState.chars[index];
    if (!target) return null;

    const next = getChar(char);
    if (!next) return null;

    target.replaceWith(next);
    lineState.chars[index] = next;
    return next;
}

/**
 * Resolves a wait value: if it's a function, calls it with the payload and
 * returns the result; otherwise returns it as-is.
 */
function normalizeWait(wait, payload) {
    return typeof wait === "function" ? wait(payload) : wait;
}

// ─── Core typing engine ───────────────────────────────────────────────────────

/**
 * Types a plain string into a typed block one character at a time,
 * inserting the configured inter-character and inter-line delays.
 */
async function typeStringIntoBlock(text, block, options, container) {
    const {
        wait         = 30,
        lineWait     = 100,
        processChars = true
    } = options;

    let lineState = createTypedLine(block);
    const queue   = processChars ? text.split("") : text;

    for (const char of queue) {
        if (char === "\n") {
            lineState.el.appendChild(document.createElement("br"));
            scroll(container);
            const newlineDelay = normalizeWait(wait, { char, line: lineState, block });
            if (newlineDelay) await pause(newlineDelay / 1000);
            if (lineWait)     await pause(lineWait     / 1000);
            lineState = createTypedLine(block);
            continue;
        }

        appendCharToLine(lineState, char, processChars);
        scroll(container);

        const charDelay = normalizeWait(wait, { char, line: lineState, block });
        if (charDelay) await pause(charDelay / 1000);
    }
}

/**
 * Executes an array of typed operations (strings or operation objects) in
 * sequence. Used when type() receives an array rather than a plain string.
 *
 * Supported operation kinds:
 *   "type"        — type a string with optional per-op wait overrides
 *   "replace"     — replace a single char in an existing line
 *   "replaceMany" — replace multiple chars in an existing line
 *   "pause"       — wait without typing
 * 
 * For example 
 * 
 * await type([
 * {kind: "type", text: "I'm chargin' mah....},
 * {wait: 100, text:"lasor!"},
 * {kind: "replace", line: -1, index: 22, char: "z", wait 300},
 * ]);
 * This types the first line with default settings, waits 100ms, then finishes with "lasor!"
 * on the same line (use /n for new line), then replaces the 22nd character (the s in lasor)
 * with a z after 300ms
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
                wait:         op.wait         ?? options.wait,
                lineWait:     op.lineWait     ?? options.lineWait,
                processChars: op.processChars ?? options.processChars
            }, container);
            continue;
        }

        if (op.kind === "replace") {
            const targetBlock = resolveBlock(op.block ?? -1);
            const targetLine  = resolveLine(targetBlock, op.line ?? -1);
            replaceCharInLine(targetLine, op.index ?? 0, op.char ?? " ");
            scroll(container);
            const delay = normalizeWait(op.wait ?? options.wait ?? 0, { op, block: targetBlock, line: targetLine });
            if (delay) await pause(delay / 1000);
            continue;
        }

        if (op.kind === "replaceMany") {
            const targetBlock = resolveBlock(op.block ?? -1);
            const targetLine  = resolveLine(targetBlock, op.line ?? -1);
            for (const item of (op.chars ?? [])) {
                replaceCharInLine(targetLine, item.index ?? 0, item.char ?? " ");
                scroll(container);
                const delay = normalizeWait(item.wait ?? op.wait ?? options.wait ?? 0, { op: item, block: targetBlock, line: targetLine });
                if (delay) await pause(delay / 1000);
            }
            continue;
        }

        if (op.kind === "pause") {
            if (op.wait) await pause(op.wait / 1000);
        }
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Types the given text into a terminal container with a configurable
 * typewriter effect.
 *
 * @param {string|string[]|Object[]} text
 *   A plain string, an array of strings (typed sequentially), or an array of
 *   operation objects (see runTypeOps for the full op schema).
 *
 * @param {Object}  [options]
 * @param {number|Function} [options.wait=30]        Delay (ms) between characters.
 * @param {number}  [options.initialWait=1000]        Delay (ms) before starting.
 * @param {number}  [options.lineWait=100]            Extra delay (ms) between lines.
 * @param {number}  [options.finalWait=500]           Delay (ms) after finishing.
 * @param {string}  [options.typerClass=""]          Extra CSS class on the typer div.
 * @param {boolean} [options.useContainer=false]     Type directly into the container.
 * @param {boolean} [options.stopBlinking=true]      Remove the blinking cursor when done.
 * @param {boolean} [options.processChars=true]      Convert spaces/tabs/newlines to HTML.
 * @param {boolean} [options.clearContainer=false]   Clear the container first.
 * @param {boolean} [options.fox=false]              Hide cursor while the fox art prints.
 *
 * @param {Element} [container]  Target element; defaults to .terminal.
 */
export async function type(
    text,
    options  = {},
    container = document.querySelector(".terminal")
) {
    if (!text) return;

    const {
        wait           = 30,
        initialWait    = 1000,
        finalWait      = 500,
        lineWait       = 100,
        typerClass     = "",
        useContainer   = false,
        stopBlinking   = true,
        processChars   = true,
        clearContainer = false,
        fox            = false,
    } = options;

    // Create (or reuse) the typer wrapper div.
    const typer = useContainer ? container : document.createElement("div");
    typer.classList.add("typer", "active");
    if (fox)        typer.classList.add("no-cursor");
    if (typerClass) typer.classList.add(typerClass);

    if (clearContainer) {
        container.innerHTML = "&nbsp;";
        typedBlocks.length  = 0;
    }

    if (!useContainer) {
        container.appendChild(typer);
    }

    const block = createTypedBlock(typer);

    if (initialWait) await pause(initialWait / 1000);

    if (Array.isArray(text) && text.every(item => typeof item === "string")) {
        // Array of plain strings: type each in turn.
        for (const t of text) {
            await typeStringIntoBlock(t, block, { ...options, wait, lineWait, processChars }, container);
            if (lineWait) await pause(lineWait / 1000);
        }
    } else if (Array.isArray(text)) {
        // Array of operation objects.
        await runTypeOps(text, block, { ...options, wait, lineWait, processChars }, container);
    } else {
        // Plain string.
        await typeStringIntoBlock(text, block, { ...options, wait, lineWait, processChars }, container);
    }

    await pause(finalWait / 1000);

    if (stopBlinking) typer.classList.remove("active");
    if (fox)          typer.classList.remove("no-cursor");
}

/**
 * Returns true when the keyCode is a printable character (letter, digit,
 * punctuation, numpad, etc.) that should be echoed to the terminal input.
 */
export function isPrintable(keycode) {
    return (
        (keycode > 47 && keycode < 58)   ||   // 0-9
        keycode === 32                    ||   // space
        (keycode > 64 && keycode < 91)   ||   // A-Z
        (keycode > 95 && keycode < 112)  ||   // numpad 0-9
        (keycode > 185 && keycode < 193) ||   // punctuation
        (keycode > 218 && keycode < 223)       // punctuation
    );
}

/**
 * Moves the browser caret to the end of a contenteditable element so
 * programmatic text insertion always appends rather than replaces.
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
 * Handles:
 *   Enter     → submit
 *   Up/Down   → command history navigation
 *   Backspace → prevent empty-string deletion artefacts
 *   Printable → echo character and move caret
 *
 * @param {boolean} [pw=false]  If true, masks input with asterisks (password mode).
 * @returns {Promise<string>}
 */
export async function input(pw) {
    return new Promise((resolve) => {
        const onKeyDown = (event) => {

            if (event.keyCode === 13) {
                // Enter: submit the current input.
                event.preventDefault();
                event.target.setAttribute("contenteditable", false);
                const result = cleanInput(event.target.textContent);
                addToHistory(result);
                resolve(result);

            } else if (event.keyCode === 38) {
                // Up arrow: navigate backwards through history.
                if (historyIndex === -1) tmp = event.target.textContent;
                historyIndex = Math.min(prev.length - 1, historyIndex + 1);
                event.target.textContent = prev[historyIndex];
                if (pw) _maskInput(event.target);
                moveCaretToEnd(event.target);

            } else if (event.keyCode === 40) {
                // Down arrow: navigate forwards through history.
                historyIndex = Math.max(-1, historyIndex - 1);
                event.target.textContent = prev[historyIndex] || tmp;
                if (pw) _maskInput(event.target);
                moveCaretToEnd(event.target);

            } else if (event.keyCode === 8) {
                // Backspace: prevent leaving a stray empty node.
                if (event.target.textContent.length === 1) {
                    event.preventDefault();
                    event.target.innerHTML = "";
                }
                if (pw) requestAnimationFrame(() => _maskInput(event.target));

            } else if (isPrintable(event.keyCode) && !event.ctrlKey && !event.metaKey && !event.altKey) {
                // Printable character: echo it as a <span> and move caret.
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

/** Updates the data-pw mask attribute to match the current input length. */
function _maskInput(el) {
    el.setAttribute("data-pw", Array(el.textContent.length).fill("*").join(""));
}

/**
 * Processes a raw terminal command string:
 * 1. Validates and sanitises the input.
 * 2. Runs hardcoded special-case commands (e.g. atabook).
 * 3. Dynamically imports the matching command module from ./commands/<cmd>/index.mjs.
 * 4. Applies any stylesheets / templates declared by the module.
 * 5. Types the module's output string and runs its default export.
 *
 * Throws an Error with a user-readable message on invalid input or unknown commands.
 *
 * @param {string} rawInput
 */
export async function parse(rawInput) {
    const input = cleanInput(rawInput);
    if (!input) return;

    const matches = String(input).match(/^(\w+(?:(?:\s|-)\w+)*)$/);
    if (!matches) throw new Error("Invalid command");

    const command = matches[1];

    // Filter obviously naughty words before attempting any import.
    const naughty = ["fuck", "shit", "die", "ass", "cunt"];
    if (naughty.some(word => command.includes(word))) {
        throw new Error("Please don't use that language");
    }

    // Hardcoded redirect commands that don't need a full module.
    const pissy = ["atabook", "guestbook"];
    if (pissy.some(word => command.includes(word))) {
        await type("Signed in blood...");
        await pause(1);
        window.open("https://cybervixen.atabook.org/", "_blank");
        return;
    }


    let module;
    try {
        module = await import(`./commands/${command}/index.mjs`);
    } catch (e) {
        console.error(e);
        e.message = e instanceof TypeError
            ? `Unknown command: ${command}`
            : "Error while executing command";
        throw e;
    }

    // Load any CSS the command declares.
    module.stylesheets?.forEach(name => _addStylesheet(`commands/${command}/${name}.css`));

    // Load any HTML template files the command declares.
    for (const name of (module.templates ?? [])) {
        await loadTemplates(`commands/${command}/${name}.html`);
    }

    await type(module.output);
    await pause();
    await module.default?.(matches[2]);
}

/**
 * Lowercases and trims a raw input string.
 * Used both by parse() and by the input() keydown handler.
 */
export function cleanInput(input) {
    return input.toLowerCase().trim();
}

/**
 * Scrolls an element to its bottom edge.
 * Defaults to the .terminal element so it keeps pace with new output.
 *
 * @param {Element} [el]
 */
export function scroll(el = document.querySelector(".terminal")) {
    el.scrollTop = el.scrollHeight;
}

/**
 * Types a prompt string then immediately awaits user input.
 * Convenience wrapper around type() + input().
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
 * Used to pause boot sequences until the user is ready.
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

/** Injects a <link rel="stylesheet"> into <head> for dynamically loaded command CSS. */
function _addStylesheet(href) {
    const link  = document.createElement("link");
    link.rel    = "stylesheet";
    link.type   = "text/css";
    link.href   = href;
    document.head.appendChild(link);
}

// ─── Recipe helpers ───────────────────────────────────────────────────────────

// Wire up the sidebar click-to-load behaviour for the recipes window.
// This runs once on module load, after the HTML has been injected above.
_setupRecipeContentLoader();

/** Reference kept for loadRecipeList() which populates the sidebar. */
const _recipesSidebar = document.getElementById("recipes")
    ?.querySelector("[data-sidebar-content]");

/**
 * Attaches a click listener to the recipe sidebar that fetches and displays
 * the selected recipe's HTML in the content pane, then re-initialises the
 * fake scrollbar for the updated content.
 */
function _setupRecipeContentLoader() {
    const win     = document.getElementById("recipes");
    if (!win) return;

    const content = win.querySelector("[data-content]");
    const sidebar = win.querySelector("[data-sidebar-content]");

    sidebar?.addEventListener("click", async (e) => {
        const link = e.target.closest("a[data-recipe]");
        if (!link) return;
        e.preventDefault();

        content.innerHTML = await fetch(link.dataset.recipe).then(r => r.text());

        // Re-initialise scrollbars after the content pane is repopulated.
        win.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
    });
}

/**
 * Fetches the recipe index JSON and builds the sidebar link list.
 * Called by commands/recipes/index.mjs each time the recipes window is opened.
 */
export async function loadRecipeList() {
    if (!_recipesSidebar) return;

    const files = await fetch("/recipes/index.json").then(r => r.json());

    _recipesSidebar.innerHTML = files
        .map(name => {
            const label = name
                .replace(".html", "")
                .replaceAll("-", " ")
                .replace(/\b\w/g, c => c.toUpperCase());
            return `<p><a href="#" data-recipe="/recipes/${name}">${label}</a></p>`;
        })
        .join("");
}

// ─── Template helpers (used by screen.js) ────────────────────────────────────

/**
 * Fetches an HTML file, extracts all <template> elements from it, and appends
 * them to <head> so they can be cloned later with addTemplate().
 *
 * @param {string} path  URL of the HTML file to fetch.
 */
export async function loadTemplates(path) {
    const txt       = await fetch(path).then(r => r.text());
    const parsed    = new DOMParser().parseFromString(txt, "text/html");
    parsed.querySelectorAll("template").forEach(t => document.head.appendChild(t));
}
