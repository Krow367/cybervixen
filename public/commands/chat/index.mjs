import { openWindow } from "../../io.js";
import { type } from "../../io.js";

// Audio Synth for dial-up connection sound
function playDialUpSound() {
    if (localStorage.getItem("chat_mute") === "true") return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    let time = ctx.currentTime;

    function playDualTone(f1, f2, start, duration, volume = 0.08) {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.setValueAtTime(f1, start);
        osc2.frequency.setValueAtTime(f2, start);
        osc1.type = 'sine';
        osc2.type = 'sine';

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.01);
        gain.gain.setValueAtTime(volume, start + duration - 0.01);
        gain.gain.linearRampToValueAtTime(0, start + duration);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(start);
        osc2.start(start);
        osc1.stop(start + duration);
        osc2.stop(start + duration);
    }

    const dtmf = {
        '7': [852, 1209],
        '0': [941, 1336],
        '9': [852, 1477],
        '3': [697, 1477]
    };

    // 1. Dial tone (350 & 440 Hz)
    playDualTone(350, 440, time, 0.6, 0.05);
    time += 0.7;

    // 2. DTMF dialing "7093" (cyber digit)
    const digits = ['7', '0', '9', '3'];
    digits.forEach((d) => {
        const [f1, f2] = dtmf[d];
        playDualTone(f1, f2, time, 0.12, 0.05);
        time += 0.18;
    });
    time += 0.1;

    // 3. Ringback tone (440 + 480 Hz)
    playDualTone(440, 480, time, 0.8, 0.05);
    time += 1.0;

    // 4. Modem handshake (static, scratchy screech + biphase modulation sound)
    const duration = 1.6; // short but intense static handshake
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        // High static noise component mixed with some biphase square/saw harmonics
        const white = Math.random() * 2 - 1;
        // Synthesize standard 56k sounds: carrier screeching and phase shifts
        const screech = Math.sin(i * 0.15) * Math.sin(i * 0.05) > 0 ? 1 : -1;
        data[i] = white * 0.7 + screech * 0.3;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter to make it sound tinny and telephone-like
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, time);
    filter.Q.setValueAtTime(1.5, time);
    // Dynamic sweep to match handshake phase shifts
    filter.frequency.exponentialRampToValueAtTime(800, time + 0.4);
    filter.frequency.exponentialRampToValueAtTime(2200, time + 1.0);
    filter.frequency.exponentialRampToValueAtTime(1200, time + duration);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, time);
    noiseGain.gain.linearRampToValueAtTime(0.06, time + 0.05);
    noiseGain.gain.setValueAtTime(0.06, time + duration - 0.1);
    noiseGain.gain.linearRampToValueAtTime(0, time + duration);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(time);
    noise.stop(time + duration);

    // Add some scratchy, high-frequency sweeps for that genuine handshake screech
    const carrier = ctx.createOscillator();
    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(2200, time);
    carrier.frequency.linearRampToValueAtTime(600, time + 0.5);
    carrier.frequency.linearRampToValueAtTime(1800, time + 1.2);

    // Bandpass the carrier to keep it telefon-like and prevent harsh volume spikes
    const carrierFilter = ctx.createBiquadFilter();
    carrierFilter.type = 'bandpass';
    carrierFilter.frequency.setValueAtTime(1200, time);

    const carrierGain = ctx.createGain();
    carrierGain.gain.setValueAtTime(0, time);
    carrierGain.gain.linearRampToValueAtTime(0.015, time + 0.1);
    // Modulate the carrier volume to make it sound like it's dialing/handshaking
    carrierGain.gain.linearRampToValueAtTime(0.005, time + 0.6);
    carrierGain.gain.linearRampToValueAtTime(0.015, time + 1.0);
    carrierGain.gain.linearRampToValueAtTime(0, time + duration);

    carrier.connect(carrierFilter);
    carrierFilter.connect(carrierGain);
    carrierGain.connect(ctx.destination);

    carrier.start(time);
    carrier.stop(time + duration);
}

// Global reference cache of last seen users from Chattable
let lastSeenUsers = [];

// Helper to generate the dynamic retro CSS data URI incorporating user font selections
async function getDynamicStylesheetUri() {
    let cssText = "";
    try {
        const response = await fetch(window.location.origin + "/commands/chat/chattable-retro.css");
        cssText = await response.text();
    } catch (e) {
        console.error("Failed to load base retro CSS:", e);
    }

    const fontSize = localStorage.getItem("chat_font_size") || "18px";
    const fontStyle = localStorage.getItem("chat_font_style") || "'VT323', monospace";

    // Set dynamic theme color based on page state
    const isAmber = document.documentElement.getAttribute("data-theme") === "amber";
    const phosphorColor = isAmber ? "#ffb000" : "#5bf870";

    // Replace green phosphor hex code globally with current theme hex color
    cssText = cssText.replace(/#5bf870/gi, phosphorColor);

    const overrides = `
        body, html, #background, #app, .chat-container, .main-container, .text, .msg-text, .message-content, .msgBody, input, textarea, .text-input, #input, .input, button, .send-btn, #send, .btn {
            font-size: ${fontSize} !important;
            font-family: ${fontStyle} !important;
        }
    `;

    const combinedCss = cssText + "\n" + overrides;
    const base64Css = btoa(unescape(encodeURIComponent(combinedCss)));
    return "data:text/css;charset=utf-8;base64," + base64Css;
}

export default async function () {
    // Dial up connection text response
    await type("CONNECTING TO CYBERNET CHATROOM...");
    playDialUpSound();
    await type("CARRIER DETECTED. PROTOCOL IRC-v3 ACTIVE.\nWELCOME TO SERENITY RELAY CHAT.");

    const win = openWindow("chat");
    if (win) {
        initChatWindow(win);
    }
    return {};
}

function initChatWindow(win) {
    const iframe = win.querySelector("#chattable");

    const onUsersUpdate = (list) => {
        lastSeenUsers = list ? (Array.isArray(list) ? list : Object.values(list)) : [];
        renderUserList(win, lastSeenUsers);
    };

    const loadAndInit = () => {
        // Set real chat ID URL on the iframe to initiate loading
        iframe.src = "https://iframe.chat/embed?chat=39818112";

        getDynamicStylesheetUri()
            .then(stylesheetDataUri => {
                const params = { stylesheet: stylesheetDataUri };
                const isLibInitialized = window.chattable && typeof window.chattable === 'object' && window.chattable.settings && window.chattable.settings.initialized;

                if (isLibInitialized) {
                    window.chattable.reinitialize(params);
                    // Clear previous connection handler to prevent duplicates
                    window.chattable.off("connection", onUsersUpdate);
                    window.chattable.on("connection", onUsersUpdate);
                } else {
                    window.chattable.initialize(params).then(() => {
                        window.chattable.on("connection", onUsersUpdate);
                        // NOTE: do NOT auto-call setName here — it triggers a
                        // browser confirmation popup on every page load. Name
                        // changes are only pushed when the user saves settings.
                    });
                }
            })
            .catch(err => {
                console.error("Failed to load retro CSS data URI:", err);
                const isLibInitialized = window.chattable && typeof window.chattable === 'object' && window.chattable.settings && window.chattable.settings.initialized;

                if (isLibInitialized) {
                    window.chattable.off("connection", onUsersUpdate);
                    window.chattable.on("connection", onUsersUpdate);
                } else {
                    window.chattable.initialize().then(() => {
                        window.chattable.on("connection", onUsersUpdate);
                    });
                }
            });
    };

    // Load main.min.js dynamically if not present (checking for initialize method to avoid ID clashes)
    const isLibraryLoaded = window.chattable && typeof window.chattable === 'object' && typeof window.chattable.initialize === 'function';
    if (!isLibraryLoaded) {
        const script = document.createElement("script");
        script.src = "https://iframe.chat/scripts/main.min.js";
        script.onload = loadAndInit;
        document.head.appendChild(script);
    } else {
        loadAndInit();
    }

    // Scroll capture: prevent the page from scrolling when hovering over the chat.
    // The scroll overlay sits above the iframe. Normally it's pointer-events:none so
    // clicks go through to the iframe. We intercept wheel events at the win level.
    const scrollOverlay = win.querySelector("#chat-scroll-overlay");

    // Intercept all wheel events at the window element level
    win.addEventListener("wheel", (e) => {
        // Allow native scrolling inside the settings panel
        if (e.target.closest("#chat-settings-view")) return;
        // Prevent the page from scrolling
        e.preventDefault();
        e.stopPropagation();
        // Forward scroll direction into the iframe via postMessage (best-effort)
        try {
            iframe.contentWindow?.postMessage({
                type: "chattable-scroll",
                deltaY: e.deltaY,
                deltaX: e.deltaX
            }, "*");
        } catch (_) { }
    }, { passive: false });

    // Bind settings buttons and view toggling
    const btnSettings = win.querySelector("#chat-btn-settings");
    const btnSave = win.querySelector("#chat-btn-save");
    const roomView = win.querySelector("#chat-room-view");
    const settingsView = win.querySelector("#chat-settings-view");

    if (btnSettings && btnSave && roomView && settingsView) {
        btnSettings.onclick = () => {
            // Load settings into inputs
            win.querySelector("#setting-nickname").value = localStorage.getItem("chat_nick") || "";
            win.querySelector("#setting-pfp").value = localStorage.getItem("chat_pfp") || "";
            win.querySelector("#setting-website").value = localStorage.getItem("chat_website") || "";
            win.querySelector("#setting-bio").value = localStorage.getItem("chat_bio") || "";
            win.querySelector("#setting-mute").checked = localStorage.getItem("chat_mute") === "true";
            win.querySelector("#setting-overlay-scan").checked = localStorage.getItem("chat_overlay_scan") === "true";
            win.querySelector("#setting-font-size").value = localStorage.getItem("chat_font_size") || "18px";
            win.querySelector("#setting-font-style").value = localStorage.getItem("chat_font_style") || "'VT323', monospace";

            // Hide corner button when settings are shown
            btnSettings.style.display = "none";

            roomView.style.display = "none";
            settingsView.style.display = "block";
        };

        btnSave.onclick = () => {
            // Save inputs to settings
            const nick = win.querySelector("#setting-nickname").value.trim();
            const pfp = win.querySelector("#setting-pfp").value.trim();
            const website = win.querySelector("#setting-website").value.trim();
            const bio = win.querySelector("#setting-bio").value.trim();
            const mute = win.querySelector("#setting-mute").checked;
            const overlay = win.querySelector("#setting-overlay-scan").checked;
            const fontSize = win.querySelector("#setting-font-size").value;
            const fontStyle = win.querySelector("#setting-font-style").value;

            // Only call setName if the nickname actually changed
            const prevNick = localStorage.getItem("chat_nick") || "";

            localStorage.setItem("chat_nick", nick);
            localStorage.setItem("chat_pfp", pfp);
            localStorage.setItem("chat_website", website);
            localStorage.setItem("chat_bio", bio);
            localStorage.setItem("chat_mute", mute ? "true" : "false");
            localStorage.setItem("chat_overlay_scan", overlay ? "true" : "false");
            localStorage.setItem("chat_font_size", fontSize);
            localStorage.setItem("chat_font_style", fontStyle);

            // Only propagate nickname change if it actually changed
            if (nick && nick !== prevNick && window.chattable && typeof window.chattable.setName === 'function') {
                window.chattable.setName(nick);
            }

            // Apply style configurations
            applyStyleSettings(win);

            // Re-render user list
            renderUserList(win, lastSeenUsers);

            // Show corner button again and switch back to chat view
            btnSettings.style.display = "";
            settingsView.style.display = "none";
            roomView.style.display = "block";
        };
    }

    // Apply Styles and Render User List on load
    applyStyleSettings(win);
    renderUserList(win, lastSeenUsers);

    // Register onClose hook on the window node to disconnect chat
    win._onClose = () => {
        if (iframe) {
            iframe.src = "about:blank";
        }
    };

    // Escape key: close profile popup first, then show exit confirmation for the window
    setupChatEscapeHandling(win);
}

/**
 * Sets up escape key handling for the chat window:
 * - If profile popup is open → close just the popup
 * - Otherwise → show exit confirmation (first press), close on second press
 *   The close button directly closes without confirmation.
 */
function setupChatEscapeHandling(win) {
    let escapeConfirmPending = false;
    let escapeConfirmTimer = null;

    const onKeyDown = (e) => {
        if (e.key !== "Escape") return;
        // Only act when the chat window is visible
        if (win.classList.contains("hidden")) return;

        // 1. If profile popup is open, close it and swallow the event
        const popup = win.querySelector("#user-profile-popup");
        if (popup && popup.style.display !== "none") {
            popup.style.display = "none";
            e.stopImmediatePropagation();
            return;
        }

        // 2. Prevent propagation so the global escape handler (windows.js) doesn't also fire
        e.stopImmediatePropagation();

        if (escapeConfirmPending) {
            // Second press: actually close the window
            clearTimeout(escapeConfirmTimer);
            escapeConfirmPending = false;
            hideEscapeConfirm(win);
            // Import closeWindow indirectly via the title bar close button click
            const closeBtn = win.querySelector(".close");
            if (closeBtn) {
                // Temporarily mark this as a programmatic close so no confirm triggers
                win._programmaticClose = true;
                closeBtn.click();
                win._programmaticClose = false;
            }
        } else {
            // First press: show confirmation, auto-clear after 3s
            escapeConfirmPending = true;
            showEscapeConfirm(win);
            escapeConfirmTimer = setTimeout(() => {
                escapeConfirmPending = false;
                hideEscapeConfirm(win);
            }, 3000);
        }
    };

    // Click anywhere on the page or window while confirm is showing cancels the confirm
    const onGlobalClick = (e) => {
        if (escapeConfirmPending) {
            // Don't cancel if they're clicking the confirmation bar itself
            if (e.target.closest("#chat-escape-confirm")) return;
            escapeConfirmPending = false;
            clearTimeout(escapeConfirmTimer);
            hideEscapeConfirm(win);
        }
    };

    // When the user clicks the iframe, the main window blurs.
    // Catch this blur event to also cancel the confirm!
    const onWindowBlur = () => {
        if (!escapeConfirmPending) return;
        // Wait briefly to check if focus shifted
        setTimeout(() => {
            escapeConfirmPending = false;
            clearTimeout(escapeConfirmTimer);
            hideEscapeConfirm(win);
        }, 100);
    };

    document.addEventListener("keydown", onKeyDown, true); // capture phase, before windows.js
    document.addEventListener("click", onGlobalClick, true); // capture phase to catch everything
    window.addEventListener("blur", onWindowBlur);

    // Patch the close button to bypass the confirmation (direct click = immediate close)
    const closeBtn = win.querySelector(".close");
    if (closeBtn) {
        const origHandler = closeBtn.onclick;
        // The actual close is handled by windows.js setupWindow; we don't interfere
        // Just make sure escape confirm is cleared if close button clicked directly
        closeBtn.addEventListener("click", () => {
            escapeConfirmPending = false;
            clearTimeout(escapeConfirmTimer);
            hideEscapeConfirm(win);
        }, true);
    }

    // Cleanup when window is closed
    const origOnClose = win._onClose;
    win._onClose = () => {
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("click", onGlobalClick, true);
        window.removeEventListener("blur", onWindowBlur);
        clearTimeout(escapeConfirmTimer);
        origOnClose?.();
    };
}

function showEscapeConfirm(win) {
    let bar = win.querySelector("#chat-escape-confirm");
    if (!bar) {
        bar = document.createElement("div");
        bar.id = "chat-escape-confirm";
        bar.style.cssText = `
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 9000;
            background: rgba(0,0,0,0.92);
            border-top: 2px solid var(--phosphor);
            color: var(--phosphor);
            font-family: 'VT323', monospace;
            font-size: 1.2rem;
            text-align: center;
            padding: 8px 12px;
            text-shadow: 0 0 6px var(--phosphor);
            letter-spacing: 0.07em;
            pointer-events: auto;
            animation: textShadow 1.5s infinite;
        `;
        bar.textContent = "[ PRESS ESC AGAIN TO EXIT SRC.EXE  ·  CLICK ANYWHERE TO CONTINUE ]";
        // Append inside the window-surface so it sits in the correct stacking context
        const surface = win.querySelector(".window-surface") || win;
        surface.appendChild(bar);
    }
    bar.style.display = "block";
}

function hideEscapeConfirm(win) {
    const bar = win.querySelector("#chat-escape-confirm");
    if (bar) bar.style.display = "none";
}

function applyStyleSettings(win) {
    const overlay = localStorage.getItem("chat_overlay_scan") === "true";
    const fontSize = localStorage.getItem("chat_font_size") || "18px";
    const fontStyle = localStorage.getItem("chat_font_style") || "'VT323', monospace";

    // Overlay scanlines: toggle brings window ABOVE scanlines (z-index > 9999)
    if (overlay) {
        win.classList.add("overlay-scanline");
    } else {
        win.classList.remove("overlay-scanline");
    }

    // Apply inline fonts and sizes to the window layout
    win.style.fontSize = fontSize;
    win.style.fontFamily = fontStyle;

    // Trigger reinitialization of styles inside iframe dynamically
    const isLibInitialized = window.chattable && typeof window.chattable === 'object' && window.chattable.settings && window.chattable.settings.initialized;
    if (isLibInitialized) {
        getDynamicStylesheetUri().then(stylesheetDataUri => {
            window.chattable.reinitialize({ stylesheet: stylesheetDataUri });
        });
    }
}

function renderUserList(win, usersList = []) {
    const container = win.querySelector("#chat-user-list");
    if (!container) return;

    container.innerHTML = "";

    // Always include local user in list at top
    const localNick = localStorage.getItem("chat_nick") || (window.chattable && window.chattable.user ? window.chattable.user.name : null) || "Guest";
    const localPfp = localStorage.getItem("chat_pfp") || "";
    const localWebsite = localStorage.getItem("chat_website") || "";
    const localBio = localStorage.getItem("chat_bio") || "Just connected to the cyber matrix.";

    const renderedUsers = [];
    renderedUsers.push({ name: localNick + " (You)", pfp: localPfp, website: localWebsite, bio: localBio, isSelf: true });

    // Format and append connected users from Chattable
    const list = usersList ? (Array.isArray(usersList) ? usersList : Object.values(usersList)) : [];
    list.forEach(user => {
        let userName = "";
        if (typeof user === "string") {
            userName = user;
        } else if (user && typeof user === "object") {
            userName = user.name || user.username || "";
        }

        // Avoid adding the local user twice
        const apiName = window.chattable && window.chattable.user ? window.chattable.user.name : "";
        if (userName && userName.toLowerCase() !== localNick.toLowerCase() && userName.toLowerCase() !== (apiName || "").toLowerCase()) {
            renderedUsers.push(typeof user === "string" ? { name: user } : user);
        }
    });

    renderedUsers.forEach(user => {
        const userName = user.name || "Anonymous";
        const item = document.createElement("div");
        item.className = "user-item";
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.justifyContent = "space-between";
        item.style.padding = "6px 8px";
        item.style.borderBottom = "1px solid rgba(91, 248, 112, 0.15)";
        item.style.gap = "8px";
        item.style.cursor = "pointer";

        const leftSide = document.createElement("div");
        leftSide.style.display = "flex";
        leftSide.style.alignItems = "center";
        leftSide.style.gap = "6px";
        leftSide.style.overflow = "hidden";

        if (user.pfp) {
            const img = document.createElement("img");
            img.src = user.pfp;
            img.style.width = "20px";
            img.style.height = "20px";
            img.style.borderRadius = "50%";
            img.style.objectFit = "cover";
            img.style.border = "1px solid var(--phosphor)";
            leftSide.appendChild(img);
        } else {
            const placeholder = document.createElement("span");
            placeholder.textContent = "[>]";
            placeholder.style.fontSize = "0.9em";
            placeholder.style.opacity = "0.7";
            leftSide.appendChild(placeholder);
        }

        const nameSpan = document.createElement("span");
        nameSpan.textContent = userName;
        nameSpan.style.whiteSpace = "nowrap";
        nameSpan.style.textOverflow = "ellipsis";
        nameSpan.style.overflow = "hidden";
        leftSide.appendChild(nameSpan);

        item.appendChild(leftSide);

        const iconsDiv = document.createElement("div");
        iconsDiv.style.display = "flex";
        iconsDiv.style.gap = "4px";
        iconsDiv.style.alignItems = "center";

        // Website badge: terminal-style [URL] in black on green
        if (user.website) {
            const webLink = document.createElement("a");
            webLink.href = user.website;
            webLink.target = "_blank";
            webLink.title = "Visit user website: " + user.website;
            webLink.textContent = "[URL]";
            webLink.style.cssText = `
                text-decoration: none;
                font-size: 0.75em;
                font-family: 'VT323', monospace;
                color: #000;
                background: var(--phosphor);
                padding: 0 3px;
                border: 1px solid var(--phosphor);
                letter-spacing: 0.02em;
                line-height: 1.2;
                display: inline-block;
            `;
            webLink.onclick = (e) => e.stopPropagation();
            iconsDiv.appendChild(webLink);
        }

        // Bio badge: terminal-style [PRF] in phosphor outline, clickable
        if (user.bio) {
            const infoSpan = document.createElement("span");
            infoSpan.textContent = "[PRF]";
            infoSpan.title = "View profile";
            infoSpan.style.cssText = `
                font-size: 0.75em;
                font-family: 'VT323', monospace;
                color: var(--phosphor);
                border: 1px solid var(--phosphor);
                padding: 0 3px;
                letter-spacing: 0.02em;
                line-height: 1.2;
                display: inline-block;
                cursor: pointer;
                opacity: 0.8;
            `;
            iconsDiv.appendChild(infoSpan);

            item.onclick = () => {
                toggleUserProfilePopup(win, user, item);
            };
        }

        item.appendChild(iconsDiv);
        container.appendChild(item);
    });
}

/**
 * Toggles the user profile popup: if it's already showing for this user, hide it.
 * If showing for a different user, or hidden, show it for the new user.
 */
function toggleUserProfilePopup(win, user, anchorItem) {
    let popup = win.querySelector("#user-profile-popup");

    // If popup is open and currently showing this same user, close it
    if (popup && popup.style.display !== "none" && popup._currentUser === user.name) {
        popup.style.display = "none";
        popup._currentUser = null;
        return;
    }

    if (!popup) {
        popup = document.createElement("div");
        popup.id = "user-profile-popup";
        // Transparent retro-terminal popup matching window transparency aesthetic
        popup.style.cssText = `
            position: absolute;
            bottom: 50px;
            left: 10px;
            right: 10px;
            z-index: 100;
            padding: 10px;
            overflow: hidden;
            isolation: isolate;
            border: 2px solid var(--phosphor);
            box-shadow: 0 0 12px rgba(91, 248, 112, 0.3);
        `;

        // Pseudo-transparent background surface (matches .window-surface::before pattern)
        const surface = document.createElement("div");
        surface.className = "popup-bg-surface";
        surface.style.cssText = `
            position: absolute;
            inset: 0;
            z-index: -1;
            background-image: var(--crt-phosphor), linear-gradient(#041106, #041106);
            background-repeat: no-repeat, no-repeat;
            background-size: 100vw 100vh, 100vw 100vh;
            background-position: var(--crt-offset-x, 0px) var(--crt-offset-y, 0px),
                                 var(--crt-offset-x, 0px) var(--crt-offset-y, 0px);
            pointer-events: none;
        `;
        popup.appendChild(surface);

        win.appendChild(popup);
    }

    popup.style.display = "block";
    popup._currentUser = user.name;

    // Remove old content (keep the bg surface)
    const bgSurface = popup.querySelector(".popup-bg-surface");
    popup.innerHTML = "";
    if (bgSurface) popup.appendChild(bgSurface);

    // Build popup content
    const content = document.createElement("div");
    content.style.cssText = "position: relative; z-index: 1; color: var(--phosphor); font-family: 'VT323', monospace; text-shadow: 0 0 3px var(--phosphor);";
    content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--phosphor); padding-bottom:4px; margin-bottom:6px;">
            <strong style="text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(user.name)}</strong>
            <button id="close-profile-popup" style="background:transparent; border:1px solid var(--phosphor); color:var(--phosphor); cursor:pointer; font-family:inherit; font-size:1em; padding: 0 6px; line-height:1.4;">[X]</button>
        </div>
        <div style="display:flex; gap:10px; align-items:flex-start;">
            ${user.pfp
            ? `<img src="${escapeHtml(user.pfp)}" style="width:50px; height:50px; border: 1px solid var(--phosphor); object-fit:cover; flex-shrink:0;">`
            : `<div style="width:50px; height:50px; border:1px dashed var(--phosphor); display:grid; place-items:center; font-size:1.4em; flex-shrink:0;">[>]</div>`
        }
            <div style="flex:1; min-width:0;">
                <p style="margin:0 0 6px 0; font-size:1em; word-break:break-word;">${escapeHtml(user.bio || "No profile bio available.")}</p>
                ${user.website ? `<a href="${escapeHtml(user.website)}" target="_blank" style="color:var(--phosphor); text-decoration:underline; font-size:0.9em; word-break:break-all;">${escapeHtml(user.website)}</a>` : ''}
            </div>
        </div>
    `;
    popup.appendChild(content);

    popup.querySelector("#close-profile-popup").onclick = () => {
        popup.style.display = "none";
        popup._currentUser = null;
    };

    // Sync the pseudo-transparent background offset
    syncPopupBackground(popup);
}

/** Simple HTML escaper to prevent XSS in user-provided content */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Syncs the popup's fake-transparent background so it lines up with
 * the CRT background behind it, matching the window transparency system.
 */
function syncPopupBackground(popup) {
    const surface = popup.querySelector(".popup-bg-surface");
    const crt = document.getElementById("crt");
    if (!surface || !crt) return;

    const popupRect = popup.getBoundingClientRect();
    const crtRect = crt.getBoundingClientRect();

    surface.style.setProperty("--crt-offset-x", `${crtRect.left - popupRect.left}px`);
    surface.style.setProperty("--crt-offset-y", `${crtRect.top - popupRect.top}px`);
    // Also update the CSS custom properties directly on the surface
    surface.style.backgroundPosition = `${crtRect.left - popupRect.left}px ${crtRect.top - popupRect.top}px, ${crtRect.left - popupRect.left}px ${crtRect.top - popupRect.top}px`;
}
