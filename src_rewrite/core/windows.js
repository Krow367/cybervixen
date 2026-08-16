/**
 * windows.js — foxOS Window Manager Engine
 * 
 * Provides:
 * - Opening encapsulated window cartridges (Blog, Recipes, Chat, Links, About)
 * - Smooth, high-performance window dragging
 * - Z-Index layering (focused window comes to top)
 * - Minimize, Maximize, and Close actions
 */

import { playRelayThump } from "./audio.js";
import { setupScrollbar } from "./scrollbar.js";

let activeZIndex = 20;
const openWindows = new Map();

/**
 * Creates and opens a retro CRT window on the monitor.
 * 
 * @param {string} id - Unique window identifier (e.g. 'blog', 'recipes')
 * @param {object} config - Configuration:
 *   - title: Window title text
 *   - content: HTML or text content to display
 *   - width: initial width in px (default 520)
 *   - height: initial height in px (default 360)
 *   - x: initial left offset
 *   - y: initial top offset
 */
export function openWindow(id, config = {}) {
    const container = document.getElementById("windows-container");
    if (!container) return;

    // If window already open, bring to front and focus
    if (openWindows.has(id)) {
        const existing = openWindows.get(id);
        existing.classList.remove("minimized");
        bringToFront(existing);
        playRelayThump();
        return existing;
    }

    const {
        title = "WINDOW",
        content = "",
        width = 0.75, // Ratio of viewport width by default (e.g., 65vw)
        height = 0.70, // Ratio of viewport height by default (e.g., 60vh)
        onClose = null
    } = config;

    // Support both responsive screen ratios (0.1 - 1.0) and absolute pixel counts
    let targetW = typeof width === "number" ? (width <= 1.0 ? Math.round(window.innerWidth * width) : width) : 680;
    let targetH = typeof height === "number" ? (height <= 1.0 ? Math.round(window.innerHeight * height) : height) : 460;

    // Viewport-safe bounds checking: Ensure window never overflows screen edges
    const maxW = Math.max(320, window.innerWidth - 32);
    const maxH = Math.max(240, window.innerHeight - 48);

    targetW = Math.max(360, Math.min(targetW, maxW));
    targetH = Math.max(280, Math.min(targetH, maxH));

    const targetX = Math.max(16, Math.min(window.innerWidth - targetW - 16, (window.innerWidth - targetW) / 2 + (openWindows.size * 16)));
    const targetY = Math.max(16, Math.min(window.innerHeight - targetH - 16, (window.innerHeight - targetH) / 2 + (openWindows.size * 16)));

    const win = document.createElement("div");
    win.className = "window active";
    win.id = `win-${id}`;
    if (typeof onClose === "function") {
        win._onCloseCallback = onClose;
    }
    win.style.width = `${targetW}px`;
    win.style.height = `${targetH}px`;
    win.style.left = `${targetX}px`;
    win.style.top = `${targetY}px`;
    win.style.maxWidth = "calc(100vw - 32px)";
    win.style.maxHeight = "calc(100vh - 32px)";
    win.style.zIndex = ++activeZIndex;

    win.innerHTML = `
        <div class="window-titlebar">
            <div class="window-title">
                <span>■</span>
                <span>${title}</span>
            </div>
            <div class="window-controls">
                <button class="window-btn btn-min" title="Minimize">_</button>
                <button class="window-btn btn-max" title="Maximize">□</button>
                <button class="window-btn btn-close" title="Close">✕</button>
            </div>
        </div>
        <div class="window-body">
            ${content}
        </div>
        <div class="resize-handle" title="Resize"></div>
    `;

    // ─── Event Bindings ───────────────────────────────────────────────────────

    // Focus on click
    win.addEventListener("mousedown", () => bringToFront(win));

    // Control Buttons
    const btnMin = win.querySelector(".btn-min");
    const btnMax = win.querySelector(".btn-max");
    const btnClose = win.querySelector(".btn-close");

    btnMin.addEventListener("click", (e) => {
        e.stopPropagation();
        playRelayThump();
        win.classList.toggle("minimized");
        if (win.classList.contains("minimized")) {
            refocusTerminalPrompt();
        }
    });

    btnMax.addEventListener("click", (e) => {
        e.stopPropagation();
        playRelayThump();
        win.classList.toggle("maximized");
    });

    btnClose.addEventListener("click", (e) => {
        e.stopPropagation();
        playRelayThump();
        closeWindow(id);
    });

    // Make Draggable by Titlebar
    makeDraggable(win, win.querySelector(".window-titlebar"));

    // Make Resizable by Corner Handle
    makeResizable(win, win.querySelector(".resize-handle"));

    container.appendChild(win);
    openWindows.set(id, win);
    bringToFront(win);
    playRelayThump();

    // Automatically initialize any vintage hardware scrollboxes inside this window
    win.querySelectorAll("[data-scrollbox]").forEach(setupScrollbar);

    return win;
}

/**
 * Refocuses the main terminal prompt input element.
 */
export function refocusTerminalPrompt() {
    const inputEl = document.getElementById("input");
    const activeLine = document.getElementById("active-prompt-line");
    if (inputEl && (!activeLine || activeLine.style.display !== "none")) {
        // Small tick to ensure browser selection/focus fires cleanly after DOM removal
        requestAnimationFrame(() => {
            inputEl.focus();
        });
    }
}

/**
 * Closes an open window, cleans up DOM, and returns focus to prompt or top window.
 */
export function closeWindow(id) {
    if (openWindows.has(id)) {
        const win = openWindows.get(id);
        
        // Trigger any registered custom close callback (e.g. chat disconnection)
        if (typeof win._onCloseCallback === "function") {
            try {
                win._onCloseCallback();
            } catch (err) {
                console.error("Window onClose error:", err);
            }
        }

        win.remove();
        openWindows.delete(id);

        // If other windows remain open, activate the top-most
        const remaining = Array.from(openWindows.values()).filter(w => !w.classList.contains("minimized"));
        if (remaining.length > 0) {
            const topWin = remaining.reduce((prev, curr) => (parseInt(curr.style.zIndex || 0) > parseInt(prev.style.zIndex || 0)) ? curr : prev);
            bringToFront(topWin);
        } else {
            refocusTerminalPrompt();
        }
    } else {
        refocusTerminalPrompt();
    }
}

/**
 * Brings a window to the highest z-index.
 */
function bringToFront(win) {
    document.querySelectorAll(".window").forEach(w => w.classList.remove("active"));
    win.classList.add("active");
    win.style.zIndex = ++activeZIndex;
}

/**
 * Lightweight, high-performance mouse drag handler for window titlebars.
 */
function makeDraggable(win, handle) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    handle.addEventListener("mousedown", (e) => {
        // Ignore clicks on control buttons
        if (e.target.closest(".window-btn")) return;
        if (win.classList.contains("maximized")) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = win.offsetLeft;
        initialTop = win.offsetTop;

        const onMouseMove = (moveEvent) => {
            if (!isDragging) return;
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            // Strict Physical CRT Bezel Collision Clamping:
            // Locks the window 100% inside the visible monitor boundaries
            const maxLeft = Math.max(0, window.innerWidth - win.offsetWidth);
            const maxTop = Math.max(0, window.innerHeight - win.offsetHeight);

            const newLeft = Math.max(0, Math.min(maxLeft, initialLeft + dx));
            const newTop = Math.max(0, Math.min(maxTop, initialTop + dy));

            win.style.left = `${newLeft}px`;
            win.style.top = `${newTop}px`;
        };

        const onMouseUp = () => {
            isDragging = false;
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    });
}

/**
 * Smooth corner resize handler for CRT windows with strict monitor edge clamping.
 */
function makeResizable(win, handle) {
    let isResizing = false;
    let startX, startY, initialWidth, initialHeight;

    handle.addEventListener("mousedown", (e) => {
        if (win.classList.contains("maximized")) return;
        e.preventDefault();
        e.stopPropagation();

        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        initialWidth = win.offsetWidth;
        initialHeight = win.offsetHeight;

        const onMouseMove = (moveEvent) => {
            if (!isResizing) return;
            const dw = moveEvent.clientX - startX;
            const dh = moveEvent.clientY - startY;

            // Strict physical boundary: resizing stops cold at monitor bezel
            const maxW = Math.max(300, window.innerWidth - win.offsetLeft);
            const maxH = Math.max(180, window.innerHeight - win.offsetTop);

            const newW = Math.max(300, Math.min(maxW, initialWidth + dw));
            const newH = Math.max(180, Math.min(maxH, initialHeight + dh));

            win.style.width = `${newW}px`;
            win.style.height = `${newH}px`;
        };

        const onMouseUp = () => {
            isResizing = false;
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    });
}
