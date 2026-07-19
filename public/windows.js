/**
 * windows.js — Window Manager (Streamlined)
 */

const WINDOW_SELECTOR = ".window";
const windowState = new WeakMap();
let activeWindow = null;
let zCounter = 100;
let openCount = 0;
let onFocusChangeCallback = null;

const lazyWindows = new Map();
const loadingPromises = new Map();

export function registerLazyWindow(id, config) {
    lazyWindows.set(id, config);
}

export function ensureWindowCreated(id) {
    if (document.getElementById(id)) {
        return Promise.resolve(document.getElementById(id));
    }

    if (loadingPromises.has(id)) {
        return loadingPromises.get(id);
    }

    const lazyInfo = lazyWindows.get(id);
    if (!lazyInfo) return Promise.resolve(null);

    // Create the window shell synchronously so it is in DOM immediately
    const win = createWindow(id, {
        title: lazyInfo.title,
        contentHTML: `<div class="window-loading-indicator">LOADING MODULE...</div>`,
        className: "loading-template",
        onOpen: lazyInfo.onOpen,
        onClose: lazyInfo.onClose
    });

    const promise = fetch(lazyInfo.url)
        .then(r => r.text())
        .then(html => {
            const body = win.querySelector(".body");
            if (body) body.innerHTML = html;
            win.classList.remove("loading-template");
            win.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
            win.dispatchEvent(new CustomEvent("template-loaded"));
            loadingPromises.delete(id);
            return win;
        })
        .catch(err => {
            console.error(`Failed to load template for ${id}:`, err);
            loadingPromises.delete(id);
            return win;
        });

    loadingPromises.set(id, promise);
    return promise;
}

function closeLightbox() {
    const lightbox = document.getElementById("lightbox");
    const lightboxImg = document.getElementById("lightbox-img");
    if (lightbox) lightbox.hidden = true;
    if (lightboxImg) lightboxImg.src = "";
}

export function setOnFocusChange(fn) {
    onFocusChangeCallback = fn;
}

function notifyFocusChange(host) {
    onFocusChangeCallback?.(host);
}

function getWindowState(root) {
    if (!windowState.has(root)) {
        windowState.set(root, {
            openedOnce: false,
            prevHeight: "",
            acceptsTerminal: false,
            terminalTarget: null
        });
    }
    return windowState.get(root);
}

export function isWindowVisible(root) {
    return !!root && !root.classList.contains("hidden");
}

export function isWindowMinimized(root) {
    return !!root && root.classList.contains("minimized");
}

function ensureWindowSurface(root) {
    if (!root || root.querySelector(":scope > .window-surface")) return;

    const surface = document.createElement("div");
    surface.className = "window-surface";
    while (root.firstChild) {
        surface.appendChild(root.firstChild);
    }
    root.appendChild(surface);
}

function syncWindowTypingMetadata(root) {
    const state = getWindowState(root);
    state.acceptsTerminal = root.hasAttribute("data-accepts-terminal") || !!root.querySelector("[data-terminal-target]");
    state.terminalTarget = root.querySelector("[data-terminal-target]") || root.querySelector(".window-terminal") || null;
}

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

    const host = state.terminalTarget || root.querySelector(".content") || root.querySelector(".body") || null;
    notifyFocusChange(host);
}

function focusWindowIfNeeded(root) {
    if (!root || !isWindowVisible(root) || isWindowMinimized(root)) {
        notifyFocusChange(null);
        return;
    }

    syncWindowTypingMetadata(root);
    const state = getWindowState(root);
    focusTypingHost(state.acceptsTerminal ? root : null);
}

export function syncWindowBackground(root) {
    const surface = root.matches?.(".window-surface, #alert-frame")
        ? root
        : root.querySelector(":scope > .window-surface, :scope > .alert-surface");

    const crt = document.getElementById("crt");
    if (!surface || !crt) return;

    const winRect = surface.getBoundingClientRect();
    const crtRect = crt.getBoundingClientRect();

    surface.style.setProperty("--crt-offset-x", `${crtRect.left - winRect.left}px`);
    surface.style.setProperty("--crt-offset-y", `${crtRect.top - winRect.top}px`);

    // Sync any descendants with class sync-crt-bg
    root.querySelectorAll(".sync-crt-bg").forEach((el) => {
        const elRect = el.getBoundingClientRect();
        el.style.setProperty("--crt-offset-x", `${crtRect.left - elRect.left}px`);
        el.style.setProperty("--crt-offset-y", `${crtRect.top - elRect.top}px`);
    });
}

export function setActiveWindow(root, { focusTyping = false } = {}) {
    if (!root || !isWindowVisible(root) || isWindowMinimized(root)) return;

    activeWindow = root;
    zCounter = Math.min(zCounter + 1, 8000);

    document.querySelectorAll(WINDOW_SELECTOR).forEach((win) => {
        win.classList.toggle("active-window", win === root);
    });

    root.style.position = "fixed";
    root.style.zIndex = String(zCounter);

    const crt = document.getElementById("crt");
    if (root.parentElement === crt) {
        crt.appendChild(root);
    }

    syncWindowBackground(root);

    if (focusTyping) {
        focusTypingHost(root);
    }
}

function clearActiveWindow(root = activeWindow) {
    if (root && activeWindow === root) {
        activeWindow = null;
    }
    document.querySelectorAll(WINDOW_SELECTOR).forEach((win) => {
        win.classList.remove("active-window");
    });
}

function applyInitialWindowPosition(root) {
    const state = getWindowState(root);
    root.style.position = "fixed";

    const offsetX = 32;
    const offsetY = 24;
    const crt = document.getElementById("crt");
    const crtRect = crt?.getBoundingClientRect();
    const margin = 16;

    const width = root.offsetWidth || 640;
    const height = root.offsetHeight || 480;

    let left = (crtRect ? crtRect.left + (crtRect.width - width) / 2 : 0) + openCount * offsetX;
    let top = (crtRect ? crtRect.top + (crtRect.height - height) / 2 : 0) + openCount * offsetY;

    const anchor = activeWindow && activeWindow !== root && isWindowVisible(activeWindow) && !isWindowMinimized(activeWindow)
        ? activeWindow
        : [...document.querySelectorAll(WINDOW_SELECTOR)]
            .filter(win => win !== root && isWindowVisible(win) && !isWindowMinimized(win))
            .sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0))
            .at(-1);

    if (anchor) {
        const anchorLeft = parseFloat(anchor.style.left);
        const anchorTop = parseFloat(anchor.style.top);
        const anchorRect = anchor.getBoundingClientRect();

        left = (Number.isFinite(anchorLeft) ? anchorLeft : anchorRect.left) + offsetX;
        top = (Number.isFinite(anchorTop) ? anchorTop : anchorRect.top) + offsetY;
    }

    if (crtRect) {
        const minLeft = crtRect.left + margin;
        const minTop = crtRect.top + margin;
        const maxLeft = Math.max(minLeft, crtRect.right - width - margin);
        const maxTop = Math.max(minTop, crtRect.bottom - height - margin);

        left = Math.max(minLeft, Math.min(left, maxLeft));
        top = Math.max(minTop, Math.min(top, maxTop));
    }

    const visibleWindows = [...document.querySelectorAll(WINDOW_SELECTOR)]
        .filter(win => win !== root && isWindowVisible(win) && !isWindowMinimized(win));

    let tries = 0;
    while (tries < 20 && visibleWindows.some(win => {
        const r = win.getBoundingClientRect();
        const wl = Number.isFinite(parseFloat(win.style.left)) ? parseFloat(win.style.left) : r.left;
        const wt = Number.isFinite(parseFloat(win.style.top)) ? parseFloat(win.style.top) : r.top;
        return Math.abs(wl - left) < 20 && Math.abs(wt - top) < 20;
    })) {
        left += offsetX;
        top += offsetY;

        if (crtRect) {
            const minLeft = crtRect.left + margin;
            const minTop = crtRect.top + margin;
            const maxLeft = Math.max(minLeft, crtRect.right - width - margin);
            const maxTop = Math.max(minTop, crtRect.bottom - height - margin);

            if (left > maxLeft) left = minLeft;
            if (top > maxTop) top = minTop;
        }
        tries++;
    }

    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;

    state.openedOnce = true;
    openCount++;
}

export function openWindow(idOrRoot, options = {}) {
    const id = typeof idOrRoot === "string" ? idOrRoot : idOrRoot?.id;
    if (id && !document.getElementById(id)) {
        ensureWindowCreated(id);
    }

    const root = typeof idOrRoot === "string" ? document.getElementById(idOrRoot) : idOrRoot;
    if (!root) return null;

    ensureWindowSurface(root);
    syncWindowTypingMetadata(root);

    const wasHidden = root.classList.contains("hidden");
    const wasMinimized = root.classList.contains("minimized");

    root.classList.remove("hidden");
    root.style.display = "";

    if (wasMinimized) {
        const state = getWindowState(root);
        root.classList.remove("minimized");
        root.style.height = state.prevHeight || "";
    }

    if (wasHidden) {
        getWindowState(root).openedOnce = false;
        applyInitialWindowPosition(root);
    }

    root.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
    setActiveWindow(root, { focusTyping: options.focusTyping ?? true });

    requestAnimationFrame(() => {
        syncWindowBackground(root);
        requestAnimationFrame(() => syncWindowBackground(root));
    });

    root._onOpen?.();
    return root;
}

export function closeWindow(idOrRoot) {
    const root = typeof idOrRoot === "string" ? document.getElementById(idOrRoot) : idOrRoot;
    if (!root) return;

    root.classList.add("hidden");
    root.classList.remove("active-window");
    root._onClose?.();

    if (activeWindow === root) {
        clearActiveWindow(root);
        notifyFocusChange(null);
    }
}

export function minimizeWindow(idOrRoot) {
    const root = typeof idOrRoot === "string" ? document.getElementById(idOrRoot) : idOrRoot;
    if (!root) return;

    const state = getWindowState(root);

    if (!root.classList.contains("minimized")) {
        state.prevHeight = root.style.height;
        root.classList.add("minimized");
        root.style.height = "auto";

        if (activeWindow === root) {
            clearActiveWindow(root);
            notifyFocusChange(null);
        }
    } else {
        root.classList.remove("minimized");
        root.style.height = state.prevHeight || "";
        syncWindowBackground(root);
        setActiveWindow(root, { focusTyping: state.acceptsTerminal });
    }
}

export function setupWindow(root) {
    if (!root) return () => {};

    ensureWindowSurface(root);
    syncWindowTypingMetadata(root);
    syncWindowBackground(root);

    if (!root.style.zIndex) {
        root.style.zIndex = "1";
    }

    const titlebar = root.querySelector(".titlebar");
    const minimizeBtn = root.querySelector(".minimize");
    const closeBtn = root.querySelector(".close");
    const resizeHandle = root.querySelector("[data-resize]");

    let dragging = false;
    let resizing = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;
    let startWidth = 0, startHeight = 0;

    let updateScheduled = false;
    let nextLeft = 0, nextTop = 0;
    let nextWidth = 0, nextHeight = 0;

    const onWindowMouseDown = () => {
        if (!isWindowVisible(root) || isWindowMinimized(root)) return;
        setActiveWindow(root, { focusTyping: false });
    };

    const updateWindowPosition = () => {
        if (!dragging) {
            updateScheduled = false;
            return;
        }
        root.style.left = `${nextLeft}px`;
        root.style.top = `${nextTop}px`;
        syncWindowBackground(root);
        updateScheduled = false;
    };

    const updateWindowSize = () => {
        if (!resizing) {
            updateScheduled = false;
            return;
        }
        root.style.width = `${nextWidth}px`;
        root.style.height = `${nextHeight}px`;
        syncWindowBackground(root);
        root.querySelectorAll("[data-scrollbox]").forEach(setupFakeScrollbar);
        updateScheduled = false;
    };

    const onMouseDown = (e) => {
        if (e.target.closest("button") || e.target.closest(".buttons")) return;

        setActiveWindow(root, { focusTyping: false });
        dragging = true;

        const rect = root.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        document.body.style.userSelect = "none";
    };

    const onResizeMouseDown = (e) => {
        setActiveWindow(root, { focusTyping: false });
        resizing = true;

        const rect = root.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startWidth = rect.width;
        startHeight = rect.height;

        document.body.style.userSelect = "none";
        e.preventDefault();
        e.stopPropagation();
    };

    const onMouseMove = (e) => {
        if (dragging) {
            nextLeft = startLeft + (e.clientX - startX);
            nextTop = startTop + (e.clientY - startY);
            if (!updateScheduled) {
                updateScheduled = true;
                requestAnimationFrame(updateWindowPosition);
            }
        }

        if (resizing) {
            nextWidth = Math.max(320, startWidth + (e.clientX - startX));
            nextHeight = Math.max(220, startHeight + (e.clientY - startY));
            if (!updateScheduled) {
                updateScheduled = true;
                requestAnimationFrame(updateWindowSize);
            }
        }
    };

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

    const onClick = (e) => {
        if (!isWindowVisible(root) || isWindowMinimized(root)) return;

        setActiveWindow(root, { focusTyping: false });

        const inTypingRegion = e.target.closest("[data-terminal-target]") || e.target.closest(".window-terminal");
        if (inTypingRegion) {
            focusTypingHost(root);
            return;
        }

        const state = getWindowState(root);
        if (state.acceptsTerminal && !e.target.closest(".titlebar")) {
            focusTypingHost(root);
        }
    };

    const onBlogImageClick = (e) => {
        const img = e.target.closest(".scrollbox-content img");
        if (!img) return;
        openLightbox(img);
    };

    const lightbox = document.getElementById("lightbox");
    const lightboxImg = document.getElementById("lightbox-img");

    const openLightbox = (img) => {
        if (!lightboxImg || !lightbox) return;
        lightboxImg.src = img.dataset.full || img.src;
        lightboxImg.alt = img.alt || "";
        lightbox.hidden = false;
    };

    const onLightboxClick = (e) => {
        if (e.target === lightbox || e.target === lightboxImg) {
            closeLightbox();
        }
    };

    if (lightbox) {
        lightbox.addEventListener("click", onLightboxClick);
    }

    const onResize = () => syncWindowBackground(root);

    titlebar?.addEventListener("mousedown", onMouseDown);
    resizeHandle?.addEventListener("mousedown", onResizeMouseDown);
    root.addEventListener("mousedown", onWindowMouseDown);
    root.addEventListener("click", onClick);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    minimizeBtn?.addEventListener("click", onMinimize);
    closeBtn?.addEventListener("click", onClose);
    window.addEventListener("resize", onResize);
    document.addEventListener("click", onBlogImageClick);

    return () => {
        titlebar?.removeEventListener("mousedown", onMouseDown);
        resizeHandle?.removeEventListener("mousedown", onResizeMouseDown);
        root.removeEventListener("mousedown", onWindowMouseDown);
        root.removeEventListener("click", onClick);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        minimizeBtn?.removeEventListener("click", onMinimize);
        closeBtn?.removeEventListener("click", onClose);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("click", onBlogImageClick);
        if (lightbox) {
            lightbox.removeEventListener("click", onLightboxClick);
        }
    };
}

function handleEscapeKey(event) {
    if (event.key !== "Escape" || !activeWindow) return;
    if (!isWindowVisible(activeWindow) || isWindowMinimized(activeWindow)) return;

    const liveInput = document.querySelector('[contenteditable="true"]');
    const state = getWindowState(activeWindow);
    if (document.activeElement === liveInput && !state.acceptsTerminal) return;

    const lightbox = document.getElementById("lightbox");
    if (lightbox && !lightbox.hidden) {
        closeLightbox();
        return;
    }

    closeWindow(activeWindow);
}

export function setupGlobalFocusBehavior() {
    const crt = document.getElementById("crt");

    crt?.addEventListener("click", (e) => {
        const clickedWindow = e.target.closest(WINDOW_SELECTOR);
        if (!clickedWindow) {
            clearActiveWindow();
            notifyFocusChange(null);
            return;
        }

        if (clickedWindow.classList.contains("hidden") || clickedWindow.classList.contains("minimized")) {
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

export function setupFakeScrollbar(root) {
    const viewport = root.querySelector("[data-viewport]");
    const track = root.querySelector("[data-track]");
    const thumb = root.querySelector("[data-thumb]");
    const buttons = root.querySelectorAll("[data-dir]");

    if (!viewport || !track || !thumb) return;

    root._fakeScrollbarCleanup?.();

    let dragging = false;
    let startY = 0;
    let startTop = 0;
    let holdTimer = null;
    let holdInterval = null;
    let paintScheduled = false;

    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    function metrics() {
        const trackH = track.clientHeight;
        const viewH = viewport.clientHeight;
        const scrollH = viewport.scrollHeight;
        const maxScroll = Math.max(0, scrollH - viewH);
        const thumbH = maxScroll ? Math.max(24, (viewH / scrollH) * trackH) : trackH;
        const maxThumbTop = Math.max(0, trackH - thumbH);
        return { trackH, viewH, scrollH, maxScroll, thumbH, maxThumbTop };
    }

    function paint() {
        paintScheduled = false;
        const { trackH, viewH, scrollH, maxScroll, thumbH, maxThumbTop } = metrics();

        if (!trackH || !viewH) {
            thumb.style.display = "none";
            return;
        }

        thumb.style.height = `${thumbH}px`;

        if (scrollH <= viewH || !maxScroll) {
            thumb.style.top = "0px";
            thumb.style.display = "none";
            return;
        }

        thumb.style.display = "block";
        thumb.style.visibility = "visible";
        thumb.style.opacity = "1";

        const top = (viewport.scrollTop / maxScroll) * maxThumbTop;
        thumb.style.top = `${top}px`;
    }

    function paintSoon() {
        if (!paintScheduled) {
            paintScheduled = true;
            requestAnimationFrame(paint);
        }
    }

    function scrollByStep(dir) {
        const step = Number(getComputedStyle(root).getPropertyValue("--sb-step")) || 32;
        viewport.scrollTop += step * dir;
        paintSoon();
    }

    function startHold(dir) {
        scrollByStep(dir);
        holdTimer = setTimeout(() => {
            holdInterval = setInterval(() => scrollByStep(dir), 40);
        }, 300);
    }

    function stopHold() {
        clearTimeout(holdTimer);
        clearInterval(holdInterval);
        holdTimer = null;
        holdInterval = null;
    }

    const onThumbMouseDown = (e) => {
        e.preventDefault();
        dragging = true;
        startY = e.clientY;
        startTop = thumb.getBoundingClientRect().top - track.getBoundingClientRect().top;
        thumb.classList.add("dragging");
    };

    const onMouseMove = (e) => {
        if (!dragging) return;

        const { maxScroll, maxThumbTop } = metrics();
        const nextTop = clamp(startTop + (e.clientY - startY), 0, maxThumbTop);
        thumb.style.top = `${nextTop}px`;

        viewport.scrollTop = maxThumbTop ? (nextTop / maxThumbTop) * maxScroll : 0;
    };

    const onMouseUp = () => {
        dragging = false;
        thumb.classList.remove("dragging");
        stopHold();
    };

    const onTrackMouseDown = (e) => {
        if (e.target === thumb) return;

        const clickY = e.clientY - track.getBoundingClientRect().top;
        const thumbMid = thumb.offsetTop + thumb.offsetHeight / 2;

        viewport.scrollTop += clickY < thumbMid ? -viewport.clientHeight * 0.9 : viewport.clientHeight * 0.9;
        paintSoon();
    };

    const onViewportScroll = () => paintSoon();
    const onWindowResize = () => paintSoon();

    thumb.addEventListener("mousedown", onThumbMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    track.addEventListener("mousedown", onTrackMouseDown);
    viewport.addEventListener("scroll", onViewportScroll);
    window.addEventListener("resize", onWindowResize);

    buttons.forEach((btn) => {
        const dir = Number(btn.dataset.dir);
        const onDown = () => startHold(dir);
        const onLeave = () => stopHold();
        const onUpBtn = () => stopHold();
        const onClickBtn = (e) => e.preventDefault();

        btn.addEventListener("mousedown", onDown);
        btn.addEventListener("mouseleave", onLeave);
        btn.addEventListener("mouseup", onUpBtn);
        btn.addEventListener("click", onClickBtn);

        btn._fakeScrollbarHandlers = { onDown, onLeave, onUpBtn, onClickBtn };
    });

    const resizeObserver = new ResizeObserver(() => paintSoon());
    resizeObserver.observe(root);
    resizeObserver.observe(track);
    resizeObserver.observe(viewport);

    const mutationObserver = new MutationObserver(() => paintSoon());
    mutationObserver.observe(viewport, {
        childList: true,
        subtree: true,
        characterData: true
    });

    root._fakeScrollbarCleanup = () => {
        thumb.removeEventListener("mousedown", onThumbMouseDown);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        track.removeEventListener("mousedown", onTrackMouseDown);
        viewport.removeEventListener("scroll", onViewportScroll);
        window.removeEventListener("resize", onWindowResize);
        resizeObserver.disconnect();
        mutationObserver.disconnect();

        buttons.forEach((btn) => {
            const h = btn._fakeScrollbarHandlers;
            if (!h) return;
            btn.removeEventListener("mousedown", h.onDown);
            btn.removeEventListener("mouseleave", h.onLeave);
            btn.removeEventListener("mouseup", h.onUpBtn);
            btn.removeEventListener("click", h.onClickBtn);
            delete btn._fakeScrollbarHandlers;
        });
    };

    paintSoon();
    setTimeout(paintSoon, 0);
    setTimeout(paintSoon, 30);
    setTimeout(paintSoon, 120);
}

export function createWindow(id, options = {}) {
    const existing = document.getElementById(id);
    if (existing) return existing;

    const {
        title = "",
        contentHTML = "",
        className = "",
        width,
        height,
        onOpen,
        onClose,
    } = options;

    const root = document.createElement("div");
    root.id = id;
    root.className = ["window", "hidden", className].filter(Boolean).join(" ");
    if (width) root.style.width = width;
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

    if (onOpen) root._onOpen = onOpen;
    if (onClose) root._onClose = onClose;

    return root;
}
