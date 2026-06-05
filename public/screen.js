/**
 * screen.js — Terminal Display & Boot Sequence
 *
 * Responsible for:
 *   - The power-on / boot animation sequence.
 *   - The main terminal read-eval-print loop (REPL).
 *   - Helper functions: clear(), getScreen().
 *   - Routing keyboard focus between the terminal and windows.
 *   - Initialising the window manager on page load.
 *
 * Imports FROM: io.js, windows.js
 * Imported BY:  command modules
 *
 * Dependency chain (no cycles):
 *   windows.js  ←  io.js  ←  screen.js  ←  command modules
 */

import { parse, type, prompt, input, loadBlogPosts, loadRecipeList } from "./io.js";
import pause from "./pause.js";
import {
    openWindow,
    closeWindow,
    minimizeWindow,
    setupWindow,
    setupAllWindows,
    createWindow,
    setupGlobalFocusBehavior,
    setOnFocusChange,
    isWindowVisible,
    isWindowMinimized,
} from "./windows.js";

globalThis.DEBUG =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "::1";

export { openWindow, closeWindow, minimizeWindow, setupWindow };

window.type = type;

// ─── Selectors ────────────────────────────────────────────────────────────────

const DEFAULT_TERMINAL_SELECTOR = ".terminal";

// ─── Focus / typing-host state ────────────────────────────────────────────────

let activeTypingHost = null;

setOnFocusChange((host) => {
    activeTypingHost = host;
    if (host) {
        getLiveInput()?.focus();
    } else {
        focusTerminalInput();
    }
});

// ─── Terminal helpers ─────────────────────────────────────────────────────────

function getTerminal() {
    return document.querySelector(DEFAULT_TERMINAL_SELECTOR);
}

function getLiveInput() {
    return document.querySelector('[contenteditable="true"]');
}

function focusTerminalInput() {
    getLiveInput()?.focus();
    activeTypingHost = null;
}

// ─── Public typing-host API ───────────────────────────────────────────────────

export function getTypingHost() {
    return activeTypingHost || getTerminal();
}

export async function typeInActiveHost(text, options = {}) {
    return type(text, options, getTypingHost());
}

// ─── Power-on and boot sequence ───────────────────────────────────────────────

async function on() {
    await power();
    boot();
}

async function power() {
    await pause(0.5);
    document.getElementById("monitor").classList.toggle("turn-on");
    
}

export async function boot() {
    clear();
    if (globalThis.DEBUG) {
        await type("DEBUG MODE IS ACTIVE! IF YOU SEE THIS, INFORM CYBERVIXEN.\nDEBUG MODE MAY HARM YOUR EXPERIENCE AS MANY PUZZLES\nWILL BE MUCH EASIER TO SOLVE THAN INTENDED!", { wait: 0 });
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
            wait: 2,
            hideCursor: true,
        });

        await type(`Welcome to FoxOS ver. 1.33.7`, { initialWait: 100 });
        await type(`"Harmony engineered."`, { initialWait: 100 });
        await type(`Try 'HELP' for commands.`, { initialWait: 100 });
    }

    focusTerminalInput();
    return main();
}

// ─── Main REPL ────────────────────────────────────────────────────────────────

export async function main() {
    const command = await input();
    try {
        await parse(command);
    } catch (e) {
        if (e.message) await type(e.message);
    }
    main().catch(e => console.error("REPL crashed:", e));
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Clears all content from the terminal (or a given element).
 *
 * @param {Element} [screen=.terminal]
 */
export function clear(screen = document.querySelector(".terminal")) {
    screen.innerHTML = "";
}

// ─── Initialisation ───────────────────────────────────────────────────────────

async function init() {
    // Fetch each window's content HTML then build the window programmatically.
    // The .html files contain only the inner body markup — no chrome.
    const [blogHTML, recipesHTML, aboutHTML, linksHTML] = await Promise.all([
        fetch("./commands/blog/blog.html").then(r => r.text()),
        fetch("./commands/recipes/recipes.html").then(r => r.text()),
        fetch("./commands/about/about.html").then(r => r.text()),
        fetch("./commands/links/links.html").then(r => r.text()),
    ]);

    createWindow("blog", {
        title: "BLOG.EXE - RAMBLINGS OF A MAD FOX",
        contentHTML: blogHTML,
        onOpen: loadBlogPosts,
    });

    createWindow("recipes", {
        title: "cookbook.exe - cyber industries(TM) is not responsible for house fires",
        contentHTML: recipesHTML,
        onOpen: loadRecipeList,
    });

    createWindow("about", {
        title: "neko.exe",
        contentHTML: aboutHTML,
    });

    createWindow("links", {
        title: "web.exe - Capturing your data, one strand at a time",
        contentHTML: linksHTML,
    });
    const artHTML = await fetch("./commands/repair/repair.html").then(r => r.text());
    document.body.insertAdjacentHTML("beforeend", artHTML);

    setupGlobalFocusBehavior();
    on();
}

if (document.readyState === "complete") {
    init();
} else {
    window.addEventListener("load", init);
}
