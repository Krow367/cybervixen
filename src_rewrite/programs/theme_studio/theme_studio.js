/**
 * theme_studio.js — foxOS Phosphor Matrix Calibration Studio (THEME.EXE)
 * 
 * Provides an authentic 1981 CRT Hardware Calibrator GUI with:
 * - 100% CRT-Themed Custom Retro Dropdowns (No OS/Browser-default menus)
 * - Target Channel Switching: Primary Phosphor, Cathode Tube Glow, and Cathode Tube Base
 * - Pure Retro RGB Hardware Channel Sliders
 * - 12-Chip Phosphor Matrix Preset Grid
 * - Monospace Typography Selector with VT323 default
 * - Real-Time CRT Monitor Live Preview with Window Frame & Cathode Glow feedback
 * - Direct Save & Global Persistence
 */

import { openWindow } from "../../core/windows.js";
import { getAllThemes, createCustomTheme, applyTheme, getSavedTheme, PHOSPHOR_THEMES } from "../../core/themes.js";
import { setupScrollbar } from "../../core/scrollbar.js";

export const RETRO_FONTS = [
    { id: "vt323", name: "DEC VT220 Terminal ('VT323') [DEFAULT]", family: "'VT323', monospace" },
    { id: "space-mono", name: "Serenity Modern ('Space Mono')", family: "'Space Mono', monospace" },
    { id: "share-tech", name: "IBM PC / Teletext ('Share Tech Mono')", family: "'Share Tech Mono', monospace" },
    { id: "courier", name: "DECwriter Teleprinter ('Courier Prime')", family: "'Courier Prime', monospace" },
    { id: "fira-code", name: "Silicon Graphics ('Fira Code')", family: "'Fira Code', monospace" }
];

export const PHOSPHOR_PRESETS = [
    { id: "green", name: "P39 GREEN", hex: "#5bf870", glowHex: "#052714", baseHex: "#020902", isFactory: true },
    { id: "amber", name: "P40 AMBER", hex: "#ffe562", glowHex: "#281e05", baseHex: "#020100", isFactory: true },
    { id: "cyan", name: "P4 CYAN-ICE", hex: "#64d8ff", glowHex: "#021a24", baseHex: "#01080d", isFactory: true },
    { id: "crimson", name: "CRIMSON", hex: "#ff4d4d", glowHex: "#240404", baseHex: "#080101", isFactory: true },
    { id: "cybervixen", name: "CYBERVIXEN'S", hex: "#b388ff", glowHex: "#47165e", baseHex: "#07050a" },
    { id: "synth-magenta", name: "SYNTH MAGENTA", hex: "#ff71ce", glowHex: "#3d0c2e", baseHex: "#0a0208" },
    { id: "solar-gold", name: "SOLAR GOLD", hex: "#ffd700", glowHex: "#332b00", baseHex: "#080700" },
    { id: "apple-lime", name: "APPLE II LIME", hex: "#33ff33", glowHex: "#042e04", baseHex: "#010801" },
    { id: "c64-lavender", name: "C64 LAVENDER", hex: "#887ecb", glowHex: "#1a1638", baseHex: "#05040d" },
    { id: "plasma-orange", name: "PLASMA ORANGE", hex: "#ff9900", glowHex: "#381c00", baseHex: "#0a0500" },
    { id: "ghost-white", name: "GHOST WHITE", hex: "#e0f8d0", glowHex: "#182414", baseHex: "#040703" },
    { id: "toxic-emerald", name: "TOXIC EMERALD", hex: "#00ff9f", glowHex: "#002e1c", baseHex: "#000805" }
];

function hexToRgb(hex) {
    let clean = hex.replace(/^#/, "");
    if (clean.length === 3) clean = clean.split("").map(c => c + c).join("");
    const num = parseInt(clean, 16) || 0;
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => {
        const h = Math.max(0, Math.min(255, Math.round(x))).toString(16);
        return h.length === 1 ? "0" + h : h;
    }).join("");
}

/**
 * Initializes custom CRT-themed dropdown logic.
 */
function setupRetroDropdown(container, onChange) {
    const btn = container.querySelector(".retro-dropdown-btn");
    const textSpan = container.querySelector(".retro-dropdown-text");
    const items = container.querySelectorAll(".retro-dropdown-item");

    function close() {
        container.classList.remove("open");
    }

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = container.classList.contains("open");
        // Close all other open dropdowns first
        document.querySelectorAll(".retro-dropdown.open").forEach(d => d.classList.remove("open"));
        if (!isOpen) {
            // Intelligent boundary clamping: check space below within viewport
            const rect = container.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 220 && rect.top > spaceBelow) {
                container.classList.add("dropup");
            } else {
                container.classList.remove("dropup");
            }
            container.classList.add("open");
        } else {
            container.classList.remove("open");
        }
    });

    items.forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = item.getAttribute("data-value");
            const label = item.getAttribute("data-label") || item.textContent.trim().replace(/^\[.*?\]\s*/, "").trim();

            items.forEach(i => {
                i.classList.remove("selected");
                const itemText = i.getAttribute("data-label") || i.textContent.trim().replace(/^\[.*?\]\s*/, "").trim();
                i.textContent = `[   ] ${itemText}`;
            });

            item.classList.add("selected");
            item.textContent = `[ * ] ${label}`;
            textSpan.textContent = label;
            close();

            if (onChange) onChange(val, label);
        });
    });

    document.addEventListener("pointerdown", (e) => {
        if (!container.contains(e.target)) close();
    });

    return {
        setValue: (val) => {
            const match = Array.from(items).find(i => i.getAttribute("data-value") === val);
            if (match) {
                const label = match.getAttribute("data-label") || match.textContent.trim().replace(/^\[.*?\]\s*/, "").trim();
                items.forEach(i => {
                    i.classList.remove("selected");
                    const itemText = i.getAttribute("data-label") || i.textContent.trim().replace(/^\[.*?\]\s*/, "").trim();
                    i.textContent = `[   ] ${itemText}`;
                });
                match.classList.add("selected");
                match.textContent = `[ * ] ${label}`;
                textSpan.textContent = label;
            }
        }
    };
}

export function launchThemeStudio(initialThemeId = null) {
    const allThemes = getAllThemes();
    const activeId = initialThemeId || getSavedTheme();
    const current = allThemes[activeId] || allThemes.green;

    // Initial RGB Channel States
    const channels = {
        primary: hexToRgb(current.phosphor.startsWith("#") ? current.phosphor : "#5bf870"),
        tubeGlow: hexToRgb(current.phosphor.startsWith("#") ? current.phosphor : "#5bf870").map(c => Math.round(c * 0.15)),
        tubeBase: [2, 9, 2]
    };

    let activeChannelKey = "primary";
    let selectedFontFamily = RETRO_FONTS[0].family;

    // Build Custom Dropdown items
    const fontDropdownItems = RETRO_FONTS.map((f, idx) => `
        <div class="retro-dropdown-item ${idx === 0 ? 'selected' : ''}" data-value="${f.family}" data-label="${f.name}" style="font-family: ${f.family};">
            [ ${idx === 0 ? '*' : ' '} ] ${f.name}
        </div>
    `).join("");

    const presetChips = PHOSPHOR_PRESETS.map(p => `
        <button class="preset-chip" data-id="${p.id}" data-hex="${p.hex}" data-factory="${p.isFactory ? 'true' : 'false'}" style="background: rgba(0,0,0,0.6); color: ${p.hex}; border: 1px solid ${p.hex}; padding: 0.35rem 0.5rem; font-family: inherit; font-size: 0.9em; cursor: pointer; text-shadow: 0 0 6px ${p.hex};">
            ${p.name}
        </button>
    `).join("");

    const layout = `
        <div class="theme-studio-layout" style="display: flex; height: 100%; width: 100%; min-height: 0; font-size: clamp(1.1rem, 1.6vmin, 1.35rem);">
            <!-- Left Column: Live CRT Preview Screen with Custom Hardware Scrollbar -->
            <div class="studio-preview-col" style="flex: 1; border-right: 1px solid rgba(var(--phosphor-rgb), 0.4); overflow: hidden;">
                <div class="scrollbox" data-scrollbox>
                    <div class="scrollbox-viewport" data-viewport style="padding: 1.2rem; display: flex; flex-direction: column; gap: 1rem;">
                        <div style="font-size: 1.2rem; font-weight: bold; border-bottom: 1px solid rgba(var(--phosphor-rgb), 0.4); padding-bottom: 0.4rem; letter-spacing: 1px;">
                            CRT REAL-TIME PREVIEW
                        </div>

                        <div id="preview-screen" style="flex: 1; min-height: 260px; padding: 1.2rem; border: 1px solid var(--phosphor); background: var(--boot); position: relative; display: flex; flex-direction: column; gap: 0.75rem; overflow: hidden; box-shadow: inset 0 0 12px rgba(0,0,0,0.85); transition: background 0.1s ease;">
                            <div style="font-size: 1.4rem; font-weight: bold;">SERENITY OS 1981 // PHOSPHOR MATRIX</div>
                            <div style="opacity: 0.85; line-height: 1.5;">The quick brown fox jumps over the CRT cathode beam. Hardware register parity test passed.</div>
                            
                            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                                <span style="opacity: 0.75;">FOXOS:/USERS/CYBERVIXEN></span>
                                <span>RUN MATRIX_TEST</span>
                                <span class="preview-cursor" style="display: inline-block; width: 0.45em; height: 1em; background: var(--phosphor); box-shadow: var(--cursor-glow); vertical-align: -0.1em; animation: hardwareCursor 1s step-end infinite;"></span>
                            </div>

                            <!-- Mini Window Frame Preview with Real-Time Color Feedback -->
                            <div id="preview-window-box" style="margin-top: 0.75rem; border: 1px solid var(--phosphor); background: rgba(var(--phosphor-rgb), 0.15); padding: 0.75rem; box-shadow: 0 0 8px rgba(var(--phosphor-rgb), 0.3); color: var(--phosphor);">
                                <div style="font-weight: bold; margin-bottom: 0.3rem;">[WINDOW FRAME SAMPLE]</div>
                                <div style="font-size: 0.95em; opacity: 0.85;">Border Alpha: rgba(--phosphor-rgb, 0.4)</div>
                            </div>
                        </div>

                        <!-- 12-Chip Preset Palette Grid -->
                        <div>
                            <div style="font-size: 1.05rem; opacity: 0.8; margin-bottom: 0.5rem; letter-spacing: 1px;">QUICK PHOSPHOR PRESETS:</div>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.4rem;">
                                ${presetChips}
                            </div>
                        </div>
                    </div>
                    <div class="scrollbar" data-scrollbar>
                        <button class="scrollbar-btn up" data-dir="-1" aria-label="Scroll Up"></button>
                        <div class="scrollbar-track" data-track>
                            <div class="scrollbar-thumb" data-thumb></div>
                        </div>
                        <button class="scrollbar-btn down" data-dir="1" aria-label="Scroll Down"></button>
                    </div>
                </div>
            </div>

            <!-- Right Column: Retro Hardware Calibration Sliders with Custom Hardware Scrollbar -->
            <div class="studio-controls-col" style="flex: 1.1; overflow: hidden;">
                <div class="scrollbox" data-scrollbox>
                    <div class="scrollbox-viewport" data-viewport style="padding: 1.2rem; display: flex; flex-direction: column; gap: 1rem;">
                        <div style="font-size: 1.2rem; font-weight: bold; border-bottom: 1px solid rgba(var(--phosphor-rgb), 0.4); padding-bottom: 0.4rem; letter-spacing: 1px;">
                            HARDWARE CALIBRATION CONTROLS
                        </div>

                        <!-- Theme Identifier -->
                        <div class="setting-group">
                            <label>THEME IDENTIFIER</label>
                            <input type="text" id="studio-theme-name" class="setting-input" value="${current.isCustom ? current.id : 'my-custom-theme'}" placeholder="e.g. synthwave, cyber-amber">
                        </div>

                        <!-- Target Channel Dropdown + RGB Sliders -->
                        <div class="setting-group" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(var(--phosphor-rgb), 0.3); padding: 0.85rem;">
                            <!-- Custom Retro Channel Dropdown -->
                            <div style="margin-bottom: 0.75rem;">
                                <label style="font-weight: bold; display: block; margin-bottom: 0.3rem;">TARGET CALIBRATION CHANNEL:</label>
                                <div class="retro-dropdown" id="dropdown-channel">
                                    <button class="retro-dropdown-btn">
                                        <span class="retro-dropdown-text">1. PRIMARY PHOSPHOR (Text, Cursor, Borders)</span>
                                        <span class="retro-dropdown-arrow">[ ▼ ]</span>
                                    </button>
                                    <div class="retro-dropdown-menu">
                                        <div class="retro-dropdown-item selected" data-value="primary">[ * ] 1. PRIMARY PHOSPHOR (Text, Cursor, Borders)</div>
                                        <div class="retro-dropdown-item" data-value="tubeGlow">[   ] 2. CATHODE TUBE GLOW (Ambient CRT Backlight)</div>
                                        <div class="retro-dropdown-item" data-value="tubeBase">[   ] 3. CATHODE TUBE BASE (Deep Dark Background)</div>
                                    </div>
                                </div>
                            </div>

                            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem;">
                                <span id="channel-label-text" style="font-size: 0.9em; opacity: 0.8;">PRIMARY CHANNELS</span>
                                <div style="display: flex; gap: 0.4rem; align-items: center;">
                                    <span style="opacity: 0.7;">HEX:</span>
                                    <input type="text" id="studio-hex-input" class="setting-input" style="width: 7rem; padding: 0.2rem 0.4rem; text-transform: uppercase;" value="${rgbToHex(...channels.primary)}">
                                </div>
                            </div>

                            <!-- Red Channel -->
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.4rem;">
                                <span style="width: 3rem; color: #ff5555; font-weight: bold;">[R]</span>
                                <input type="range" id="slider-r" class="setting-slider" min="0" max="255" value="${channels.primary[0]}" style="flex: 1; accent-color: #ff5555;">
                                <span id="val-r" style="width: 2.5rem; text-align: right;">${channels.primary[0]}</span>
                            </div>

                            <!-- Green Channel -->
                            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.4rem;">
                                <span style="width: 3rem; color: #55ff55; font-weight: bold;">[G]</span>
                                <input type="range" id="slider-g" class="setting-slider" min="0" max="255" value="${channels.primary[1]}" style="flex: 1; accent-color: #55ff55;">
                                <span id="val-g" style="width: 2.5rem; text-align: right;">${channels.primary[1]}</span>
                            </div>

                            <!-- Blue Channel -->
                            <div style="display: flex; align-items: center; gap: 0.75rem;">
                                <span style="width: 3rem; color: #55aaff; font-weight: bold;">[B]</span>
                                <input type="range" id="slider-b" class="setting-slider" min="0" max="255" value="${channels.primary[2]}" style="flex: 1; accent-color: #55aaff;">
                                <span id="val-b" style="width: 2.5rem; text-align: right;">${channels.primary[2]}</span>
                            </div>
                        </div>

                        <!-- Glow Intensity Slider -->
                        <div class="setting-group">
                            <div style="display: flex; justify-content: space-between;">
                                <label>PHOSPHOR BLOOM GLOW</label>
                                <span id="glow-val">100%</span>
                            </div>
                            <input type="range" id="studio-glow-slider" class="setting-slider" min="0" max="200" value="100">
                        </div>

                        <!-- Custom Retro Typography Dropdown -->
                        <div class="setting-group">
                            <label>MONOSPACE TYPOGRAPHY ENGINE</label>
                            <div class="retro-dropdown" id="dropdown-font">
                                <button class="retro-dropdown-btn">
                                    <span class="retro-dropdown-text">${RETRO_FONTS[0].name}</span>
                                    <span class="retro-dropdown-arrow">[ ▼ ]</span>
                                </button>
                                <div class="retro-dropdown-menu">
                                    ${fontDropdownItems}
                                </div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
                            <button id="studio-save-btn" class="settings-trigger-btn" style="flex: 1; position: static; text-align: center; padding: 0.6rem;">
                                [SAVE & APPLY THEME]
                            </button>
                            <button id="studio-reset-btn" class="settings-trigger-btn" style="position: static; text-align: center; padding: 0.6rem;">
                                [RESET]
                            </button>
                        </div>
                    </div>
                    <div class="scrollbar" data-scrollbar>
                        <button class="scrollbar-btn up" data-dir="-1" aria-label="Scroll Up"></button>
                        <div class="scrollbar-track" data-track>
                            <div class="scrollbar-thumb" data-thumb></div>
                        </div>
                        <button class="scrollbar-btn down" data-dir="1" aria-label="Scroll Down"></button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const win = openWindow("theme_studio", {
        title: "THEME.EXE // PHOSPHOR MATRIX CALIBRATOR",
        content: layout,
        width: Math.min(1080, Math.round(window.innerWidth * 0.88)),
        height: Math.min(720, Math.round(window.innerHeight * 0.85))
    });

    // Initialize Retro Custom Scrollbars on both columns
    win.querySelectorAll("[data-scrollbox]").forEach(setupScrollbar);

    // Wire Interactive Elements
    const nameInput = win.querySelector("#studio-theme-name");
    const channelLabel = win.querySelector("#channel-label-text");
    const hexInput = win.querySelector("#studio-hex-input");

    const sliderR = win.querySelector("#slider-r");
    const sliderG = win.querySelector("#slider-g");
    const sliderB = win.querySelector("#slider-b");
    const valR = win.querySelector("#val-r");
    const valG = win.querySelector("#val-g");
    const valB = win.querySelector("#val-b");

    const glowSlider = win.querySelector("#studio-glow-slider");
    const glowVal = win.querySelector("#glow-val");

    const previewScreen = win.querySelector("#preview-screen");
    const previewWindowBox = win.querySelector("#preview-window-box");

    const saveBtn = win.querySelector("#studio-save-btn");
    const resetBtn = win.querySelector("#studio-reset-btn");

    function syncSlidersToActiveChannel() {
        const curRgb = channels[activeChannelKey];
        sliderR.value = curRgb[0];
        sliderG.value = curRgb[1];
        sliderB.value = curRgb[2];
        valR.textContent = curRgb[0];
        valG.textContent = curRgb[1];
        valB.textContent = curRgb[2];
        hexInput.value = rgbToHex(...curRgb);
        channelLabel.textContent = `${activeChannelKey.toUpperCase()} CHANNELS`;
    }

    function updatePreview() {
        // Read current slider values into active channel
        const r = parseInt(sliderR.value, 10);
        const g = parseInt(sliderG.value, 10);
        const b = parseInt(sliderB.value, 10);
        channels[activeChannelKey] = [r, g, b];

        valR.textContent = r;
        valG.textContent = g;
        valB.textContent = b;
        hexInput.value = rgbToHex(r, g, b);

        const [pr, pg, pb] = channels.primary;
        const [gr, gg, gb] = channels.tubeGlow;
        const [br, bg, bb] = channels.tubeBase;

        const primaryHex = rgbToHex(pr, pg, pb);
        const baseHex = rgbToHex(br, bg, bb);

        const glowMult = parseInt(glowSlider.value, 10) / 100;
        glowVal.textContent = `${Math.round(glowMult * 100)}%`;

        const phosphorGlow = `0 0 ${Math.round(4 * glowMult)}px rgba(${pr},${pg},${pb}, 0.85), 0 0 ${Math.round(12 * glowMult)}px rgba(${pr},${pg},${pb}, 0.35)`;
        const cursorGlow = `0 0 ${Math.round(6 * glowMult)}px rgba(${pr},${pg},${pb}, 0.9), 0 0 ${Math.round(14 * glowMult)}px rgba(${pr},${pg},${pb}, 0.45)`;
        const tubeGlowGradient = `radial-gradient(ellipse at center, rgba(${gr}, ${gg}, ${gb}, 0.6) 0%, rgba(${gr}, ${gg}, ${gb}, 0.25) 35%, rgba(${br}, ${bg}, ${bb}, 0.95) 100%)`;

        // Inject CSS Variables directly into preview container
        previewScreen.style.setProperty("--phosphor", primaryHex);
        previewScreen.style.setProperty("--phosphor-rgb", `${pr}, ${pg}, ${pb}`);
        previewScreen.style.setProperty("--phosphor-glow", phosphorGlow);
        previewScreen.style.setProperty("--cursor-glow", cursorGlow);
        previewScreen.style.setProperty("--boot", baseHex);
        previewScreen.style.setProperty("--crt-phosphor", tubeGlowGradient);

        // Apply visual updates to preview container
        previewScreen.style.fontFamily = selectedFontFamily;
        previewScreen.style.color = primaryHex;
        previewScreen.style.borderColor = primaryHex;
        previewScreen.style.background = `${tubeGlowGradient}, ${baseHex}`;
        previewScreen.style.textShadow = phosphorGlow;

        // Update mini window frame box directly
        if (previewWindowBox) {
            previewWindowBox.style.borderColor = primaryHex;
            previewWindowBox.style.backgroundColor = `rgba(${pr}, ${pg}, ${pb}, 0.15)`;
            previewWindowBox.style.color = primaryHex;
            previewWindowBox.style.boxShadow = `0 0 8px rgba(${pr}, ${pg}, ${pb}, 0.35)`;
        }

        const cursor = previewScreen.querySelector(".preview-cursor");
        if (cursor) {
            cursor.style.backgroundColor = primaryHex;
            cursor.style.boxShadow = cursorGlow;
        }
    }

    // Initialize Retro Dropdowns
    const channelDropdownEl = win.querySelector("#dropdown-channel");
    setupRetroDropdown(channelDropdownEl, (val) => {
        activeChannelKey = val;
        syncSlidersToActiveChannel();
    });

    const fontDropdownEl = win.querySelector("#dropdown-font");
    setupRetroDropdown(fontDropdownEl, (val) => {
        selectedFontFamily = val;
        updatePreview();
        window.dispatchEvent(new Event("resize"));
    });

    // Sliders input
    sliderR.addEventListener("input", updatePreview);
    sliderG.addEventListener("input", updatePreview);
    sliderB.addEventListener("input", updatePreview);

    // Hex text input sync
    hexInput.addEventListener("input", () => {
        const val = hexInput.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            const [r, g, b] = hexToRgb(val);
            sliderR.value = r;
            sliderG.value = g;
            sliderB.value = b;
            updatePreview();
        }
    });

    // Preset chips click — instantly applies theme globally and updates studio calibration
    win.querySelectorAll(".preset-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const themeId = chip.getAttribute("data-id");
            const preset = PHOSPHOR_PRESETS.find(p => p.id === themeId);
            if (!preset) return;

            const [pr, pg, pb] = hexToRgb(preset.hex);
            const [gr, gg, gb] = hexToRgb(preset.glowHex);
            const [br, bg, bb] = hexToRgb(preset.baseHex);

            channels.primary = [pr, pg, pb];
            channels.tubeGlow = [gr, gg, gb];
            channels.tubeBase = [br, bg, bb];

            if (preset.isFactory) {
                applyTheme(preset.id);
            } else {
                const phosphorRgb = `${pr}, ${pg}, ${pb}`;
                const phosphorGlow = `0 0 4px rgba(${phosphorRgb}, 0.85), 0 0 12px rgba(${phosphorRgb}, 0.35)`;
                const cursorGlow = `0 0 6px rgba(${phosphorRgb}, 0.9), 0 0 14px rgba(${phosphorRgb}, 0.45)`;
                const tubeGlow = `radial-gradient(ellipse at center, rgba(${gr}, ${gg}, ${gb}, 0.6) 0%, rgba(${gr}, ${gg}, ${gb}, 0.25) 35%, rgba(${br}, ${bg}, ${bb}, 0.95) 100%)`;

                createCustomTheme(preset.id, {
                    name: preset.name,
                    phosphor: preset.hex,
                    phosphorRgb,
                    phosphorGlow,
                    cursorGlow,
                    tubeGlow,
                    tubeBase: preset.baseHex
                });
                applyTheme(preset.id);
            }

            nameInput.value = preset.id;
            syncSlidersToActiveChannel();
            updatePreview();
        });
    });

    glowSlider.addEventListener("input", updatePreview);

    // Save & Apply
    saveBtn.addEventListener("click", () => {
        const name = nameInput.value.trim() || "custom";
        const [pr, pg, pb] = channels.primary;
        const [gr, gg, gb] = channels.tubeGlow;
        const [br, bg, bb] = channels.tubeBase;

        const primaryHex = rgbToHex(pr, pg, pb);
        const baseHex = rgbToHex(br, bg, bb);
        const glowMult = parseInt(glowSlider.value, 10) / 100;

        const phosphorGlow = `0 0 ${Math.round(4 * glowMult)}px rgba(${pr},${pg},${pb}, 0.85), 0 0 ${Math.round(12 * glowMult)}px rgba(${pr},${pg},${pb}, 0.35)`;
        const cursorGlow = `0 0 ${Math.round(6 * glowMult)}px rgba(${pr},${pg},${pb}, 0.9), 0 0 ${Math.round(14 * glowMult)}px rgba(${pr},${pg},${pb}, 0.45)`;
        const tubeGlowGradient = `radial-gradient(ellipse at center, rgba(${gr}, ${gg}, ${gb}, 0.6) 0%, rgba(${gr}, ${gg}, ${gb}, 0.25) 35%, rgba(${br}, ${bg}, ${bb}, 0.95) 100%)`;

        // Apply selected retro font across the document
        document.documentElement.style.setProperty("--terminal-font-family", selectedFontFamily);
        try {
            localStorage.setItem("foxos_font_family", selectedFontFamily);
        } catch (e) {}

        // Synthesize full customized theme object
        const theme = createCustomTheme(name, {
            phosphor: primaryHex,
            phosphorRgb: `${pr}, ${pg}, ${pb}`,
            phosphorGlow,
            cursorGlow,
            tubeGlow: tubeGlowGradient,
            tubeBase: baseHex
        });

        applyTheme(theme.id);

        saveBtn.textContent = "[SAVED & ACTIVE!]";
        setTimeout(() => {
            saveBtn.textContent = "[SAVE & APPLY THEME]";
        }, 1500);
    });

    // Reset to defaults
    resetBtn.addEventListener("click", () => {
        channels.primary = [91, 248, 112];
        channels.tubeGlow = [5, 39, 20];
        channels.tubeBase = [2, 9, 2];
        glowSlider.value = "100";
        nameInput.value = "custom-p39";
        selectedFontFamily = RETRO_FONTS[0].family;
        syncSlidersToActiveChannel();
        updatePreview();
    });

    syncSlidersToActiveChannel();
    updatePreview();
}
