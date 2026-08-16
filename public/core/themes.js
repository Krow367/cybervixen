/**
 * themes.js — foxOS Phosphor Color Matrix & Custom Theme Synthesizer
 * 
 * Provides:
 * 1. Factory default 1981 hardware phosphor calibrations (P39 Green, P40 Amber, P4 Cyan, Crimson Alert).
 * 2. User-Created Custom Phosphor Themes (create, list, delete, and persist in localStorage).
 * 3. Automatic tube glow, cursor bloom, and cathode base generation from hex/RGB.
 */

const CUSTOM_THEMES_KEY = "foxos_custom_themes";

export const PHOSPHOR_THEMES = {
    // 🟢 Classic 1981 P39 High-Persistence Green
    green: {
        id: "green",
        name: "P39 Green (525nm)",
        phosphor: "#5bf870",
        phosphorRgb: "91, 248, 112",
        phosphorGlow: "0 0 4px rgba(91, 248, 112, 0.85), 0 0 12px rgba(91, 248, 112, 0.35)",
        cursorGlow: "0 0 6px rgba(91, 248, 112, 0.9), 0 0 14px rgba(91, 248, 112, 0.45)",
        tubeGlow: "radial-gradient(ellipse at center, #052714 0%, #052714 25%, rgba(0, 0, 0, 0.3) 100%)",
        tubeBase: "#020902",
        windowTint: "rgba(0, 0, 0, 0.25)"
    },

    // 🟠 Warm 1981 P40 Gas-Discharge Amber
    amber: {
        id: "amber",
        name: "P40 Amber (590nm)",
        phosphor: "rgb(255, 229, 98)",
        phosphorRgb: "255, 229, 98",
        phosphorGlow: "0 0 4px rgba(255, 229, 98, 0.9), 0 0 12px rgba(255, 180, 40, 0.4)",
        cursorGlow: "0 0 6px rgba(255, 229, 98, 0.95), 0 0 14px rgba(255, 180, 40, 0.5)",
        tubeGlow: "radial-gradient(ellipse at center, rgba(12, 10, 1, 0.3) 50%, rgba(0, 0, 0, 0.3) 100%)",
        tubeBase: "#020100",
        windowTint: "rgba(0, 0, 0, 0.25)"
    },

    // 🔵 P4 White / Ice Terminal
    cyan: {
        id: "cyan",
        name: "P4 Cyan-Ice",
        phosphor: "#64d8ff",
        phosphorRgb: "100, 216, 255",
        phosphorGlow: "0 0 4px rgba(100, 216, 255, 0.85), 0 0 12px rgba(100, 216, 255, 0.35)",
        cursorGlow: "0 0 6px rgba(100, 216, 255, 0.9), 0 0 14px rgba(100, 216, 255, 0.45)",
        tubeGlow: "radial-gradient(ellipse at center, #021a24 0%, #010c12 25%, rgba(0, 0, 0, 0.3) 100%)",
        tubeBase: "#01080d",
        windowTint: "rgba(0, 0, 0, 0.25)"
    },

    // 🔴 Serenity Security Alert
    crimson: {
        id: "crimson",
        name: "Security Alert (Crimson)",
        phosphor: "#ff4d4d",
        phosphorRgb: "255, 77, 77",
        phosphorGlow: "0 0 4px rgba(255, 77, 77, 0.9), 0 0 12px rgba(255, 30, 30, 0.4)",
        cursorGlow: "0 0 6px rgba(255, 77, 77, 0.95), 0 0 14px rgba(255, 30, 30, 0.5)",
        tubeGlow: "radial-gradient(ellipse at center, #240404 0%, #120202 25%, rgba(0, 0, 0, 0.3) 100%)",
        tubeBase: "#080101",
        windowTint: "rgba(0, 0, 0, 0.25)"
    }
};

/**
 * Loads custom themes stored in localStorage.
 */
export function getCustomThemes() {
    try {
        return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || "{}");
    } catch {
        return {};
    }
}

/**
 * Gets all themes (factory defaults + user custom themes).
 */
export function getAllThemes() {
    const custom = getCustomThemes();
    return { ...PHOSPHOR_THEMES, ...custom };
}

/**
 * Parses Hex or Color String to RGB array [r, g, b].
 */
function parseColorToRgb(colorStr) {
    // Check for hex
    let hex = colorStr.trim().replace(/^#/, "");
    if (hex.length === 3) {
        hex = hex.split("").map(c => c + c).join("");
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        const num = parseInt(hex, 16);
        return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }
    // Fallback: use canvas context parser
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = colorStr;
    const computed = ctx.fillStyle; // returns #rrggbb
    if (computed && computed.startsWith("#")) {
        return parseColorToRgb(computed);
    }
    return [91, 248, 112]; // Fallback green
}

/**
 * Synthesizes a new custom phosphor theme from a user name and color/config.
 * 
 * @param {string} name - The theme identifier (e.g. "magenta", "synthwave")
 * @param {string|object} colorOrConfig - Hex string or complete theme config object
 */
export function createCustomTheme(name, colorOrConfig) {
    const id = name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
    if (!id) throw new Error("Invalid theme name. Use letters, numbers, and hyphens.");

    let newTheme;

    if (typeof colorOrConfig === "object" && colorOrConfig !== null) {
        newTheme = {
            id,
            name: `Custom (${name.toUpperCase()})`,
            isCustom: true,
            windowTint: "rgba(0, 0, 0, 0.25)",
            ...colorOrConfig
        };
    } else {
        const [r, g, b] = parseColorToRgb(colorOrConfig || "#5bf870");
        const phosphorHex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        const phosphorRgb = `${r}, ${g}, ${b}`;

        // Cathode tube background dark tint (5% luminance)
        const baseR = Math.round(r * 0.05);
        const baseG = Math.round(g * 0.05);
        const baseB = Math.round(b * 0.05);
        const tubeBase = `rgb(${baseR}, ${baseG}, ${baseB})`;

        // Phosphor glow effects
        const phosphorGlow = `0 0 4px rgba(${phosphorRgb}, 0.85), 0 0 12px rgba(${phosphorRgb}, 0.35)`;
        const cursorGlow = `0 0 6px rgba(${phosphorRgb}, 0.9), 0 0 14px rgba(${phosphorRgb}, 0.45)`;
        const tubeGlow = `radial-gradient(ellipse at center, rgba(${baseR * 2}, ${baseG * 2}, ${baseB * 2}, 0.5) 0%, rgba(${baseR}, ${baseG}, ${baseB}, 0.25) 25%, rgba(0, 0, 0, 0.3) 100%)`;

        newTheme = {
            id,
            name: `Custom (${name.toUpperCase()})`,
            isCustom: true,
            phosphor: phosphorHex,
            phosphorRgb,
            phosphorGlow,
            cursorGlow,
            tubeGlow,
            tubeBase,
            windowTint: "rgba(0, 0, 0, 0.25)"
        };
    }

    const customThemes = getCustomThemes();
    customThemes[id] = newTheme;
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes));

    // Dispatch event so UI and settings drawer can refresh immediately
    window.dispatchEvent(new CustomEvent("foxos_themes_updated", { detail: { newTheme } }));

    return newTheme;
}

/**
 * Deletes a user custom theme.
 */
export function deleteCustomTheme(name) {
    const id = name.toLowerCase().trim();
    if (PHOSPHOR_THEMES[id]) {
        throw new Error(`Cannot delete built-in factory theme '${id}'.`);
    }

    const customThemes = getCustomThemes();
    if (!customThemes[id]) {
        throw new Error(`Custom theme '${id}' does not exist.`);
    }

    delete customThemes[id];
    localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(customThemes));

    // If active theme was deleted, fallback to default green
    if (getSavedTheme() === id) {
        applyTheme("green");
    }

    window.dispatchEvent(new CustomEvent("foxos_themes_updated"));
    return true;
}

const CURSOR_CONFIG = {
    default: { src: "/img/curosr.png", fallback: "auto" },
    pointer: { src: "/img/pointer.png", fallback: "pointer" },
    grab: { src: "/img/grab.png", fallback: "grab" },
    grabbing: { src: "/img/grab.png", fallback: "grabbing" },
    resize: { src: "/img/resize.png", fallback: "nwse-resize" },
    text: { src: "/img/ibeam.png", fallback: "text" }
};

const cachedCursorImages = {};
let cursorsPreloadPromise = null;

/**
 * Preloads the exact original PNG cursor images into memory.
 */
function preloadOriginalCursors() {
    if (cursorsPreloadPromise) return cursorsPreloadPromise;
    if (typeof Image === "undefined") return Promise.resolve();

    const promises = Object.entries(CURSOR_CONFIG).map(([key, config]) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                cachedCursorImages[key] = img;
                resolve();
            };
            img.onerror = () => {
                // Fallback to relative path if absolute fails
                const fallbackImg = new Image();
                fallbackImg.onload = () => {
                    cachedCursorImages[key] = fallbackImg;
                    resolve();
                };
                fallbackImg.onerror = () => resolve();
                fallbackImg.src = config.src.replace(/^\//, "./");
            };
            img.src = config.src;
        });
    });

    cursorsPreloadPromise = Promise.all(promises);
    return cursorsPreloadPromise;
}

// Start preloading immediately in browser
if (typeof window !== "undefined") {
    preloadOriginalCursors();
}

/**
 * Dynamically recolors the original PNG cursor image on an in-memory Canvas
 * using the theme's phosphor color matrix.
 */
function recolorCursorImage(key, targetRgb) {
    const img = cachedCursorImages[key];
    const config = CURSOR_CONFIG[key] || CURSOR_CONFIG.default;

    if (!img || !img.complete || img.naturalWidth === 0) {
        return `url("${config.src}"), ${config.fallback}`;
    }

    try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || 24;
        canvas.height = img.naturalHeight || 24;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const [tr, tg, tb] = targetRgb;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a > 10) {
                // If it's a colored phosphor pixel (not pure solid black body)
                if (g > 30 || r > 30 || b > 30) {
                    const lum = Math.max(r, g, b) / 255;
                    data[i] = Math.min(255, Math.round(tr * lum));
                    data[i + 1] = Math.min(255, Math.round(tg * lum));
                    data[i + 2] = Math.min(255, Math.round(tb * lum));
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return `url("${canvas.toDataURL("image/png")}"), ${config.fallback}`;
    } catch (e) {
        return `url("${config.src}"), ${config.fallback}`;
    }
}

/**
 * Updates CSS cursor custom properties across all cursor types.
 */
function applyDynamicCursors(theme) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const rgb = parseColorToRgb(theme.phosphor);

    const apply = () => {
        root.style.setProperty("--cursor-default", recolorCursorImage("default", rgb));
        root.style.setProperty("--cursor-pointer", recolorCursorImage("pointer", rgb));
        root.style.setProperty("--cursor-grab", recolorCursorImage("grab", rgb));
        root.style.setProperty("--cursor-grabbing", recolorCursorImage("grabbing", rgb));
        root.style.setProperty("--cursor-resize", recolorCursorImage("resize", rgb));
        root.style.setProperty("--cursor-text", recolorCursorImage("text", rgb));
    };

    if (cachedCursorImages.default && cachedCursorImages.default.complete) {
        apply();
    } else {
        preloadOriginalCursors().then(apply);
    }
}

/**
 * Applies a theme by ID to the document.
 */
export function applyTheme(themeId = "green") {
    const allThemes = getAllThemes();
    const theme = allThemes[themeId] || allThemes.green;
    const root = document.documentElement;

    // Calculate a brighter tint (towards white) for high-intensity headings and cursors
    const [r, g, b] = parseColorToRgb(theme.phosphor);
    const brightR = Math.min(255, Math.round(r + (255 - r) * 0.55));
    const brightG = Math.min(255, Math.round(g + (255 - g) * 0.55));
    const brightB = Math.min(255, Math.round(b + (255 - b) * 0.55));
    const phosphorBright = `rgb(${brightR}, ${brightG}, ${brightB})`;

    root.style.setProperty("--phosphor", theme.phosphor);
    root.style.setProperty("--phosphor-bright", phosphorBright);
    root.style.setProperty("--phosphor-rgb", theme.phosphorRgb);
    root.style.setProperty("--phosphor-glow", theme.phosphorGlow);
    root.style.setProperty("--cursor-glow", theme.cursorGlow);
    root.style.setProperty("--crt-phosphor", theme.tubeGlow);
    root.style.setProperty("--boot", theme.tubeBase);
    root.style.setProperty("--window-tint", theme.windowTint);
    root.setAttribute("data-theme", theme.id);

    applyDynamicCursors(theme);

    try {
        localStorage.setItem("foxos_theme", theme.id);
    } catch (e) {}

    return theme;
}

/**
 * Gets currently saved theme from localStorage or default.
 */
export function getSavedTheme() {
    try {
        return localStorage.getItem("foxos_theme") || "green";
    } catch {
        return "green";
    }
}
