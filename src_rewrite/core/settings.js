/**
 * settings.js — foxOS Hardware Settings & Accessibility Engine
 * 
 * Manages:
 * 1. Phosphor Theme switching (Built-in & User-Created Themes)
 * 2. Master Audio Volume & Mute (persisted in localStorage)
 * 3. Font Scale (dynamic CSS variable --terminal-font-size)
 * 4. CRT Scanlines & Traveling Beam Toggle
 * 5. Phosphor Bloom / Glow Toggle
 */

import { applyTheme, getAllThemes, getSavedTheme } from "./themes.js";
import { syncVolume } from "./audio.js";

const SETTINGS_KEY = "foxos_system_settings";

export const SOUND_PROFILES = {
    CINEMA: "cinema",   // 1981 Cinema Cyber-Terminal (Alien / WarGames data pulses & keyclicks)
    VT100: "vt100",     // Authentic Hardware (DEC VT100 - silent CRT text, physical speaker clicks)
    SILENT: "silent"    // Essential Only (Games, chat, & alarms only; mutes ambient typing)
};

const defaultSettings = {
    theme: "green",
    volume: 75,
    ambienceVolume: 25,
    keyboardVolume: 40,
    driveVolume: 65,
    systemVolume: 75,
    uiVolume: 50,
    soundProfile: SOUND_PROFILES.CINEMA,
    fontFamily: "'VT323', monospace",
    fontSize: "1.7rem",
    scanlines: true,
    glow: true,
    skipSplash: false,
    rememberMe: false
};

export function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        const savedFont = localStorage.getItem("foxos_font_family");
        const savedSkipSplash = localStorage.getItem("foxos_skip_splash") === "true";
        const savedRememberMe = localStorage.getItem("foxos_remember_me") === "true";
        return {
            ...defaultSettings,
            ...saved,
            fontFamily: savedFont || saved?.fontFamily || defaultSettings.fontFamily,
            skipSplash: savedSkipSplash,
            rememberMe: savedRememberMe,
            theme: getSavedTheme()
        };
    } catch {
        return { ...defaultSettings };
    }
}

export function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        if (settings.fontFamily) {
            localStorage.setItem("foxos_font_family", settings.fontFamily);
        }
        localStorage.setItem("foxos_skip_splash", settings.skipSplash ? "true" : "false");
        localStorage.setItem("foxos_remember_me", settings.rememberMe ? "true" : "false");
    } catch (e) {
        console.error("Failed to save settings:", e);
    }
}

export function applyAllSettings(settings) {
    // 1. Phosphor Theme
    applyTheme(settings.theme);

    // 2. Font Family & Scale
    const activeFont = settings.fontFamily || localStorage.getItem("foxos_font_family") || "'VT323', monospace";
    document.documentElement.style.setProperty("--terminal-font-family", activeFont);
    document.documentElement.style.setProperty("--terminal-font-size", settings.fontSize);

    // 3. Scanlines & Traveling Beam Toggle
    const scanlines = document.querySelector(".scanlines");
    const scanlineBeam = document.querySelector(".scanline-beam");
    if (scanlines) scanlines.style.display = settings.scanlines ? "block" : "none";
    if (scanlineBeam) scanlineBeam.style.display = settings.scanlines ? "block" : "none";

    // 4. Phosphor Bloom / Glow Toggle
    if (settings.glow) {
        document.documentElement.classList.remove("disable-glow");
    } else {
        document.documentElement.classList.add("disable-glow");
    }

    // 5. Audio Volume
    syncVolume();
}

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

/**
 * Initializes the bottom-right [SYSTEM SETTINGS] trigger button and flyout drawer.
 */
export function initSettingsUI() {
    const crt = document.getElementById("crt");
    if (!crt) return;

    let settings = loadSettings();
    applyAllSettings(settings);

    // Create Settings Trigger Button (Docked Bottom Right)
    const trigger = document.createElement("button");
    trigger.id = "settings-trigger";
    trigger.className = "settings-trigger-btn";
    trigger.innerHTML = "[SYSTEM SETTINGS]";
    trigger.setAttribute("aria-label", "Toggle System Settings");
    crt.appendChild(trigger);

    const fontItems = [
        { val: "1.4rem", label: "Compact (1.4 rem)" },
        { val: "1.7rem", label: "Standard (1.7 rem)" },
        { val: "2.0rem", label: "Large (2.0 rem)" },
        { val: "2.3rem", label: "High Visibility (2.3 rem)" }
    ].map(f => {
        const isCur = f.val === settings.fontSize;
        return `
            <div class="retro-dropdown-item ${isCur ? 'selected' : ''}" data-value="${f.val}" data-label="${f.label}">
                ${isCur ? '[ * ]' : '[   ]'} ${f.label}
            </div>
        `;
    }).join("");

    const profileItems = [
        { val: SOUND_PROFILES.CINEMA, label: "Cinema Cyber-Terminal" },
        { val: SOUND_PROFILES.VT100, label: "Vintage DEC VT100" },
        { val: SOUND_PROFILES.SILENT, label: "Essential Alerts Only" }
    ].map(p => {
        const isCur = p.val === (settings.soundProfile || SOUND_PROFILES.CINEMA);
        return `
            <div class="retro-dropdown-item ${isCur ? 'selected' : ''}" data-value="${p.val}" data-label="${p.label}">
                ${isCur ? '[ * ]' : '[   ]'} ${p.label}
            </div>
        `;
    }).join("");

    const activeProfileLabel = {
        [SOUND_PROFILES.CINEMA]: "Cinema Cyber-Terminal",
        [SOUND_PROFILES.VT100]: "Vintage DEC VT100",
        [SOUND_PROFILES.SILENT]: "Essential Alerts Only"
    }[settings.soundProfile || SOUND_PROFILES.CINEMA];

    // Create Settings Flyout Drawer
    const flyout = document.createElement("div");
    flyout.id = "settings-flyout";
    flyout.className = "settings-flyout-drawer";
    flyout.innerHTML = `
        <div class="settings-header">
            <span>SERENITY HARDWARE CONFIG</span>
            <button id="settings-close-btn" class="settings-close" title="Close">[X]</button>
        </div>
        <div class="settings-body">
            <!-- Multi-Bus Audio Channel Mixer -->
            <div class="setting-group">
                <div style="display: flex; justify-content: space-between;">
                    <label for="setting-volume">MASTER GAIN</label>
                    <span id="volume-val">${settings.volume}%</span>
                </div>
                <input type="range" id="setting-volume" class="setting-slider" min="0" max="100" value="${settings.volume}">
            </div>

            <!-- Granular Channel Mixer Group -->
            <div class="setting-group" style="border: 1px dashed rgba(var(--phosphor-rgb), 0.4); padding: 0.6rem 0.8rem; margin-top: 0.2rem; background: rgba(0, 0, 0, 0.3);">
                <div style="font-size: 0.85rem; letter-spacing: 0.15em; margin-bottom: 0.6rem; opacity: 0.9; color: var(--phosphor-bright, #fff); font-weight: bold;">
                    ■ HARDWARE BUS GAIN MATRIX ■
                </div>

                <!-- Ambience Drone Slider -->
                <div style="margin-bottom: 0.6rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                        <label for="setting-ambience">AMBIENT CRT &amp; FAN DRONE</label>
                        <span id="ambience-val">${settings.ambienceVolume ?? 25}%</span>
                    </div>
                    <input type="range" id="setting-ambience" class="setting-slider" min="0" max="100" value="${settings.ambienceVolume ?? 25}">
                </div>

                <!-- Keyboard Keystrokes Slider -->
                <div style="margin-bottom: 0.6rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                        <label for="setting-keyboard">KEYBOARD TACTILE CLICKS</label>
                        <span id="keyboard-val">${settings.keyboardVolume ?? 40}%</span>
                    </div>
                    <input type="range" id="setting-keyboard" class="setting-slider" min="0" max="100" value="${settings.keyboardVolume ?? 40}">
                </div>

                <!-- Disk Drive Stepper Slider -->
                <div style="margin-bottom: 0.6rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                        <label for="setting-drive">DISK SPINDLE &amp; HEAD CHATTER</label>
                        <span id="drive-val">${settings.driveVolume ?? 65}%</span>
                    </div>
                    <input type="range" id="setting-drive" class="setting-slider" min="0" max="100" value="${settings.driveVolume ?? 65}">
                </div>

                <!-- System Chimes & Alerts Slider -->
                <div style="margin-bottom: 0.6rem;">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                        <label for="setting-system">SYSTEM POST &amp; CHIMES</label>
                        <span id="system-val">${settings.systemVolume ?? 75}%</span>
                    </div>
                    <input type="range" id="setting-system" class="setting-slider" min="0" max="100" value="${settings.systemVolume ?? 75}">
                </div>

                <!-- UI Relays Slider -->
                <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem;">
                        <label for="setting-ui">RELAY &amp; WINDOW SOLENOIDS</label>
                        <span id="ui-val">${settings.uiVolume ?? 50}%</span>
                    </div>
                    <input type="range" id="setting-ui" class="setting-slider" min="0" max="100" value="${settings.uiVolume ?? 50}">
                </div>
            </div>

            <!-- Sound Profile Selector -->
            <div class="setting-group">
                <label>AUDIO SOUND PROFILE</label>
                <div class="retro-dropdown" id="settings-dropdown-profile">
                    <button class="retro-dropdown-btn">
                        <span class="retro-dropdown-text">${activeProfileLabel}</span>
                        <span class="retro-dropdown-arrow">[ ▼ ]</span>
                    </button>
                    <div class="retro-dropdown-menu">
                        ${profileItems}
                    </div>
                </div>
            </div>

            <!-- Font Scale -->
            <div class="setting-group">
                <label>TERMINAL FONT SIZE</label>
                <div class="retro-dropdown" id="settings-dropdown-font">
                    <button class="retro-dropdown-btn">
                        <span class="retro-dropdown-text">${settings.fontSize}</span>
                        <span class="retro-dropdown-arrow">[ ▼ ]</span>
                    </button>
                    <div class="retro-dropdown-menu">
                        ${fontItems}
                    </div>
                </div>
            </div>

            <!-- CRT Scanlines Toggle -->
            <div class="setting-group checkbox-group">
                <label for="setting-scanlines">CRT SCANLINE RASTER</label>
                <input type="checkbox" id="setting-scanlines" class="setting-checkbox" ${settings.scanlines ? "checked" : ""}>
            </div>

            <!-- Phosphor Bloom Glow Toggle -->
            <div class="setting-group checkbox-group">
                <label for="setting-glow">PHOSPHOR BEAM BLOOM</label>
                <input type="checkbox" id="setting-glow" class="setting-checkbox" ${settings.glow ? "checked" : ""}>
            </div>

            <!-- Skip Splash Gateway on Boot Toggle -->
            <div class="setting-group checkbox-group">
                <label for="setting-skip-splash">SKIP SPLASH GATEWAY ON BOOT</label>
                <input type="checkbox" id="setting-skip-splash" class="setting-checkbox" ${settings.skipSplash ? "checked" : ""}>
            </div>

            <!-- Auto-Login Saved Operator Toggle -->
            <div class="setting-group checkbox-group">
                <label for="setting-remember-me">AUTO-LOGIN SAVED OPERATOR</label>
                <input type="checkbox" id="setting-remember-me" class="setting-checkbox" ${settings.rememberMe ? "checked" : ""}>
            </div>
        </div>
    `;
    crt.appendChild(flyout);

    // Wire Interactive Controls
    const volumeSlider = flyout.querySelector("#setting-volume");
    const volumeVal = flyout.querySelector("#volume-val");
    const scanlinesCheck = flyout.querySelector("#setting-scanlines");
    const glowCheck = flyout.querySelector("#setting-glow");
    const skipSplashCheck = flyout.querySelector("#setting-skip-splash");
    const rememberMeCheck = flyout.querySelector("#setting-remember-me");
    const closeBtn = flyout.querySelector("#settings-close-btn");

    if (skipSplashCheck) {
        skipSplashCheck.addEventListener("change", (e) => {
            settings.skipSplash = e.target.checked;
            saveSettings(settings);
        });
    }

    if (rememberMeCheck) {
        rememberMeCheck.addEventListener("change", (e) => {
            settings.rememberMe = e.target.checked;
            saveSettings(settings);
        });
    }

    const profileDropdownEl = flyout.querySelector("#settings-dropdown-profile");
    const fontDropdownEl = flyout.querySelector("#settings-dropdown-font");

    setupRetroDropdown(profileDropdownEl, (val) => {
        settings.soundProfile = val;
        saveSettings(settings);
    });

    setupRetroDropdown(fontDropdownEl, (val) => {
        settings.fontSize = val;
        saveSettings(settings);
        applyAllSettings(settings);
    });

    // Toggle Flyout Visibility
    function toggleFlyout(open) {
        const isOpen = open !== undefined ? open : !flyout.classList.contains("open");
        if (isOpen) {
            flyout.classList.add("open");
            trigger.classList.add("active");
        } else {
            flyout.classList.remove("open");
            trigger.classList.remove("active");
        }
    }

    trigger.addEventListener("click", () => toggleFlyout());
    closeBtn.addEventListener("click", () => toggleFlyout(false));

    // Close on outside click
    document.addEventListener("pointerdown", (e) => {
        if (flyout.classList.contains("open") && !flyout.contains(e.target) && !trigger.contains(e.target)) {
            toggleFlyout(false);
        }
    });

    // Volume Change Listeners
    volumeSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        volumeVal.textContent = `${val}%`;
        settings.volume = val;
        saveSettings(settings);
        syncVolume();
    });

    const bindBusSlider = (id, valId, key) => {
        const slider = flyout.querySelector(id);
        const display = flyout.querySelector(valId);
        if (slider && display) {
            slider.addEventListener("input", (e) => {
                const val = parseInt(e.target.value, 10);
                display.textContent = `${val}%`;
                settings[key] = val;
                saveSettings(settings);
                syncVolume();
            });
        }
    };

    bindBusSlider("#setting-ambience", "#ambience-val", "ambienceVolume");
    bindBusSlider("#setting-keyboard", "#keyboard-val", "keyboardVolume");
    bindBusSlider("#setting-drive", "#drive-val", "driveVolume");
    bindBusSlider("#setting-system", "#system-val", "systemVolume");
    bindBusSlider("#setting-ui", "#ui-val", "uiVolume");

    // CRT Scanlines Toggle
    scanlinesCheck.addEventListener("change", (e) => {
        settings.scanlines = e.target.checked;
        saveSettings(settings);
        applyAllSettings(settings);
    });

    // Phosphor Bloom Toggle
    glowCheck.addEventListener("change", (e) => {
        settings.glow = e.target.checked;
        saveSettings(settings);
        applyAllSettings(settings);
    });
}
