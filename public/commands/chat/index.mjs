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

    // 4. Modem handshake screech (filtered noise + frequency sweep)
    const bufferSize = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, time);
    filter.frequency.exponentialRampToValueAtTime(2500, time + 0.8);
    filter.frequency.exponentialRampToValueAtTime(600, time + 1.5);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, time);
    noiseGain.gain.linearRampToValueAtTime(0.05, time + 0.05);
    noiseGain.gain.setValueAtTime(0.05, time + 1.4);
    noiseGain.gain.linearRampToValueAtTime(0, time + 1.5);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(time);
    noise.stop(time + 1.5);

    const sweep = ctx.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(1000, time);
    sweep.frequency.linearRampToValueAtTime(1800, time + 0.4);
    sweep.frequency.linearRampToValueAtTime(700, time + 0.9);
    sweep.frequency.linearRampToValueAtTime(2200, time + 1.4);

    const sweepGain = ctx.createGain();
    sweepGain.gain.setValueAtTime(0, time);
    sweepGain.gain.linearRampToValueAtTime(0.02, time + 0.1);
    sweepGain.gain.setValueAtTime(0.02, time + 1.4);
    sweepGain.gain.linearRampToValueAtTime(0, time + 1.5);

    sweep.connect(sweepGain);
    sweepGain.connect(ctx.destination);

    sweep.start(time);
    sweep.stop(time + 1.5);
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
    await type("CARRIER DETECTED. PROTOCOL IRC-v3 ACTIVE.\nWELCOME TO SERENITY RELAY CHAT (SRC).");

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

                if (window.chattable.settings.initialized) {
                    window.chattable.reinitialize(params);
                    // Clear previous connection handler to prevent duplicates
                    window.chattable.off("connection", onUsersUpdate);
                    window.chattable.on("connection", onUsersUpdate);
                } else {
                    window.chattable.initialize(params).then(() => {
                        window.chattable.on("connection", onUsersUpdate);
                        
                        // If nickname is set, propagate it to Chattable
                        const savedNick = localStorage.getItem("chat_nick");
                        if (savedNick && window.chattable.setName) {
                            window.chattable.setName(savedNick);
                        }
                    });
                }
            })
            .catch(err => {
                console.error("Failed to load retro CSS data URI:", err);
                if (window.chattable.settings.initialized) {
                    window.chattable.off("connection", onUsersUpdate);
                    window.chattable.on("connection", onUsersUpdate);
                } else {
                    window.chattable.initialize().then(() => {
                        window.chattable.on("connection", onUsersUpdate);
                    });
                }
            });
    };

    // Load main.min.js dynamically if not present
    if (!window.chattable) {
        const script = document.createElement("script");
        script.src = "https://iframe.chat/scripts/main.min.js";
        script.onload = loadAndInit;
        document.head.appendChild(script);
    } else {
        loadAndInit();
    }

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

            localStorage.setItem("chat_nick", nick);
            localStorage.setItem("chat_pfp", pfp);
            localStorage.setItem("chat_website", website);
            localStorage.setItem("chat_bio", bio);
            localStorage.setItem("chat_mute", mute ? "true" : "false");
            localStorage.setItem("chat_overlay_scan", overlay ? "true" : "false");
            localStorage.setItem("chat_font_size", fontSize);
            localStorage.setItem("chat_font_style", fontStyle);

            // Propagate nickname change directly to Chattable iframe
            if (nick && window.chattable && window.chattable.setName) {
                window.chattable.setName(nick);
            }

            // Apply style configurations
            applyStyleSettings(win);

            // Re-render user list
            renderUserList(win, lastSeenUsers);

            // Hide settings, show chat room view
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
}

function applyStyleSettings(win) {
    const overlay = localStorage.getItem("chat_overlay_scan") === "true";
    const fontSize = localStorage.getItem("chat_font_size") || "18px";
    const fontStyle = localStorage.getItem("chat_font_style") || "'VT323', monospace";

    // Overlay scanlines
    if (overlay) {
        win.classList.add("overlay-scanline");
    } else {
        win.classList.remove("overlay-scanline");
    }

    // Apply inline fonts and sizes to the window layout
    win.style.fontSize = fontSize;
    win.style.fontFamily = fontStyle;

    // Trigger reinitialization of styles inside iframe dynamically
    if (window.chattable && window.chattable.settings.initialized) {
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
        if (userName && userName.toLowerCase() !== localNick.toLowerCase() && userName.toLowerCase() !== (window.chattable?.user?.name || "").toLowerCase()) {
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
            placeholder.textContent = "👤";
            placeholder.style.fontSize = "14px";
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
        iconsDiv.style.gap = "6px";
        iconsDiv.style.alignItems = "center";

        if (user.website) {
            const webLink = document.createElement("a");
            webLink.href = user.website;
            webLink.target = "_blank";
            webLink.title = "Visit user website";
            webLink.textContent = "🌐";
            webLink.style.textDecoration = "none";
            webLink.style.fontSize = "14px";
            webLink.onclick = (e) => e.stopPropagation();
            iconsDiv.appendChild(webLink);
        }

        if (user.bio) {
            const infoSpan = document.createElement("span");
            infoSpan.textContent = "💬";
            infoSpan.title = "View profile text";
            infoSpan.style.fontSize = "13px";
            iconsDiv.appendChild(infoSpan);

            item.onclick = () => {
                showUserProfilePopup(win, user);
            };
        }

        item.appendChild(iconsDiv);
        container.appendChild(item);
    });
}

function showUserProfilePopup(win, user) {
    let popup = win.querySelector("#user-profile-popup");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "user-profile-popup";
        popup.style.position = "absolute";
        popup.style.bottom = "50px";
        popup.style.left = "10px";
        popup.style.right = "10px";
        popup.style.background = "#000";
        popup.style.border = "2px solid var(--phosphor)";
        popup.style.padding = "10px";
        popup.style.zIndex = "100";
        popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.8)";
        win.appendChild(popup);
    }
    popup.style.display = "block";

    popup.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--phosphor); padding-bottom:4px; margin-bottom:6px;">
            <strong style="text-transform: uppercase;">${user.name}</strong>
            <button id="close-profile-popup" style="background:transparent; border:none; color:var(--phosphor); cursor:pointer; font-weight:bold;">[X]</button>
        </div>
        <div style="display:flex; gap:10px; align-items:flex-start;">
            ${user.pfp ? `<img src="${user.pfp}" style="width:50px; height:50px; border: 1px solid var(--phosphor); object-fit:cover; border-radius:4px;">` : `<div style="width:50px; height:50px; border:1px dashed var(--phosphor); display:grid; place-items:center; font-size:24px;">👤</div>`}
            <div style="flex:1;">
                <p style="margin:0 0 6px 0; font-size:16px; word-break:break-word;">${user.bio || "No profile bio available."}</p>
                ${user.website ? `<a href="${user.website}" target="_blank" style="color:var(--phosphor); text-decoration:underline; font-size:14px;">${user.website}</a>` : ''}
            </div>
        </div>
    `;

    popup.querySelector("#close-profile-popup").onclick = () => {
        popup.style.display = "none";
    };
}
