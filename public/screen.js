/**
 * screen.js — Terminal Display & Boot Sequence (Streamlined)
 */

import { parse, type, prompt, input, loadBlogPosts, loadRecipeList } from "./io.js";
import pause from "./pause.js";
import {
    openWindow,
    closeWindow,
    minimizeWindow,
    setupWindow,
    createWindow,
    setupGlobalFocusBehavior,
    setOnFocusChange,
    registerLazyWindow,
    ensureWindowCreated
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

export function getTypingHost() {
    return activeTypingHost || getTerminal();
}

// ─── Vintage Keyboard & CRT Terminal Scrolling ───────────────────────────────
let crtAudioCtx = null;
function playCRTPageClick() {
    if (localStorage.getItem("system_sound_muted") === "true") return;
    try {
        if (!crtAudioCtx) crtAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (crtAudioCtx.state === "suspended") crtAudioCtx.resume();
        const now = crtAudioCtx.currentTime;
        const osc = crtAudioCtx.createOscillator();
        const gain = crtAudioCtx.createGain();

        // 1981 hardware terminal relay click
        osc.type = "square";
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.022);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

        osc.connect(gain);
        gain.connect(crtAudioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.022);
    } catch (e) {}
}

function triggerCRTRetrace() {
    const crt = document.getElementById("crt");
    if (crt) {
        crt.classList.remove("crt-retrace");
        void crt.offsetWidth; // Force CSS reflow to re-trigger animation
        crt.classList.add("crt-retrace");
    }
    playCRTPageClick();
}

// Snappy, instant 100% viewport paging matching authentic CRT hardware
window.addEventListener("keydown", (e) => {
    // If a popup window (like blog or recipes) is focused, let window handle its own scrolling
    if (activeTypingHost && activeTypingHost !== getTerminal()) return;

    const term = getTerminal();
    if (!term) return;

    // Full 100% viewport height jump (snappy instant hardware redraw)
    const fullViewportHeight = term.clientHeight;
    const lineAmount = 40; // Line-by-line step

    // Snappy 100% Viewport Page Up
    if (e.key === "PageUp") {
        e.preventDefault();
        term.scrollBy({ top: -fullViewportHeight, behavior: "auto" });
        triggerCRTRetrace();
    } 
    // Snappy 100% Viewport Page Down
    else if (e.key === "PageDown") {
        e.preventDefault();
        term.scrollBy({ top: fullViewportHeight, behavior: "auto" });
        triggerCRTRetrace();
    } 
    // Half-screen jump: Ctrl+Up or Alt+Up
    else if ((e.ctrlKey || e.altKey) && e.key === "ArrowUp") {
        e.preventDefault();
        term.scrollBy({ top: -Math.round(fullViewportHeight * 0.5), behavior: "auto" });
        triggerCRTRetrace();
    }
    // Half-screen jump: Ctrl+Down or Alt+Down
    else if ((e.ctrlKey || e.altKey) && e.key === "ArrowDown") {
        e.preventDefault();
        term.scrollBy({ top: Math.round(fullViewportHeight * 0.5), behavior: "auto" });
        triggerCRTRetrace();
    }
    // Line-by-line precision: Shift+Up
    else if (e.shiftKey && e.key === "ArrowUp") {
        e.preventDefault();
        term.scrollBy({ top: -lineAmount, behavior: "auto" });
        triggerCRTRetrace();
    } 
    // Line-by-line precision: Shift+Down
    else if (e.shiftKey && e.key === "ArrowDown") {
        e.preventDefault();
        term.scrollBy({ top: lineAmount, behavior: "auto" });
        triggerCRTRetrace();
    } 
    // Top of terminal
    else if (e.key === "Home" && (e.ctrlKey || e.shiftKey)) {
        e.preventDefault();
        term.scrollTo({ top: 0, behavior: "auto" });
        triggerCRTRetrace();
    } 
    // Bottom of terminal (active prompt)
    else if (e.key === "End" && (e.ctrlKey || e.shiftKey)) {
        e.preventDefault();
        term.scrollTo({ top: term.scrollHeight, behavior: "auto" });
        triggerCRTRetrace();
    }
});

// Capture mouse wheel anywhere on CRT to scroll the terminal smoothly
window.addEventListener("wheel", (e) => {
    if (activeTypingHost && activeTypingHost !== getTerminal()) return;
    const term = getTerminal();
    if (term) {
        term.scrollTop += e.deltaY;
    }
}, { passive: true });

export async function typeInActiveHost(text, options = {}) {
    return type(text, options, getTypingHost());
}

// ─── Power-on and boot sequence ───────────────────────────────────────────────

async function on() {
    await power();
    boot();
}

async function power() {
    await pause(0.25);
    const monitor = document.getElementById("monitor");
    if (monitor) {
        monitor.classList.remove("off");
        monitor.classList.add("turn-on");
    }
}

export async function boot() {
    clear();
    const notes = await checkContentUpdates();
    if (globalThis.DEBUG) {
        await type("DEBUG MODE IS ACTIVE! IF YOU SEE THIS, INFORM CYBERVIXEN.\nDEBUG MODE MAY HARM YOUR EXPERIENCE AS MANY PUZZLES\nWILL BE MUCH EASIER TO SOLVE THAN INTENDED!", { wait: 0 });
        for (const note of notes) {
            await type(note, { wait: 0 });
        }
    } else {
        await type("Serenity Industries(TM) CV-2077 terminal interface", { initialWait: 2000 });
        await type("Loading.....", { initialWait: 500 });
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

        await type("Welcome to FoxOS ver. 1.33.7", { initialWait: 100 });
        await type('"Harmony engineered."', { initialWait: 100 });
        await type("Try 'HELP' for commands.", { initialWait: 100 });
        for (const note of notes) {
            await type(note, { wait: 0 });
        }
    }

    focusTerminalInput();
    return main();
}

async function checkContentUpdates() {
    const notes = [];
    try {
        const [blogIndex, recipeIndex] = await Promise.all([
            fetch("/blog/index.json").then(r => r.json()),
            fetch("/recipes/index.json").then(r => r.json())
        ]);

        const savedBlog = JSON.parse(localStorage.getItem("blogIndexSnapshot") || "null");
        const savedRecipe = JSON.parse(localStorage.getItem("recipeIndexSnapshot") || "null");

        if (savedBlog !== null && JSON.stringify(savedBlog) !== JSON.stringify(blogIndex)) {
            notes.push("Welcome back — there is a new blog post uploaded from CyberVixen.");
        }

        if (savedRecipe !== null && JSON.stringify(savedRecipe) !== JSON.stringify(recipeIndex)) {
            notes.push("Welcome back — there is a new recipe found in system memory.");
        }
    } catch (e) {
        console.error("Content update check failed:", e);
    }
    return notes;
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

export function clear(screen = document.querySelector(".terminal")) {
    if (screen) screen.innerHTML = "";
}

// ─── Initialisation ───────────────────────────────────────────────────────────

async function init() {
    try {
        // Register lazy-loaded windows
        registerLazyWindow("blog", {
            title: "BLOG.EXE - RAMBLINGS OF A MAD FOX",
            url: "./commands/blog/blog.html",
            onOpen: loadBlogPosts,
        });

        registerLazyWindow("recipes", {
            title: "cookbook.exe - cyber industries(TM) is not responsible for house fires",
            url: "./commands/recipes/recipes.html",
            onOpen: loadRecipeList,
        });

        registerLazyWindow("about", {
            title: "neko.exe",
            url: "./commands/about/about.html",
        });

        registerLazyWindow("links", {
            title: "web.exe - Capturing your data, one strand at a time",
            url: "./commands/links/links.html",
        });

        registerLazyWindow("chat", {
            title: "SRC.EXE - SERENITY RELAY CHAT - YOU CHAT. WE READ.",
            url: "./commands/chat/chat.html",
            width: "79vw",
            height: "75vh",
            onOpen: () => {
                import("./commands/chat/index.mjs").then(m => {
                    m.blurTerminalInput?.();
                    m.syncThemeToIframe?.();
                });
            }
        });

        // Start boot sequence immediately without blocking
        setupGlobalFocusBehavior();
        on();

        // Fetch and append repair asset asynchronously
        fetch("./commands/repair/repair.html")
            .then(r => r.text())
            .then(artHTML => {
                document.body.insertAdjacentHTML("beforeend", artHTML);
            })
            .catch(e => console.error("Failed to load repair HTML:", e));

    } catch (e) {
        console.error("Initialization failed:", e);
    }
}

if (document.readyState === "complete") {
    init();
} else {
    window.addEventListener("load", init);
}
