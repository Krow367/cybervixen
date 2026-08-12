/*
Setup guide for future games:

1. Import what you need:
   import { callDebugger, field, getter, setter, toggleDebugPanel } from "../../hackz/debugger.js";

2. Create the panel after your game state objects exist:

debug = callDebugger({
    title: "foxHound",
    target: () => ({ defaultSettings, ball, paddle, bricks, score, gameOver }),
    fields: [
        setter(
            "ball.speed",
            () => defaultSettings.ball.speed,
            value => {
                const n = Number(value);
                if (!Number.isFinite(n) || n < 0) return;

                defaultSettings.ball.speed = n;

                if (ball) {
                    ball.speed = n;
                    const len = Math.hypot(ball.dx, ball.dy) || 1;
                    ball.dx = (ball.dx / len) * n;
                    ball.dy = (ball.dy / len) * n;
                }
            }
        ),
        field("defaultSettings.ball.maxSpeed", { label: "ball.maxspeed" }),
        field("defaultSettings.paddle.w", { label: "paddle.w" }),
        field("defaultSettings.paddle.speed", { label: "paddle.speed" }),
        getter("score", () => score),
        getter("gameOver", () => gameOver),
    ],
});

3. Add a hotkey somewhere in the game:
   document.addEventListener("keydown", e => {
     if (globalThis.DEBUG && e.code === "KeyP") {
       toggleDebugPanel();
     }
   }, { signal });

4. For plain object properties use field("path.to.value").
   For read-only display use getter("label", () => value).
   For derived/live-controlled values use setter("label", getValue, setValue).

5. target() must return an object containing the variables named in your field paths.
   Example: field("player.speed") requires target() to return { player }.

6. The panel is shared. Each game can call callDebugger(...) with its own fields.
   If a game is restarted, calling callDebugger(...) again refreshes the panel config.
*/

let panelEl = null;
let fieldsEl = null;
let closeBtn = null;
let minBtn = null;
let resizeHandle = null;
let layerEl = null;

let activeConfig = null;
let refreshTimer = null;
let uiController = null;
let built = false;

export function field(path, options = {}) {
    return {
        type: "field",
        path,
        label: options.label ?? path,
        parse: options.parse ?? autoParse,
        format: options.format ?? defaultFormat,
        readonly: options.readonly ?? false,
    };
}

export function getter(label, getValue, options = {}) {
    return {
        type: "getter",
        label,
        getValue,
        format: options.format ?? defaultFormat,
    };
}

export function setter(label, getValue, setValue, options = {}) {
    return {
        type: "setter",
        label,
        getValue,
        setValue,
        parse: options.parse ?? autoParse,
        format: options.format ?? defaultFormat,
        readonly: options.readonly ?? false,
    };
}

function normalizeFields(fields) {
    return fields.map(entry => {
        if (typeof entry === "string") {
            return field(entry);
        }

        if (!entry || typeof entry !== "object") {
            throw new Error("Debugger field entries must be strings or field/getter/setter descriptors.");
        }

        if (entry.type === "field" || entry.type === "getter" || entry.type === "setter") {
            return entry;
        }

        throw new Error(`Unknown debugger field descriptor type: ${entry.type}`);
    });
}

function ensureLayer() {
    layerEl = document.getElementById("debug-layer");

    if (!layerEl) {
        layerEl = document.createElement("div");
        layerEl.id = "debug-layer";
        layerEl.className = "debug-layer";
        document.body.appendChild(layerEl);
    }
}

export function callDebugger({ title = "DEBUG", target = () => ({}), fields = [], pollMs = 120 }) {
    activeConfig = {
        title,
        target,
        fields: normalizeFields(fields),
        pollMs,
    };

    ensurePanel();
    updateTitle();
    renderFields();
    startRefresh();

    return {
        show: showDebugPanel,
        hide: hideDebugPanel,
        toggle: toggleDebugPanel,
        refresh: refreshDebugPanel,
        destroy: destroyDebugPanel,
    };
}

export function createDebugPanel(config) {
    return callDebugger(config);
}

export function refreshDebugPanel() {
    renderFields();
}

export function toggleDebugPanel(force) {
    ensurePanel();
    if (typeof force === "boolean") {
        panelEl.classList.toggle("hidden", !force);
        return;
    }
    panelEl.classList.toggle("hidden");
}

export function showDebugPanel() {
    ensurePanel();
    panelEl.classList.remove("hidden");
}

export function hideDebugPanel() {
    if (panelEl) panelEl.classList.add("hidden");
}

export function destroyDebugPanel() {
    stopRefresh();

    if (uiController) {
        uiController.abort();
        uiController = null;
    }

    if (panelEl) {
        panelEl.remove();
    }

    panelEl = null;
    fieldsEl = null;
    closeBtn = null;
    minBtn = null;
    resizeHandle = null;
    activeConfig = null;
    built = false;
}

function ensurePanel() {
    ensureLayer();

    const existing = document.getElementById("debug-panel");

    if (existing) {
        panelEl = existing;
    } else {
        panelEl = document.createElement("div");
        panelEl.id = "debug-panel";
        panelEl.className = "debug-panel hidden";
        panelEl.innerHTML = `
      <div class="debug-panel-titlebar">
        <div class="debug-panel-title">DEBUG</div>
        <div class="debug-panel-buttons">
          <button type="button" class="debug-panel-min" aria-label="Minimize debug panel">—</button>
          <button type="button" class="debug-panel-close" aria-label="Close debug panel">×</button>
        </div>
      </div>
      <div class="debug-panel-body">
        <div class="debug-panel-fields"></div>
      </div>
      <div class="debug-panel-resize"></div>
    `;
    }

    if (panelEl.parentNode !== layerEl) {
        layerEl.appendChild(panelEl);
    }

    fieldsEl = panelEl.querySelector(".debug-panel-fields");
    closeBtn = panelEl.querySelector(".debug-panel-close");
    minBtn = panelEl.querySelector(".debug-panel-min");
    resizeHandle = panelEl.querySelector(".debug-panel-resize");

    bindPanelEvents();
    built = true;
}

function updateTitle() {
    const titleEl = panelEl?.querySelector(".debug-panel-title");
    if (titleEl && activeConfig?.title) {
        titleEl.textContent = activeConfig.title;
    }
}

function bindPanelEvents() {
    if (uiController) uiController.abort();
    uiController = new AbortController();
    const { signal } = uiController;

    closeBtn?.addEventListener("click", () => {
        hideDebugPanel();
    }, { signal });

    minBtn?.addEventListener("click", () => {
        panelEl.classList.toggle("minimized");
    }, { signal });

    const titlebar = panelEl?.querySelector(".debug-panel-titlebar");
    if (titlebar) {
        enableDrag(panelEl, titlebar, signal);
    }

    if (resizeHandle) {
        enableResize(panelEl, resizeHandle, signal);
    }
}

function renderFields() {
    if (!fieldsEl || !activeConfig) return;

    const preservedInputs = new Map();
    fieldsEl.querySelectorAll("[data-debug-key]").forEach(row => {
        const input = row.querySelector("input");
        if (input === document.activeElement) {
            preservedInputs.set(row.dataset.debugKey, input.value);
        }
    });

    fieldsEl.innerHTML = "";

    activeConfig.fields.forEach((descriptor, index) => {
        const row = document.createElement("div");
        row.className = "debug-panel-row";
        row.dataset.debugKey = descriptor.path ?? descriptor.label ?? String(index);

        const label = document.createElement("label");
        label.className = "debug-panel-label";
        label.textContent = descriptor.label ?? descriptor.path ?? `field-${index}`;

        if (descriptor.type === "getter") {
            const valueEl = document.createElement("div");
            valueEl.className = "debug-panel-value";
            valueEl.textContent = descriptor.format(safeCall(descriptor.getValue));
            row.append(label, valueEl);
            fieldsEl.appendChild(row);
            return;
        }

        const input = document.createElement("input");
        input.className = "debug-panel-input";
        input.type = "text";
        input.spellcheck = false;
        input.autocomplete = "off";

        const currentValue = readDescriptorValue(descriptor);
        const rowKey = row.dataset.debugKey;
        input.value = preservedInputs.has(rowKey)
            ? preservedInputs.get(rowKey)
            : descriptor.format(currentValue);

        if (descriptor.readonly) {
            input.readOnly = true;
        } else {
            input.addEventListener("change", () => {
                writeDescriptorValue(descriptor, input.value);
                input.value = descriptor.format(readDescriptorValue(descriptor));
            });

            input.addEventListener("keydown", e => {
                if (e.key !== "Enter") return;
                writeDescriptorValue(descriptor, input.value);
                input.value = descriptor.format(readDescriptorValue(descriptor));
                input.blur();
            });
        }

        row.append(label, input);
        fieldsEl.appendChild(row);
    });
}

function readDescriptorValue(descriptor) {
    if (descriptor.type === "field") {
        return getValueByPath(activeConfig.target(), descriptor.path);
    }
    if (descriptor.type === "setter") {
        return safeCall(descriptor.getValue);
    }
    if (descriptor.type === "getter") {
        return safeCall(descriptor.getValue);
    }
    return undefined;
}

function writeDescriptorValue(descriptor, rawValue) {
    const currentValue = readDescriptorValue(descriptor);
    let parsed;

    try {
        parsed = descriptor.parse(rawValue, currentValue);
    } catch (err) {
        console.warn(`debugger parse failed for "${descriptor.label ?? descriptor.path}"`, err);
        return false;
    }

    if (descriptor.type === "field") {
        const ok = setValueByPath(activeConfig.target(), descriptor.path, parsed);
        if (!ok) {
            console.warn(`debugger set failed for "${descriptor.path}"`);
        }
        return ok;
    }

    if (descriptor.type === "setter") {
        try {
            descriptor.setValue(parsed, currentValue);
            return true;
        } catch (err) {
            console.warn(`debugger custom setter failed for "${descriptor.label}"`, err);
            return false;
        }
    }

    return false;
}

function getValueByPath(root, path) {
    if (!root || !path) return undefined;

    return path.split(".").reduce((obj, key) => {
        if (obj == null) return undefined;
        return Reflect.get(obj, key);
    }, root);
}

function setValueByPath(root, path, value) {
    if (!root || !path) return false;

    const parts = path.split(".");
    const last = parts.pop();
    if (!last) return false;

    let obj = root;
    for (const key of parts) {
        obj = Reflect.get(obj, key);
        if (obj == null) return false;
    }

    return Reflect.set(obj, last, value);
}

function startRefresh() {
    stopRefresh();
    if (!activeConfig) return;

    refreshTimer = window.setInterval(() => {
        refreshVisibleValues();
    }, activeConfig.pollMs);
}

function stopRefresh() {
    if (refreshTimer !== null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

function refreshVisibleValues() {
    if (!fieldsEl || !activeConfig || panelEl?.classList.contains("hidden")) return;

    const rows = fieldsEl.querySelectorAll(".debug-panel-row");

    rows.forEach((row, index) => {
        const descriptor = activeConfig.fields[index];
        if (!descriptor) return;

        if (descriptor.type === "getter") {
            const valueEl = row.querySelector(".debug-panel-value");
            if (valueEl) {
                valueEl.textContent = descriptor.format(safeCall(descriptor.getValue));
            }
            return;
        }

        const input = row.querySelector("input");
        if (!input || input === document.activeElement) return;

        input.value = descriptor.format(readDescriptorValue(descriptor));
    });
}

function autoParse(raw, currentValue) {
    const value = String(raw).trim();

    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    if (value === "undefined") return undefined;

    if (value !== "" && !Number.isNaN(Number(value))) {
        return Number(value);
    }

    if (
        (value.startsWith("{") && value.endsWith("}")) ||
        (value.startsWith("[") && value.endsWith("]"))
    ) {
        return JSON.parse(value);
    }

    if (typeof currentValue === "string") return value;
    return value;
}

function defaultFormat(value) {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "function") return "[function]";

    try {
        return String(value);
    } catch {
        return "[unprintable]";
    }
}

function safeCall(fn) {
    try {
        return fn();
    } catch (err) {
        return `[error: ${err.message}]`;
    }
}

function enableDrag(panel, handle, signal) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener("pointerdown", e => {
        if (e.target.closest("button")) return;

        dragging = true;
        handle.setPointerCapture?.(e.pointerId);

        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;

        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";

        e.preventDefault();
    }, { signal });

    handle.addEventListener("pointermove", e => {
        if (!dragging) return;

        const nextLeft = clamp(startLeft + (e.clientX - startX), 0, Math.max(0, window.innerWidth - panel.offsetWidth));
        const nextTop = clamp(startTop + (e.clientY - startY), 0, Math.max(0, window.innerHeight - panel.offsetHeight));

        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
    }, { signal });

    const stop = () => {
        dragging = false;
    };

    handle.addEventListener("pointerup", stop, { signal });
    handle.addEventListener("pointercancel", stop, { signal });
}

function enableResize(panel, grip, signal) {
    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    grip.addEventListener("pointerdown", e => {
        resizing = true;
        grip.setPointerCapture?.(e.pointerId);

        const rect = panel.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startW = rect.width;
        startH = rect.height;

        e.preventDefault();
    }, { signal });

    grip.addEventListener("pointermove", e => {
        if (!resizing) return;

        const rect = panel.getBoundingClientRect();
        const maxWidth = Math.max(260, window.innerWidth - rect.left);
        const maxHeight = Math.max(160, window.innerHeight - rect.top);

        panel.style.width = `${clamp(startW + (e.clientX - startX), 260, maxWidth)}px`;
        panel.style.height = `${clamp(startH + (e.clientY - startY), 160, maxHeight)}px`;
    }, { signal });

    const stop = () => {
        resizing = false;
    };

    grip.addEventListener("pointerup", stop, { signal });
    grip.addEventListener("pointercancel", stop, { signal });
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}