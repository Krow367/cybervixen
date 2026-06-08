/**
 * windows.js — Window Manager
 *
 * Owns everything related to the floating OS-style windows:
 * creation, positioning, cascade, dragging, resizing, minimising,
 * closing, z-ordering, pseudo-transparent backgrounds, and the
 * custom fake scrollbars used inside every window.
 *
 * Dependency chain: windows.js has NO imports from io.js or screen.js.
 * Both of those modules import from here, keeping the graph acyclic:
 *
 *   windows.js  (no local imports)
 *       ↑
 *   io.js       (imports openWindow, closeWindow, minimizeWindow, setupFakeScrollbar)
 *       ↑
 *   screen.js   (imports the above + getTypingHost, setOnFocusChange)
 */

// ─── Selectors ────────────────────────────────────────────────────────────────

const WINDOW_SELECTOR = ".window";

// ─── Module-level state ───────────────────────────────────────────────────────

/** Per-window metadata stored in a WeakMap so entries are GC'd with the node. */
const windowState = new WeakMap();

/** The window element that currently has focus (top of z-stack). */
let activeWindow = null;

/** Monotonically increasing z-index counter. Capped below the scanline layers (8888/9999). */
let zCounter = 100;

/** How many windows have been placed so far; used to step the default cascade origin. */
let openCount = 0;

/**
 * Optional callback invoked whenever the active typing host changes.
 * screen.js registers this so it can redirect typed input to the right element.
 * Signature: (hostElement | null) => void
 */
let onFocusChangeCallback = null;

// ─── Focus-change bridge ───────────────────────────────────────────────────────

/**
 * Registers a callback that fires whenever the window manager decides where
 * keyboard input should go. screen.js uses this to point its live <input>
 * at the right container without creating a circular import.
 *
 * @param {(host: Element|null) => void} fn
 */
export function setOnFocusChange(fn) {
    onFocusChangeCallback = fn;
}

/** Fires the registered focus-change callback if one has been set. */
function notifyFocusChange(host) {
    onFocusChangeCallback?.(host);
}

// ─── Per-window state helpers ─────────────────────────────────────────────────

/**
 * Returns (creating if necessary) the mutable state object for a window root.
 * Stored in a WeakMap so it is automatically released when the element is removed.
 */
function getWindowState(root) {
    if (!windowState.has(root)) {
        windowState.set(root, {
            openedOnce: false,   // whether a cascade position has been assigned
            prevHeight: "",      // height before minimising, restored on un-minimise
            acceptsTerminal: false, // whether this window hosts a typing region
            terminalTarget: null    // the specific element that receives typed text
        });
    }
    return windowState.get(root);
}

// ─── Visibility helpers ───────────────────────────────────────────────────────

/** True when the window exists and does not carry the "hidden" class. */
export function isWindowVisible(root) {
    return !!root && !root.classList.contains("hidden");
}

/** True when the window exists and carries the "minimized" class. */
export function isWindowMinimized(root) {
    return !!root && root.classList.contains("minimized");
}

// ─── Window-surface bootstrap ─────────────────────────────────────────────────

/**
 * Wraps all of a window root's children inside a .window-surface div if one
 * does not already exist. The surface is the element that carries the
 * pseudo-transparent CRT background via CSS custom properties.
 */
function ensureWindowSurface(root) {
    if (!root) return;
    if (root.querySelector(":scope > .window-surface")) return;

    const surface = document.createElement("div");
    surface.className = "window-surface";

    while (root.firstChild) {
        surface.appendChild(root.firstChild);
    }

    root.appendChild(surface);
}

// ─── Typing-target metadata ───────────────────────────────────────────────────

/**
 * Reads data attributes on the window root to decide whether it can accept
 * terminal input and which child element should receive it. Results are cached
 * in the window's state object.
 */
function syncWindowTypingMetadata(root) {
    const state = getWindowState(root);

    // A window accepts terminal input if it has data-accepts-terminal on the
    // root, or if any child carries data-terminal-target.
    state.acceptsTerminal =
        root.hasAttribute("data-accepts-terminal") ||
        !!root.querySelector("[data-terminal-target]");

    // Prefer an explicit data-terminal-target, fall back to .window-terminal.
    state.terminalTarget =
        root.querySelector("[data-terminal-target]") ||
        root.querySelector(".window-terminal") ||
        null;
}

// ─── Focus routing ────────────────────────────────────────────────────────────

/**
 * Directs keyboard focus toward the appropriate typing host for this window.
 * If the window does not accept terminal input the callback is called with
 * null so screen.js can redirect focus back to the main terminal input.
 */
function focusTypingHost(root) {
    if (!root) {
        notifyFocusChange(null);
        return;
    }

    syncWindowTypingMetadata(root);
    const state = getWindowState(root);

    if (!state.acceptsTerminal) {
        notifyFocusChange(null);
        return;
    }

    // Use the explicit target, else fall back to the first content area.
    const host =
        state.terminalTarget ||
        root.querySelector(".content") ||
        root.querySelector(".body") ||
        null;

    notifyFocusChange(host);
}

/**
 * Ensures focus is routed correctly for the given window. If the window is
 * gone / hidden / minimised, restores focus to the main terminal.
 */
function focusWindowIfNeeded(root) {
    if (!root || !isWindowVisible(root) || isWindowMinimized(root)) {
        notifyFocusChange(null);
        return;
    }

    syncWindowTypingMetadata(root);
    const state = getWindowState(root);

    if (state.acceptsTerminal) {
        focusTypingHost(root);
    } else {
        notifyFocusChange(null);
    }
}

// ─── Pseudo-transparent background ───────────────────────────────────────────

/**
 * Keeps the window's fake-transparent background aligned with the CRT element
 * behind it. The CSS rule on .window-surface uses background-position driven
 * by two custom properties (--crt-offset-x / --crt-offset-y) that represent
 * how far the CRT origin is from the window's own top-left corner.
 *
 * Must be called any time the window moves (drag, resize, initial placement)
 * or the viewport scrolls / resizes.
 */
export function syncWindowBackground(root) {
    if (!root) return;

        const surface =
        root.matches?.(".window-surface, #alert-frame")
            ? root
            : root.querySelector(":scope > .window-surface, :scope > .alert-surface");

    //const surface = root.querySelector(":scope > .window-surface, :scope > #alert-frame");
    const crt = document.getElementById("crt");
    if (!surface || !crt) return;

    const winRect = surface.getBoundingClientRect();
    const crtRect = crt.getBoundingClientRect();

    surface.style.setProperty("--crt-offset-x", `${crtRect.left - winRect.left}px`);
    surface.style.setProperty("--crt-offset-y", `${crtRect.top  - winRect.top}px`);
}

// ─── Z-ordering and active-window tracking ────────────────────────────────────

/**
 * Brings a window to the top of the z-stack, marks it as the active window,
 * and updates the active-window CSS class on all windows.
 *
 * @param {Element} root         The window element to activate.
 * @param {Object}  [options]
 * @param {boolean} [options.focusTyping=false] Whether to also route keyboard focus.
 */
export function setActiveWindow(root, { focusTyping = false } = {}) {
    if (!root || !isWindowVisible(root) || isWindowMinimized(root)) return;

    activeWindow = root;
    // Increment z-index but stay well below the scanline overlays (8888 / 9999).
    zCounter = Math.min(zCounter + 1, 8000);

    // Toggle the active-window class across all windows.
    document.querySelectorAll(WINDOW_SELECTOR).forEach((win) => {
        win.classList.toggle("active-window", win === root);
    });

    root.style.position = "fixed";
    root.style.zIndex   = String(zCounter);

    // If the window lives inside #crt, re-append it so it renders on top of
    // sibling windows (DOM order matters for same-z siblings).
    const crt = document.getElementById("crt");
    if (root.parentElement === crt) {
        crt.appendChild(root);
    }

    syncWindowBackground(root);

    if (focusTyping) {
        focusTypingHost(root);
    }
}

/**
 * Removes the active-window designation from a specific window (or the
 * current active window if none is specified).
 */
function clearActiveWindow(root = activeWindow) {
    if (root && activeWindow === root) {
        activeWindow = null;
    }

    document.querySelectorAll(WINDOW_SELECTOR).forEach((win) => {
        win.classList.remove("active-window");
    });
}

// ─── Cascade positioning ──────────────────────────────────────────────────────

/**
 * Assigns an initial screen position to a window using a cascade algorithm:
 * each successive window is offset 32 px right and 24 px down from the
 * previously opened window, wrapping back to the top-left if it would fall
 * off the CRT boundary. The overlap-detection pass also nudges the window if
 * it would land directly on top of another open window.
 *
 * Always re-runs on every open (openedOnce is cleared by openWindow before
 * this is called) so a window that was closed and reopened gets a fresh
 * cascaded position rather than snapping back to wherever CSS left it.
 */
function applyInitialWindowPosition(root) {
    const state = getWindowState(root);

    root.style.position = "fixed";

    const offsetX = 32;
    const offsetY = 24;

    const crt     = document.getElementById("crt");
    const crtRect = crt?.getBoundingClientRect();
    const margin  = 16;

    // Use offsetWidth/Height because getBoundingClientRect returns zeros while
    // the window is hidden; offsetWidth still reflects CSS-declared size.
    const width  = root.offsetWidth  || 640;
    const height = root.offsetHeight || 480;

    // Default starting position: top-left of CRT plus a step based on how
    // many windows have been placed this session.
let left = (crtRect ? crtRect.left + (crtRect.width  - width)  / 2 : 0) + openCount * offsetX;
let top  = (crtRect ? crtRect.top  + (crtRect.height - height) / 2 : 0) + openCount * offsetY;

    // If there is an already-visible window, cascade off its position.
    const anchor =
        activeWindow &&
        activeWindow !== root &&
        isWindowVisible(activeWindow) &&
        !isWindowMinimized(activeWindow)
            ? activeWindow
            : [...document.querySelectorAll(WINDOW_SELECTOR)]
                .filter(win =>
                    win !== root &&
                    isWindowVisible(win) &&
                    !isWindowMinimized(win)
                )
                .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0))
                .at(-1);

    if (anchor) {
        // Prefer the inline style we set ourselves; fall back to getBoundingClientRect
        // for windows still sitting at their CSS-default position.
        const anchorLeft = parseFloat(anchor.style.left);
        const anchorTop  = parseFloat(anchor.style.top);
        const anchorRect = anchor.getBoundingClientRect();

        left = (Number.isFinite(anchorLeft) ? anchorLeft : anchorRect.left) + offsetX;
        top  = (Number.isFinite(anchorTop)  ? anchorTop  : anchorRect.top)  + offsetY;
    }

    // Clamp inside the CRT boundary.
    if (crtRect) {
        const minLeft = crtRect.left + margin;
        const minTop  = crtRect.top  + margin;
        const maxLeft = Math.max(minLeft, crtRect.right  - width  - margin);
        const maxTop  = Math.max(minTop,  crtRect.bottom - height - margin);

        left = Math.max(minLeft, Math.min(left, maxLeft));
        top  = Math.max(minTop,  Math.min(top,  maxTop));
    }

    // Nudge until we are not directly overlapping another window's origin.
    // We compare both inline style (JS-placed windows) and rendered rect
    // (CSS-placed windows) so no window is missed.
    const visibleWindows = [...document.querySelectorAll(WINDOW_SELECTOR)]
        .filter(win => win !== root && isWindowVisible(win) && !isWindowMinimized(win));

    let tries = 0;
    while (tries < 20 && visibleWindows.some(win => {
        const r  = win.getBoundingClientRect();
        const wl = Number.isFinite(parseFloat(win.style.left))
            ? parseFloat(win.style.left) : r.left;
        const wt = Number.isFinite(parseFloat(win.style.top))
            ? parseFloat(win.style.top)  : r.top;
        return Math.abs(wl - left) < 20 && Math.abs(wt - top) < 20;
    })) {
        left += offsetX;
        top  += offsetY;

        if (crtRect) {
            const minLeft = crtRect.left + margin;
            const minTop  = crtRect.top  + margin;
            const maxLeft = Math.max(minLeft, crtRect.right  - width  - margin);
            const maxTop  = Math.max(minTop,  crtRect.bottom - height - margin);

            if (left > maxLeft) left = minLeft;
            if (top  > maxTop)  top  = minTop;
        }
        tries++;
    }

    root.style.left = `${Math.round(left)}px`;
    root.style.top  = `${Math.round(top)}px`;

    state.openedOnce = true;
    openCount += 1;
}

// ─── Public window lifecycle ──────────────────────────────────────────────────

/**
 * Opens (or brings to front) a window by id or element reference.
 * - Removes the "hidden" class and restores height if minimised.
 * - Always re-runs cascade positioning when opening from hidden so the window
 *   lands in a sensible cascaded position rather than wherever CSS left it.
 * - Registers the fake scrollbar on all [data-scrollbox] children.
 * - Makes the window the active (top-most) window.
 * - Defers a background-sync to the next two animation frames so the browser
 *   has had a chance to paint the window at its real position before we read
 *   getBoundingClientRect() — this eliminates the "snap" artefact.
 *
 * @param {string|Element} idOrRoot  Window id string or element.
 * @param {Object}  [options]
 * @param {boolean} [options.focusTyping=true]  Route keyboard focus on open.
 * @returns {Element|null}
 */
export function openWindow(idOrRoot, options = {}) {
    const root = typeof idOrRoot === "string"
        ? document.getElementById(idOrRoot)
        : idOrRoot;

    if (!root) return null;

    ensureWindowSurface(root);
    syncWindowTypingMetadata(root);

    const wasHidden    = root.classList.contains("hidden");
    const wasMinimized = root.classList.contains("minimized");

    root.classList.remove("hidden");
    root.style.display = "";

    if (wasMinimized) {
        const state = getWindowState(root);
        root.classList.remove("minimized");
        root.style.height = state.prevHeight || "";
    }

    // Re-cascade on every open from hidden so a closed-then-reopened window
    // always gets a fresh position rather than snapping back to its CSS default.
    if (wasHidden) {
        getWindowState(root).openedOnce = false;
        applyInitialWindowPosition(root);
    }

    root.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);

    setActiveWindow(root, { focusTyping: options.focusTyping ?? true });

    // Background sync must happen AFTER the browser has painted the window at
    // its new position.  A synchronous call reads stale geometry (zeros while
    // hidden), so we defer across two rAF ticks.
    requestAnimationFrame(() => {
        syncWindowBackground(root);
        requestAnimationFrame(() => syncWindowBackground(root));
    });

    // Fire the onOpen lifecycle hook if one was registered via createWindow
    root._onOpen?.();

    return root;
}

/**
 * Closes a window by adding the "hidden" class and clearing its active state.
 * Focus is returned to the main terminal via the focus-change callback.
 *
 * @param {string|Element} idOrRoot
 */
export function closeWindow(idOrRoot) {
    const root = typeof idOrRoot === "string"
        ? document.getElementById(idOrRoot)
        : idOrRoot;

    if (!root) return;

    root.classList.add("hidden");
    root.classList.remove("active-window");

    // Fire the onClose lifecycle hook if one was registered via createWindow
    root._onClose?.();

    if (activeWindow === root) {
        clearActiveWindow(root);
        notifyFocusChange(null);
    }
}

/**
 * Toggles a window between minimised (title-bar-only) and restored states.
 * Stores the pre-minimise height so it can be exactly restored.
 *
 * @param {string|Element} idOrRoot
 */
export function minimizeWindow(idOrRoot) {
    const root = typeof idOrRoot === "string"
        ? document.getElementById(idOrRoot)
        : idOrRoot;

    if (!root) return;

    const state = getWindowState(root);

    if (!root.classList.contains("minimized")) {
        // Minimise: record current height, collapse to auto (title bar only).
        state.prevHeight = root.style.height;
        root.classList.add("minimized");
        root.style.height = "auto";

        if (activeWindow === root) {
            clearActiveWindow(root);
            notifyFocusChange(null);
        }
    } else {
        // Restore: put height back and re-activate.
        root.classList.remove("minimized");
        root.style.height = state.prevHeight || "";
        syncWindowBackground(root);
        setActiveWindow(root, { focusTyping: state.acceptsTerminal });
    }
}

// ─── Window setup (drag / resize / button wiring) ────────────────────────────

/**
 * Attaches all interactive behaviour to a window element:
 * dragging via the title bar, resizing via the resize handle, minimize/close
 * button listeners, and click-to-focus on the window body.
 *
 * Returns a cleanup function that removes every listener — useful if a window
 * is ever torn down dynamically.
 *
 * @param {Element} root  The .window element.
 * @returns {() => void}  Cleanup function.
 */
export function setupWindow(root) {
    if (!root) return () => {};

    ensureWindowSurface(root);
    syncWindowTypingMetadata(root);
    syncWindowBackground(root);

    if (!root.style.zIndex) {
        root.style.zIndex = "1";
    }

    const titlebar     = root.querySelector(".titlebar");
    const minimizeBtn  = root.querySelector(".minimize");
    const closeBtn     = root.querySelector(".close");
    const resizeHandle = root.querySelector("[data-resize]");

    let dragging    = false;
    let resizing    = false;
    let startX      = 0;
    let startY      = 0;
    let startLeft   = 0;
    let startTop    = 0;
    let startWidth  = 0;
    let startHeight = 0;

    // Bring the window to front on any mousedown inside it.
    const onWindowMouseDown = () => {
        if (!isWindowVisible(root) || isWindowMinimized(root)) return;
        setActiveWindow(root, { focusTyping: false });
    };

    // Title-bar drag: record start position and enter drag mode.
    const onMouseDown = (e) => {
        if (e.target.closest("button")) return;
        if (e.target.closest(".buttons")) return;

        setActiveWindow(root, { focusTyping: false });
        dragging = true;

        const rect = root.getBoundingClientRect();
        startX    = e.clientX;
        startY    = e.clientY;
        startLeft = rect.left;
        startTop  = rect.top;

        document.body.style.userSelect = "none";
    };

    // Resize handle: record start size and enter resize mode.
    const onResizeMouseDown = (e) => {
        setActiveWindow(root, { focusTyping: false });
        resizing = true;

        const rect   = root.getBoundingClientRect();
        startX       = e.clientX;
        startY       = e.clientY;
        startWidth   = rect.width;
        startHeight  = rect.height;

        document.body.style.userSelect = "none";
        e.preventDefault();
        e.stopPropagation();
    };

    // Apply drag / resize deltas on mousemove.
    const onMouseMove = (e) => {
        if (dragging) {
            root.style.left = `${startLeft + (e.clientX - startX)}px`;
            root.style.top  = `${startTop  + (e.clientY - startY)}px`;
            syncWindowBackground(root);
        }

        if (resizing) {
            root.style.width  = `${Math.max(320, startWidth  + (e.clientX - startX))}px`;
            root.style.height = `${Math.max(220, startHeight + (e.clientY - startY))}px`;
            syncWindowBackground(root);
            // Scrollbar thumb proportions depend on window size.
            root.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
        }
    };

    // End drag or resize on mouseup.
    const onMouseUp = () => {
        if (!dragging && !resizing) return;

        dragging = false;
        resizing = false;
        document.body.style.userSelect = "";

        syncWindowBackground(root);
        focusWindowIfNeeded(root);
    };

    const onMinimize = (e) => {
        e.preventDefault();
        e.stopPropagation();
        minimizeWindow(root);
    };

    const onClose = (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeWindow(root);
    };

    // Click anywhere in the window to bring it to front; clicks in a typing
    // region also redirect keyboard focus there.
    const onClick = (e) => {
        if (!isWindowVisible(root) || isWindowMinimized(root)) return;

        setActiveWindow(root, { focusTyping: false });

        const inTypingRegion =
            e.target.closest("[data-terminal-target]") ||
            e.target.closest(".window-terminal");

        if (inTypingRegion) {
            focusTypingHost(root);
            return;
        }

        const state = getWindowState(root);
        if (state.acceptsTerminal && !e.target.closest(".titlebar")) {
            focusTypingHost(root);
        }
    };

    // Re-sync background when the browser window itself is resized.
    const onResize = () => syncWindowBackground(root);

    titlebar?.addEventListener("mousedown",  onMouseDown);
    resizeHandle?.addEventListener("mousedown", onResizeMouseDown);
    root.addEventListener("mousedown", onWindowMouseDown);
    root.addEventListener("click",     onClick);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);
    minimizeBtn?.addEventListener("click",  onMinimize);
    closeBtn?.addEventListener("click",     onClose);
    window.addEventListener("resize",       onResize);

    return () => {
        titlebar?.removeEventListener("mousedown",  onMouseDown);
        resizeHandle?.removeEventListener("mousedown", onResizeMouseDown);
        root.removeEventListener("mousedown", onWindowMouseDown);
        root.removeEventListener("click",     onClick);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup",   onMouseUp);
        minimizeBtn?.removeEventListener("click",  onMinimize);
        closeBtn?.removeEventListener("click",     onClose);
        window.removeEventListener("resize",       onResize);
    };
}

// ─── Global keyboard / click behaviour ───────────────────────────────────────

/**
 * Handles the Escape key: closes the currently active window unless the main
 * terminal input has focus (so Escape can still be used in the terminal).
 */
function handleEscapeKey(event) {
    if (event.key !== "Escape") return;
    if (!activeWindow) return;
    if (!isWindowVisible(activeWindow) || isWindowMinimized(activeWindow)) return;

    // If the terminal input is focused and this window doesn't accept typing,
    // the user is typing in the terminal — don't close the window.
    const liveInput = document.querySelector('[contenteditable="true"]');
    const state     = getWindowState(activeWindow);
    if (document.activeElement === liveInput && !state.acceptsTerminal) return;

    closeWindow(activeWindow);
}

/**
 * Wires up global click behaviour on #crt:
 * - Clicking outside any window clears the active window and restores
 *   terminal focus via the callback.
 * - Clicking a hidden/minimised window restores terminal focus.
 * - Clicking a normal window that doesn't accept terminal input also
 *   restores terminal focus.
 */
export function setupGlobalFocusBehavior() {
    const crt = document.getElementById("crt");

    crt?.addEventListener("click", (e) => {
        const clickedWindow = e.target.closest(WINDOW_SELECTOR);

        if (!clickedWindow) {
            clearActiveWindow();
            notifyFocusChange(null);
            return;
        }

        if (
            clickedWindow.classList.contains("hidden") ||
            clickedWindow.classList.contains("minimized")
        ) {
            notifyFocusChange(null);
            return;
        }

        syncWindowTypingMetadata(clickedWindow);
        const state = getWindowState(clickedWindow);

        if (!state.acceptsTerminal) {
            notifyFocusChange(null);
        }
    });

    document.addEventListener("keydown", handleEscapeKey);
}

// ─── Batch initialisation ─────────────────────────────────────────────────────

/**
 * Calls setupWindow on every .window element currently in the DOM, and
 * pre-syncs the background offsets for a known list of windows.
 * Called once by screen.js after the page has loaded.
 *
 * @param {string[]} windowIds  IDs of windows to pre-sync (e.g. ["blog","recipes"]).
 */
export function setupAllWindows(windowIds = []) {
    document.querySelectorAll(WINDOW_SELECTOR).forEach((win) => {
        setupWindow(win);
        syncWindowBackground(win);
    });

    windowIds.forEach((id) => {
        const win = document.getElementById(id);
        if (win) {
            syncWindowBackground(win);
            win.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
        }
    });
}

// ─── Fake scrollbar ───────────────────────────────────────────────────────────

/**
 * Attaches a fully custom scrollbar to a [data-scrollbox] container.
 *
 * The scrollbar is built from three parts declared in HTML:
 *   [data-viewport]  — the element that actually scrolls (overflow hidden from CSS)
 *   [data-track]     — the visible scrollbar rail
 *   [data-thumb]     — the draggable thumb
 *   [data-dir]       — up/down arrow buttons (value: -1 or 1)
 *
 * Features:
 * - Thumb sized proportionally to visible / total content height.
 * - Click-and-drag on the thumb to scroll.
 * - Click on the track to jump up/down by ~90 % of the visible height.
 * - Click-and-hold on an arrow button to scroll continuously.
 * - ResizeObserver and MutationObserver keep the thumb in sync when content
 *   changes without a scroll event.
 * - Calling setupFakeScrollbar again on the same root tears down the previous
 *   instance first (via root._fakeScrollbarCleanup) to avoid duplicate listeners.
 *
 * @param {Element} root  The [data-scrollbox] wrapper element.
 */
export function setupFakeScrollbar(root) {
    const viewport = root.querySelector("[data-viewport]");
    const track    = root.querySelector("[data-track]");
    const thumb    = root.querySelector("[data-thumb]");
    const buttons  = root.querySelectorAll("[data-dir]");

    if (!viewport || !track || !thumb) return;

    // Tear down any previous instance on this root.
    root._fakeScrollbarCleanup?.();

    let dragging    = false;
    let startY      = 0;
    let startTop    = 0;
    let holdTimer   = null;
    let holdInterval = null;

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    /** Returns current scroll geometry in one object to avoid repeated DOM reads. */
    function metrics() {
        const trackH      = track.clientHeight;
        const viewH       = viewport.clientHeight;
        const scrollH     = viewport.scrollHeight;
        const maxScroll   = Math.max(0, scrollH - viewH);
        const thumbH      = maxScroll
            ? Math.max(24, (viewH / scrollH) * trackH)
            : trackH;
        const maxThumbTop = Math.max(0, trackH - thumbH);
        return { trackH, viewH, scrollH, maxScroll, thumbH, maxThumbTop };
    }

    /** Repaints the thumb position and visibility to match the current scroll state. */
    function paint() {
        const { trackH, viewH, scrollH, maxScroll, thumbH, maxThumbTop } = metrics();

        if (!trackH || !viewH) {
            thumb.style.display = "none";
            return;
        }

        thumb.style.height = `${thumbH}px`;

        if (scrollH <= viewH || !maxScroll) {
            thumb.style.top     = "0px";
            thumb.style.display = "none";
            return;
        }

        thumb.style.display     = "block";
        thumb.style.visibility  = "visible";
        thumb.style.opacity     = "1";

        const top = (viewport.scrollTop / maxScroll) * maxThumbTop;
        thumb.style.top = `${top}px`;
    }

    /** Schedules paint() across two animation frames to catch post-layout changes. */
    function paintSoon() {
        requestAnimationFrame(() => {
            paint();
            requestAnimationFrame(paint);
        });
    }

    /** Scrolls the viewport by one step in the given direction (1 = down, -1 = up). */
    function scrollByStep(dir) {
        const step = Number(getComputedStyle(root).getPropertyValue("--sb-step")) || 32;
        viewport.scrollTop += step * dir;
        paintSoon();
    }

    /** Begins a scroll-on-hold sequence: one immediate step then repeated at 40 ms. */
    function startHold(dir) {
        scrollByStep(dir);
        holdTimer = setTimeout(() => {
            holdInterval = setInterval(() => scrollByStep(dir), 40);
        }, 300);
    }

    /** Cancels a scroll-on-hold sequence. */
    function stopHold() {
        clearTimeout(holdTimer);
        clearInterval(holdInterval);
        holdTimer   = null;
        holdInterval = null;
    }

    // Thumb drag: capture start position and enter drag mode.
    const onThumbMouseDown = (e) => {
        e.preventDefault();
        dragging = true;
        startY   = e.clientY;
        startTop = thumb.getBoundingClientRect().top - track.getBoundingClientRect().top;
        thumb.classList.add("dragging");
    };

    // During drag: move thumb and sync viewport scroll position.
    const onMouseMove = (e) => {
        if (!dragging) return;

        const { maxScroll, maxThumbTop } = metrics();
        const nextTop = clamp(startTop + (e.clientY - startY), 0, maxThumbTop);
        thumb.style.top = `${nextTop}px`;

        viewport.scrollTop = maxThumbTop
            ? (nextTop / maxThumbTop) * maxScroll
            : 0;
    };

    const onMouseUp = () => {
        dragging = false;
        thumb.classList.remove("dragging");
        stopHold();
    };

    // Track click: jump up or down by ~90 % of the visible height.
    const onTrackMouseDown = (e) => {
        if (e.target === thumb) return;

        const clickY  = e.clientY - track.getBoundingClientRect().top;
        const thumbMid = thumb.offsetTop + thumb.offsetHeight / 2;

        viewport.scrollTop += clickY < thumbMid
            ? -viewport.clientHeight * 0.9
            :  viewport.clientHeight * 0.9;

        paintSoon();
    };

    const onViewportScroll = () => paint();
    const onWindowResize   = () => paintSoon();

    thumb.addEventListener("mousedown", onThumbMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);
    track.addEventListener("mousedown", onTrackMouseDown);
    viewport.addEventListener("scroll", onViewportScroll);
    window.addEventListener("resize",   onWindowResize);

    // Wire up arrow buttons with per-button cleanup handles.
    buttons.forEach((btn) => {
        const dir        = Number(btn.dataset.dir);
        const onDown     = () => startHold(dir);
        const onLeave    = () => stopHold();
        const onUpBtn    = () => stopHold();
        const onClickBtn = (e) => e.preventDefault();

        btn.addEventListener("mousedown",  onDown);
        btn.addEventListener("mouseleave", onLeave);
        btn.addEventListener("mouseup",    onUpBtn);
        btn.addEventListener("click",      onClickBtn);

        btn._fakeScrollbarHandlers = { onDown, onLeave, onUpBtn, onClickBtn };
    });

    // Keep thumb in sync when the container or its content resizes.
    const resizeObserver = new ResizeObserver(() => paintSoon());
    resizeObserver.observe(root);
    resizeObserver.observe(track);
    resizeObserver.observe(viewport);

    // Keep thumb in sync when content is added/removed/changed (e.g. recipe load).
    const mutationObserver = new MutationObserver(() => paintSoon());
    mutationObserver.observe(viewport, {
        childList: true,
        subtree: true,
        characterData: true
    });

    // Cleanup: remove every listener and disconnect observers.
    root._fakeScrollbarCleanup = () => {
        thumb.removeEventListener("mousedown", onThumbMouseDown);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup",   onMouseUp);
        track.removeEventListener("mousedown", onTrackMouseDown);
        viewport.removeEventListener("scroll", onViewportScroll);
        window.removeEventListener("resize",   onWindowResize);
        resizeObserver.disconnect();
        mutationObserver.disconnect();

        buttons.forEach((btn) => {
            const h = btn._fakeScrollbarHandlers;
            if (!h) return;
            btn.removeEventListener("mousedown",  h.onDown);
            btn.removeEventListener("mouseleave", h.onLeave);
            btn.removeEventListener("mouseup",    h.onUpBtn);
            btn.removeEventListener("click",      h.onClickBtn);
            delete btn._fakeScrollbarHandlers;
        });
    };

    // Initial paint, with staggered retries to catch late layout passes.
    paintSoon();
    setTimeout(paintSoon, 0);
    setTimeout(paintSoon, 30);
    setTimeout(paintSoon, 120);
}

// ─── createWindow ─────────────────────────────────────────────────────────────

/**
 * Builds a complete window element programmatically and appends it to <body>.
 * Replaces the need to duplicate window chrome HTML in every command file.
 *
 * If a window with this id already exists in the DOM it is returned as-is,
 * so calling createWindow multiple times for the same id is safe.
 *
 * @param {string} id
 * @param {Object} [options]
 * @param {string}   [options.title=""]         Titlebar label text.
 * @param {string}   [options.contentHTML=""]   Inner HTML to place inside .body.
 * @param {string}   [options.className=""]     Extra CSS classes on the root .window div.
 * @param {string}   [options.width]            Inline width (e.g. "640px").
 * @param {string}   [options.height]           Inline height (e.g. "480px").
 * @param {Function} [options.onOpen]           Called each time openWindow() is called on this window.
 * @param {Function} [options.onClose]          Called each time closeWindow() is called on this window.
 * @returns {Element}  The window root element.
 */
export function createWindow(id, options = {}) {
    // Return existing window if already created
    const existing = document.getElementById(id);
    if (existing) return existing;

    const {
        title       = "",
        contentHTML = "",
        className   = "",
        width,
        height,
        onOpen,
        onClose,
    } = options;

    // Build the chrome
    const root = document.createElement("div");
    root.id    = id;
    root.className = ["window", "hidden", className].filter(Boolean).join(" ");
    if (width)  root.style.width  = width;
    if (height) root.style.height = height;

    root.innerHTML = `
        <div class="window-surface">
            <div class="titlebar">
                <span>${title}</span>
                <div class="buttons">
                    <button class="minimize">_</button>
                    <button class="close">X</button>
                </div>
            </div>
            <div class="body">${contentHTML}</div>
            <div class="resize-handle" data-resize></div>
        </div>`;

    document.body.appendChild(root);
    setupWindow(root);

    // Store lifecycle callbacks on the element so openWindow/closeWindow can call them
    if (onOpen)  root._onOpen  = onOpen;
    if (onClose) root._onClose = onClose;

    return root;
}
