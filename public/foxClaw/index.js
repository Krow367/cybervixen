// =============================================================================
// index.js — Entry Point: Asset Loading, Init & Lifecycle
// =============================================================================

import { clear }                            from "../../screen.js";
import { registerGame, abortGame }      from "../../games.js";
import { resetState }                   from "./state.js";
import { render, setViewportW, setViewportH } from "./render.js";
import { handleKeyDown, handleKeyUp }   from "./input.js";
import { loadGame }                     from "./save.js";
import { type } from "../io.js";

// =============================================================================
// ASSET LOADING
// =============================================================================

let _loaded = false;

/**
 * Injects the game stylesheet (once) and the root HTML container.
 * The root is re-injected on each start since stopGame() removes it.
 */
async function ensureAssets() {
    if (document.getElementById("foxclaw-root")) return;

    if (!_loaded) {
        _loaded = true;
        const link = Object.assign(document.createElement("link"), {
            rel: "stylesheet", href: "/foxClaw/foxclaw.css"
        });
        document.head.appendChild(link);
    }

    const html = await fetch("/foxClaw/foxclaw.html").then(r => r.text());
    document.getElementById("crt").insertAdjacentHTML("afterbegin", html);
}

// =============================================================================
// LIFECYCLE
// =============================================================================

/** Default export — invoked when the player runs `foxclaw` in the terminal. */
export default async function () {
    // TODO: Delete this when first version goes live.
    if (!globalThis.DEBUG){ 
        await type("Sorry. foxClaw is currently under development. The command will be listed in 'help' when the first version is available to play. Unless you decide to hunt down how to bypass this message. I can't stop you. :)");
        await type("If you do, I will not be responsible for any damages. Pyschological, physical, or digital. Have fun!")
        return;
    }

    await ensureAssets();
    clear();
    await new Promise(resolve => setTimeout(() => init(resolve), 50));
}

/**
 * Initialises a new game session: registers it, binds all event listeners,
 * and performs the initial state reset (or save loading) + render cycle.
 */
export function init(onDone = () => {}) {
    const controller = new AbortController();
    registerGame("foxclaw", controller);
    const { signal } = controller;

    const stop = () => stopGame(onDone);

    const hasSave = localStorage.getItem("foxclaw_save") !== null;
    if (hasSave) {
        loadGame();
    } else {
        resetState();
    }
    measureViewport();
    render();

    document.addEventListener("keydown", e => handleKeyDown(e, onDone, stop), { signal });
    document.addEventListener("keyup",   e => handleKeyUp(e),                  { signal });
    window.addEventListener("load",   () => { measureViewport(); render(); }, { signal });
    window.addEventListener("resize", () => { measureViewport(); render(); }, { signal });

    if (document.fonts) {
        document.fonts.ready.then(() => {
            measureViewport();
            render();
        });
    }
}

/**
 * Removes the game UI, aborts the session, clears the screen,
 * and hands control back to the terminal.
 */
function stopGame(onDone) {
    document.getElementById("foxclaw-root")?.remove();
    abortGame("foxclaw");
    clear();
    onDone();
}

// =============================================================================
// VIEWPORT MEASUREMENT
// =============================================================================

/**
 * Measures the available map area and calculates how many character cells
 * fit within it, then updates the renderer's VIEWPORT_W/H accordingly.
 */
function measureViewport() {
    const wrapper = document.querySelector(".map-wrapper");
    if (!wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const root = document.getElementById("foxclaw-root");

    // Probe character dimensions using a hidden throwaway pre element with 10 lines to measure line-height accurately
    const probe = Object.assign(document.createElement("pre"), {
        className: "foxclaw-map",
        style: "position:absolute;visibility:hidden;white-space:pre;margin:0;padding:0;",
        textContent: "@\n@\n@\n@\n@\n@\n@\n@\n@\n@"
    });
    (root || document.body).appendChild(probe);
    const rectProbe = probe.getBoundingClientRect();
    const cW = rectProbe.width || 9.2;
    const cH = (rectProbe.height / 10) || 18.4;
    (root || document.body).removeChild(probe);

    setViewportW(Math.max(15, Math.floor((rect.width  - 4) / cW)));
    setViewportH(Math.max(15, Math.floor((rect.height - 4) / cH)));
}