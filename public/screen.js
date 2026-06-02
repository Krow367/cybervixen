/**
 * screen.js — Terminal Display & Boot Sequence
 *
 * Responsible for:
 *   - The power-on / boot animation sequence.
 *   - The main terminal read-eval-print loop (REPL).
 *   - Helper functions that create and manipulate DOM elements inside the
 *     terminal or CRT area (getScreen, el, div, clear, etc.).
 *   - Routing keyboard focus between the main terminal input and any window
 *     that wants to capture typing, via the focus-change bridge in windows.js.
 *   - Initialising the window manager and global focus behaviour on page load.
 *
 * Imports FROM: io.js (type, input, parse, prompt), windows.js (everything WM)
 * Imported BY:  command modules that need clear(), getScreen(), etc.
 *
 * Dependency chain (no cycles):
 *   windows.js  ←  io.js  ←  screen.js  ←  command modules
 */

import { parse, type, prompt, input } from "./io.js";
import pause from "./pause.js";
import {
    openWindow,
    closeWindow,
    minimizeWindow,
    setupWindow,
    setupAllWindows,
    setupGlobalFocusBehavior,
    setOnFocusChange,
    isWindowVisible,
    isWindowMinimized,
} from "./windows.js";

//I need to be able to skip some animations and other time savers.
//This should be called any time I need to skip some bullshit like
//the boot animation or not shuffling the puzzle game 300 times
globalThis.DEBUG =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "::1";

// Re-export window management functions so command modules that currently
// import from screen.js continue to work without changes.
export { openWindow, closeWindow, minimizeWindow, setupWindow };

// ─── Selectors ────────────────────────────────────────────────────────────────

const DEFAULT_TERMINAL_SELECTOR = ".terminal";

// ─── Focus / typing-host state ────────────────────────────────────────────────

/**
 * The element that currently "owns" typed input.  When null, input goes to the
 * main terminal's contenteditable span.  When set, the io.js input() function
 * should route text here instead.
 *
 * Updated exclusively via the focus-change callback registered with windows.js.
 */
let activeTypingHost = null;

/**
 * Called by windows.js whenever the window manager decides where keyboard
 * input should go.  Receives the target element (or null for the main
 * terminal) and updates local state + the actual browser focus.
 */
setOnFocusChange((host) => {
    activeTypingHost = host;

    if (host) {
        // A window has claimed typing — focus its container.
        getLiveInput()?.focus();
    } else {
        // No window is claiming typing — return focus to the terminal input.
        focusTerminalInput();
    }
});

// ─── Terminal helpers ─────────────────────────────────────────────────────────

/** Returns the main .terminal element. */
function getTerminal() {
    return document.querySelector(DEFAULT_TERMINAL_SELECTOR);
}

/**
 * Returns the currently active contenteditable input span, if one exists.
 * There is at most one at any given time (created by io.js's input()).
 */
function getLiveInput() {
    return document.querySelector('[contenteditable="true"]');
}

/** Moves browser focus back to the terminal's live input span. */
function focusTerminalInput() {
    getLiveInput()?.focus();
    activeTypingHost = null;
}

// ─── Public typing-host API ───────────────────────────────────────────────────

/**
 * Returns the element that should currently receive typed output.
 * Falls back to the main terminal when no window has claimed focus.
 *
 * @returns {Element}
 */
export function getTypingHost() {
    return activeTypingHost || getTerminal();
}

/**
 * Types text into whichever host is currently active (a window's content
 * area, or the main terminal if no window is focused).
 *
 * @param {string|Array} text
 * @param {Object}       [options]  Passed through to io.js type().
 */
export async function typeInActiveHost(text, options = {}) {
    return type(text, options, getTypingHost());
}

// ─── Power-on and boot sequence ───────────────────────────────────────────────

/**
 * Entry point called once on page load.  Waits half a second then triggers
 * the monitor power-on CSS animation before handing off to boot().
 */
async function on() {
    await power();
    boot();
}

/**
 * Toggles the monitor turn-on animation by adding CSS classes to #monitor.
 * The "turn-on" class drives a CSS @keyframes flicker; "on" removes the
 * darkened pre-power state.
 */
async function power() {
    await pause(0.5);
    document.getElementById("monitor").classList.toggle("turn-on");
    document.getElementById("monitor").classList.toggle("on");
}

/**
 * Runs the full boot sequence:
 *   1. Clears the terminal.
 *   2. On non-localhost origins, types the startup banner and fox ASCII art.
 *   3. Always types the "Try HELP" hint.
 *   4. Hands off to main() (the REPL).
 *
 * The Debug flag suppresses the slow animated intro on localhost so you
 * don't have to wait through it during development.
 */
export async function boot() {
    clear();
    if (globalThis.DEBUG) {
        await type("DEBUG MODE IS ACTIVE! IF YOU SEE THIS, INFORM CYBERKITTEN.\nDEBUG MODE MAY HARM YOUR EXPERIENCE AS MANY PUZZLES\nWILL BE MUCH EASIER TO SOLVE THAN INTENDED!", { wait: 0 })
    }
    if (!globalThis.DEBUG) {
        await type(`Serenity Industries(TM) CV-2077 terminal interface`, { initialWait: 2000 });
        await type(`Loading.....`, { initialWait: 500 });
    }

    if (!globalThis.DEBUG) {
        await type(`


⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣾⠙⠻⢶⣄⡀⠀⠀⠀⢀⣤⠶⠛⠛⡇⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣇⠀⠀⣙⣿⣦⣤⣴⣿⣁⠀⠀⣸⠇⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⣡⣾⣿⣿⣿⣿⣿⣿⣿⣷⣌⠋⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣴⣿⣷⣄⡈⢻⣿⡟⢁⣠⣾⣿⣦⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢹⣿⣿⣿⣿⠘⣿⠃⣿⣿⣿⣿⡏⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠀⠈⠛⣰⠿⣆⠛⠁⠀⡀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣼⣿⣦⠀⠘⠛⠋⠀⣴⣿⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⣤⣶⣾⣿⣿⣿⣿⡇⠀⠀⠀⢸⣿⣏⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⣠⣶⣿⣿⣿⣿⣿⣿⣿⣿⠿⠿⠀⠀⠀⠾⢿⣿⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⣠⣿⣿⣿⣿⣿⣿⡿⠟⠋⣁⣠⣤⣤⡶⠶⠶⣤⣄⠈⠀⠀⠀⠀⠀⠀
⠀⠀⠀⢰⣿⣿⣮⣉⣉⣉⣤⣴⣶⣿⣿⣋⡥⠄⠀⠀⠀⠀⠉⢻⣄⠀⠀⠀⠀⠀
⠀⠀⠀⠸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣟⣋⣁⣤⣀⣀⣤⣤⣤⣤⣄⣿⡄⠀⠀⠀⠀
⠀⠀⠀⠀⠙⠿⣿⣿⣿⣿⣿⣿⣿⡿⠿⠛⠋⠉⠁⠀⠀⠀⠀⠈⠛⠃⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`, {
            initialWait: 0,
            wait: 5,
            fox: true,
        });

        await type(`Welcome to FoxOS ver. 1.33.7`, { initialWait: 100 });
        await type(`"Harmony engineered."`, { initialWait: 100 });
        await type(`Try 'HELP' for commands.`, { initialWait: 100 });
    }

    focusTerminalInput();
    return main();
}

// ─── Main REPL ────────────────────────────────────────────────────────────────

/**
 * The main terminal read-eval-print loop.  Awaits user input, passes it to
 * parse(), catches any thrown errors and types them as terminal output, then
 * recurses to await the next command.
 *
 * Tail-recursive style: each call resolves immediately after spawning the
 * next call, so the call stack does not grow indefinitely.
 */
export async function main() {
    const command = await input();
    try {
        await parse(command);
    } catch (e) {
        if (e.message) await type(e.message);
    }
    main();
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Adds one or more CSS classes to an element, filtering out falsy values.
 *
 * @param {Element}    el   Target element.
 * @param {...string}  cls  Class names to add.
 */
export function addClasses(el, ...cls) {
    el.classList.add(...[...cls].filter(Boolean));
}

/**
 * Creates a full-screen div, adds "fullscreen" plus any extra classes, appends
 * it to #crt, and returns it.  Used by commands that want to take over the
 * entire CRT display area.
 *
 * @param {...string} cls  Additional CSS classes.
 * @returns {Element}
 */
export function getScreen(...cls) {
    const div = document.createElement("div");
    addClasses(div, "fullscreen", ...cls);
    document.querySelector("#crt").appendChild(div);
    return div;
}

/**
 * Toggles the "fullscreen" class on <body>.  Commands that need to hide the
 * terminal chrome (title bars, border, etc.) toggle this on entry and off on exit.
 *
 * @param {boolean} isFullscreen
 */
export function toggleFullscreen(isFullscreen) {
    document.body.classList.toggle("fullscreen", isFullscreen);
}

/**
 * Clones a <template> by id and appends its content to a container.
 * If the template has data-type set, the content is typed character-by-character
 * via type(); otherwise it is inserted directly.
 *
 * @param {string}  id         Template element id.
 * @param {Element} container  Target element.
 * @param {Object}  [options]  Passed through to type().
 * @returns {NodeList}  The appended child nodes.
 */
export async function addTemplate(id, container, options = {}) {
    const template = document.querySelector(`template#${id}`);
    if (!template) throw new Error("Template not found");

    const clone = document.importNode(template.content, true);

    if (template.dataset.type) {
        await type(clone.textContent, options, container);
    } else {
        container.appendChild(clone);
    }

    return container.childNodes;
}

/**
 * Creates a full-screen div (via getScreen) and immediately loads the named
 * template into it.  Convenience wrapper for commands that show a single
 * full-screen template.
 *
 * @param {string} id  Template id.
 * @returns {Element}  The created screen div.
 */
export async function showTemplateScreen(id) {
    const screen = getScreen(id);
    await addTemplate(id, screen);
    return screen;
}

/**
 * Creates a DOM element of the given type, adds optional classes, appends it
 * to a container, and sets any provided attributes.
 *
 * @param {string}  type       Tag name (e.g. "div", "span").
 * @param {Element} [container=.terminal]  Parent element.
 * @param {string}  [cls=""]   Space-separated class names.
 * @param {Object}  [attrs]    Attribute key/value pairs to set.
 * @returns {Element}
 */
export function el(
    type,
    container = document.querySelector(".terminal"),
    cls = "",
    attrs
) {
    const element = document.createElement(type);
    addClasses(element, cls);
    container.appendChild(element);

    if (attrs) {
        Object.entries(attrs).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
    }
    return element;
}

/** Shorthand for el("div", ...). */
export function div(...args) {
    return el("div", ...args);
}

/**
 * Clears all content from a terminal or screen element.
 *
 * @param {Element} [screen=.terminal]
 */
export function clear(screen = document.querySelector(".terminal")) {
    screen.innerHTML = "";
}

// ─── Initialisation ───────────────────────────────────────────────────────────

/**
 * Sets up the window manager and global focus/keyboard behaviour, then starts
 * the boot sequence.  Called once when the DOM is ready.
 */
function init() {
    // Set up drag, resize, and button listeners on all .window elements, and
    // pre-sync backgrounds for the four known content windows.
    setupAllWindows(["blog", "recipes", "about", "links"]);

    // Wire up the CRT click handler (click outside → restore terminal focus)
    // and the Escape key handler (Escape → close active window).
    setupGlobalFocusBehavior();

    // Start the power-on animation and boot sequence.
    on();
}

if (document.readyState === "complete") {
    init();
} else {
    window.addEventListener("load", init);
}
