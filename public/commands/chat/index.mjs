import { openWindow, type } from "../../io.js";
import pause from "../../pause.js";

let cssCache = null;
const onlineUsers = new Map();

let rawChatCSS = null;
let lastPushedCSS = "";

async function getChatCSS(force = false) {
    if (!rawChatCSS || force) {
        try {
            const res = await fetch("./commands/chat/chat.css?t=" + Date.now());
            rawChatCSS = await res.text();
        } catch (e) {
            console.error("Failed to load chat.css:", e);
            rawChatCSS = "";
        }
    }

    const origin = window.location.origin;
    const isAmber = (localStorage.getItem("theme") || document.documentElement.getAttribute("data-theme")) === "amber";

    const defaultCursor = isAmber ? `${origin}/img/curosr_amber.png` : `${origin}/img/curosr.png`;
    const pointerCursor = isAmber ? `${origin}/img/pointer_amber.png` : `${origin}/img/pointer.png`;

    const themeVariables = isAmber
        ? `:root { --phosphor: rgb(255, 229, 98) !important; --phosphor-rgb: 255, 229, 98 !important; --cursor-default: url("${defaultCursor}"); --cursor-pointer: url("${pointerCursor}"); }\n:root[data-theme="amber"] { --phosphor: rgb(255, 229, 98) !important; --phosphor-rgb: 255, 229, 98 !important; --cursor-default: url("${defaultCursor}"); --cursor-pointer: url("${pointerCursor}"); }\n`
        : `:root { --phosphor: #5bf870 !important; --phosphor-rgb: 91, 248, 112 !important; --cursor-default: url("${defaultCursor}"); --cursor-pointer: url("${pointerCursor}"); }\n`;

    return themeVariables + rawChatCSS;
}

export function syncThemeToIframe(forceRefresh = false) {
    const isAmber = (localStorage.getItem("theme") || document.documentElement.getAttribute("data-theme")) === "amber";
    const iframe = document.getElementById("chattable");
    if (iframe && iframe.contentWindow) {
        try {
            const doc = iframe.contentWindow.document;
            if (doc && doc.documentElement) {
                if (isAmber) {
                    doc.documentElement.setAttribute("data-theme", "amber");
                } else {
                    doc.documentElement.removeAttribute("data-theme");
                }
            }
        } catch (e) {
            try {
                iframe.contentWindow.postMessage({ type: "setTheme", theme: isAmber ? "amber" : "green" }, "*");
            } catch (err) {}
        }
    }
    renderUserList();
    applyCSS(forceRefresh);
}

function applyCSS(force = false) {
    const iframe = document.getElementById("chattable");
    if (!iframe || !iframe.contentWindow) return;

    getChatCSS(force).then(cssText => {
        if (!cssText) return;
        if (!force && cssText === lastPushedCSS) return; // Prevent duplicate postMessage ping-pong loop!
        lastPushedCSS = cssText;

        try {
            iframe.contentWindow.postMessage(cssText, "*");
        } catch (e) {}
        if (window.chattable && typeof window.chattable.sendMessageToFrame === "function") {
            try {
                window.chattable.sendMessageToFrame(cssText);
            } catch (e) {}
        }
    });
}

function addUser(name, extra = {}) {
    if (!name) return;
    const existing = onlineUsers.get(name) || {};
    onlineUsers.set(name, {
        name,
        lastSeen: Date.now(),
        website: extra.website || existing.website || "",
    });
    renderUserList();
}

function processConnectionPayload(payload) {
    if (!payload) return;
    let list = [];
    if (Array.isArray(payload)) {
        list = payload;
    } else if (typeof payload === "object") {
        list = Object.values(payload);
    }
    list.forEach(u => {
        if (!u) return;
        const name = typeof u === "string" ? u : u.name || u.username;
        if (name) addUser(name, typeof u === "object" ? u : {});
    });
    renderUserList();
}

function processMessagePayload(payload) {
    if (!payload) return;
    const name = payload.user || payload.name || payload.sender || (payload.message && payload.message.user);
    if (name) {
        addUser(name);
    }
}

function renderUserList() {
    const listEl = document.getElementById("chat-user-list");
    const badgeEl = document.getElementById("user-count-badge");
    if (!listEl) return;

    const myName = (window.chattable && window.chattable.user && window.chattable.user.name) || localStorage.getItem("name") || "";
    if (myName && !onlineUsers.has(myName)) {
        addUser(myName, { website: localStorage.getItem("website") || "" });
    }

    const now = Date.now();
    const activeThreshold = 10 * 60 * 1000;
    const activeUsers = Array.from(onlineUsers.values()).filter(u => (now - u.lastSeen) < activeThreshold);

    if (badgeEl) {
        badgeEl.textContent = `(${activeUsers.length})`;
    }

    if (activeUsers.length === 0) {
        listEl.innerHTML = '<div class="user-item-loading" style="opacity: 0.6; font-style: italic;">No users detected</div>';
        return;
    }

    const isAmber = (localStorage.getItem("theme") || document.documentElement.getAttribute("data-theme")) === "amber";
    const globeFilter = isAmber
        ? "filter: sepia(100%) hue-rotate(5deg) saturate(350%) brightness(1.05); display: inline-block; opacity: 0.9;"
        : "filter: sepia(100%) hue-rotate(75deg) saturate(300%) brightness(0.95); display: inline-block; opacity: 0.9;";

    listEl.innerHTML = activeUsers.map(u => {
        const isSelf = myName && u.name.toLowerCase() === myName.toLowerCase();
        const isOwner = u.name.toLowerCase() === "cybervixen" || u.name.toLowerCase() === "owner";
        const isMod = !isOwner && (u.name.toLowerCase().includes("mod") || u.name.toLowerCase().includes("admin"));

        let roleBadge = '';
        if (isOwner) {
            roleBadge = ' <small style="color: #FF0000; text-shadow: 0 0 4px #FF0000; font-weight: bold;">[owner]</small>';
        } else if (isMod) {
            roleBadge = ` <small style="color: var(--phosphor); text-shadow: 0 0 3px var(--phosphor); font-weight: bold;">[mod]</small>`;
        }

        const dotColor = isOwner ? '#FF0000' : 'var(--phosphor)';

        const websiteUrl = u.website || (isSelf ? localStorage.getItem("website") : "");
        let siteBtn = "";
        if (websiteUrl) {
            siteBtn = ` <a href="${escapeHTML(websiteUrl)}" target="_blank" rel="noopener" title="Visit ${escapeHTML(u.name)}'s website" style="margin-left: auto; color: var(--phosphor); text-decoration: none; border: 1px solid rgba(var(--phosphor-rgb), 0.5); padding: 0 5px; font-size: 0.8rem; background: rgba(var(--phosphor-rgb), 0.1); border-radius: 2px; flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px;"><span style="${globeFilter}">🌐</span> [SITE]</a>`;
        }

        return `<div class="sidebar-user-item" style="padding: 4px 6px; display: flex; align-items: center; gap: 8px; text-shadow: 0 0 3px var(--phosphor); border-radius: 2px; background: rgba(var(--phosphor-rgb), 0.04);">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${dotColor}; box-shadow: 0 0 5px ${dotColor}; flex-shrink: 0;"></span>
            <span class="user-name" style="word-break: break-word; flex: 1; ${isSelf ? 'font-weight: bold;' : ''}">${escapeHTML(u.name)}${roleBadge}${isSelf ? ' <small style="opacity:0.75;">(You)</small>' : ''}</span>
            ${siteBtn}
        </div>`;
    }).join("");
}

function storeCommandsInFrame() {
    const iframe = document.getElementById("chattable");
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: "storeCommands",
            commands: { img: true, image: true }
        }, "*");
    }
}

function updateHandleInput(name) {
    const val = name || (window.chattable && window.chattable.user && window.chattable.user.name) || localStorage.getItem("name") || "";
    if (val) {
        const input = document.getElementById("setting-handle-input");
        if (input) input.value = val;
    }
    const webInput = document.getElementById("setting-website-input");
    if (webInput) {
        webInput.value = localStorage.getItem("website") || "";
    }
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function safeBase64(str) {
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch {
        return btoa(str);
    }
}

function setupSettingsUI() {
    const toggleBtn = document.getElementById("btn-toggle-settings");
    const settingsPanel = document.getElementById("chat-settings-panel");
    const statusMsg = document.getElementById("settings-status-msg");
    const splashOverlay = document.getElementById("chat-splash-overlay");
    const btnEnterChat = document.getElementById("btn-enter-chat");

    const dismissSplash = () => {
        if (splashOverlay && splashOverlay.style.display !== "none") {
            splashOverlay.style.display = "none";
            blurTerminalInput();
        }
    };

    if (btnEnterChat && splashOverlay && !btnEnterChat._hasClick) {
        btnEnterChat._hasClick = true;
        btnEnterChat.onclick = dismissSplash;
    }

    if (splashOverlay && !splashOverlay._hasKeydown) {
        splashOverlay._hasKeydown = true;
        window.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && splashOverlay && splashOverlay.style.display !== "none") {
                e.preventDefault();
                e.stopPropagation();
                dismissSplash();
            }
        });
    }

    const scanlineToggle = document.getElementById("setting-scanline-toggle");
    const chatWin = document.getElementById("chat");
    const updateScanlineClass = (isOverlayEnabled) => {
        const win = chatWin || document.getElementById("chat");
        if (!win) return;
        if (isOverlayEnabled) {
            win.classList.remove("no-scanline");
        } else {
            win.classList.add("no-scanline");
        }
    };

    if (scanlineToggle && !scanlineToggle._hasScanlineHandler) {
        scanlineToggle._hasScanlineHandler = true;
        const storedScanline = localStorage.getItem("chatScanlines");
        const isEnabled = storedScanline !== "false";
        scanlineToggle.checked = isEnabled;
        updateScanlineClass(isEnabled);

        scanlineToggle.onchange = (e) => {
            const checked = e.target.checked;
            localStorage.setItem("chatScanlines", checked ? "true" : "false");
            updateScanlineClass(checked);
        };
    }

    if (!toggleBtn || !settingsPanel) return;

    if (!toggleBtn._hasToggleHandler) {
        toggleBtn._hasToggleHandler = true;
        let isSettingsOpen = false;

        toggleBtn.onclick = () => {
            const usersHeader = document.getElementById("sidebar-header-users");
            const settingsHeader = document.getElementById("sidebar-header-settings");
            const usersPanel = document.getElementById("chat-user-list");
            const panel = document.getElementById("chat-settings-panel");
            const btn = document.getElementById("btn-toggle-settings");

            isSettingsOpen = !isSettingsOpen;
            if (isSettingsOpen) {
                if (usersHeader) usersHeader.style.display = "none";
                if (usersPanel) usersPanel.style.display = "none";
                if (settingsHeader) settingsHeader.style.display = "flex";
                if (panel) panel.style.display = "flex";
                if (btn) btn.textContent = "[ BACK TO USERS ]";

                updateHandleInput();
                const flairInput = document.getElementById("setting-flair-input");
                if (flairInput) {
                    flairInput.value = localStorage.getItem("flair") || "";
                }
                const websiteInput = document.getElementById("setting-website-input");
                if (websiteInput) {
                    websiteInput.value = localStorage.getItem("website") || "";
                }
            } else {
                if (settingsHeader) settingsHeader.style.display = "none";
                if (panel) panel.style.display = "none";
                if (usersHeader) usersHeader.style.display = "flex";
                if (usersPanel) usersPanel.style.display = "flex";
                if (btn) btn.textContent = "[ SETTINGS ]";
            }
        };
    }

    updateHandleInput();

    const addEnterKeyHandler = (inputId, btnId) => {
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId);
        if (input && btn && !input._hasEnterHandler) {
            input._hasEnterHandler = true;
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    btn.click();
                }
            });
        }
    };

    addEnterKeyHandler("setting-handle-input", "btn-save-handle");
    addEnterKeyHandler("setting-flair-input", "btn-save-flair");
    addEnterKeyHandler("setting-website-input", "btn-save-website");

    const btnSaveHandle = document.getElementById("btn-save-handle");
    if (btnSaveHandle && !btnSaveHandle._hasSaveHandler) {
        btnSaveHandle._hasSaveHandler = true;
        btnSaveHandle.onclick = () => {
            const input = document.getElementById("setting-handle-input");
            const val = input ? input.value.trim() : "";
            if (!val) {
                showStatus("Please enter handle", true);
                return;
            }

            const iframe = document.getElementById("chattable");
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: "setName", value: val }, "*");
            }
            if (window.chattable) {
                window.chattable.sendMessageToFrame({ type: "setName", value: val });
                if (window.chattable.user) window.chattable.user.name = val;
            }
            localStorage.setItem("name", val);
            addUser(val);
            updateHandleInput(val);
            showStatus("Handle updated!");
        };
    }

    const btnSaveFlair = document.getElementById("btn-save-flair");
    if (btnSaveFlair && !btnSaveFlair._hasFlairHandler) {
        btnSaveFlair._hasFlairHandler = true;
        btnSaveFlair.onclick = () => {
            const input = document.getElementById("setting-flair-input");
            const val = input ? input.value.trim() : "";
            
            const iframe = document.getElementById("chattable");
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: "setFlair", flair: val }, "*");
            }
            if (window.chattable) {
                if (typeof window.chattable.setFlair === "function") {
                    window.chattable.setFlair(val);
                } else {
                    window.chattable.sendMessageToFrame({ type: "setFlair", flair: val });
                }
            }
            localStorage.setItem("flair", val);
            showStatus("Flair updated!");
        };
    }

    const btnSaveWebsite = document.getElementById("btn-save-website");
    if (btnSaveWebsite && !btnSaveWebsite._hasWebsiteHandler) {
        btnSaveWebsite._hasWebsiteHandler = true;
        btnSaveWebsite.onclick = () => {
            const input = document.getElementById("setting-website-input");
            let val = input ? input.value.trim() : "";
            if (val && !/^https?:\/\//i.test(val)) {
                val = "https://" + val;
                if (input) input.value = val;
            }
            localStorage.setItem("website", val);

            const currentUser = (window.chattable && window.chattable.user && window.chattable.user.name) || localStorage.getItem("name") || "";
            if (currentUser) {
                addUser(currentUser, { website: val });
            }

            if (window.chattable && typeof window.chattable.sendPayload === "function") {
                window.chattable.sendPayload({ type: "website", url: val, user: currentUser });
            }

            // Set a clean globe flair icon if website is set and no flair is set yet
            if (val && !localStorage.getItem("flair")) {
                const flairVal = "🌐";
                localStorage.setItem("flair", flairVal);
                if (window.chattable && typeof window.chattable.setFlair === "function") {
                    window.chattable.setFlair(flairVal);
                }
            }

            renderUserList();
            showStatus(val ? "Website saved!" : "Website cleared");
        };
    }

    const loginForm = document.getElementById("chat-mod-login-form");
    const performLogin = (e) => {
        if (e) e.preventDefault();
        const emailInput = document.getElementById("setting-mod-email");
        const passInput = document.getElementById("setting-mod-pass");
        const email = emailInput ? emailInput.value.trim() : "";
        const pass = passInput ? passInput.value : "";

        if (!email || !pass) {
            showStatus("Enter email & pass", true);
            return;
        }

        window._awaitingLoginAuth = true;

        const encodedEmail = safeBase64(email);
        const encodedPass = safeBase64(pass);

        const iframe = document.getElementById("chattable");
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: "login",
                a: encodedEmail,
                b: encodedPass
            }, "*");
        }
        if (window.chattable && typeof window.chattable.sendMessageToFrame === "function") {
            window.chattable.sendMessageToFrame({
                type: "login",
                a: encodedEmail,
                b: encodedPass
            });
        }
        showStatus("Authenticating...");
    };

    if (loginForm) {
        loginForm.onsubmit = performLogin;
    }

    const btnModLogout = document.getElementById("btn-mod-logout");
    if (btnModLogout && !btnModLogout._hasLogoutHandler) {
        btnModLogout._hasLogoutHandler = true;
        btnModLogout.onclick = () => {
            localStorage.removeItem("name");
            localStorage.removeItem("flair");
            if (window.chattable && window.chattable.user) {
                window.chattable.user.name = null;
                window.chattable.user.isOwner = false;
                window.chattable.user.isMod = false;
            }
            onlineUsers.clear();

            const handleInput = document.getElementById("setting-handle-input");
            if (handleInput) handleInput.value = "";

            const iframe = document.getElementById("chattable");
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: "logout" }, "*");
            }
            if (window.chattable && typeof window.chattable.sendMessageToFrame === "function") {
                window.chattable.sendMessageToFrame({ type: "logout" });
            }
            showStatus("Logged out.");
        };
    }

    function showStatus(msg, isError = false) {
        if (!statusMsg) return;
        statusMsg.textContent = msg;
        statusMsg.style.color = isError ? "#FF3366" : "var(--phosphor)";
        setTimeout(() => {
            if (statusMsg.textContent === msg) statusMsg.textContent = "";
        }, 5000);
    }

    window.updateSettingsStatus = showStatus;
}

let scriptPromise = null;

function loadChattableScript() {
    if (window.chattable) return Promise.resolve();
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://iframe.chat/scripts/main.min.js";
        script.onload = () => resolve();
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });

    return scriptPromise;
}

export function initChattable() {
    setupSettingsUI();

    const winEl = document.getElementById("chat");
    if (winEl && !winEl._hasTemplateLoadedListener) {
        winEl._hasTemplateLoadedListener = true;
        winEl.addEventListener("template-loaded", () => {
            setupSettingsUI();
            updateHandleInput();
        });
    }

    if (!window._chattableMsgHandlerAdded) {
        window._chattableMsgHandlerAdded = true;
        window.addEventListener("message", (e) => {
            if (!e.data) return;
            if (typeof e.data === "object") {
                switch (e.data.type) {
                    case "init":
                        if (e.data.name) {
                            if (window.chattable && window.chattable.user) {
                                window.chattable.user.name = e.data.name;
                                if (e.data.isOwner) window.chattable.user.isOwner = true;
                                if (e.data.isMod) window.chattable.user.isMod = true;
                            }
                            addUser(e.data.name, { isOwner: e.data.isOwner, isMod: e.data.isMod });
                            updateHandleInput(e.data.name);

                            if (window._awaitingLoginAuth) {
                                window._awaitingLoginAuth = false;
                                if (e.data.name.startsWith("Anonymous")) {
                                    if (window.updateSettingsStatus) {
                                        window.updateSettingsStatus("Login Failed: Reverted to " + e.data.name, true);
                                    }
                                } else {
                                    if (window.updateSettingsStatus) {
                                        window.updateSettingsStatus("Logged in as " + e.data.name);
                                    }
                                }
                            }
                        }
                        break;
                    case "init":
                        syncThemeToIframe();
                        blurTerminalInput();
                        break;
                    case "confirmation":
                        break;
                    case "connection":
                        processConnectionPayload(e.data.value);
                        break;
                    case "payload":
                        if (e.data.value) {
                            try {
                                const parsed = typeof e.data.value === "string" ? JSON.parse(e.data.value) : e.data.value;
                                if (parsed && parsed.type === "website" && parsed.user && parsed.url) {
                                    addUser(parsed.user, { website: parsed.url });
                                }
                            } catch {}
                        }
                        break;
                    case "sendMessage":
                    case "message":
                        processMessagePayload(e.data);
                        break;
                    case "setName":
                    case "updateName":
                        if (e.data.value || e.data.name) {
                            const newName = e.data.value || e.data.name;
                            if (window.chattable && window.chattable.user) {
                                window.chattable.user.name = newName;
                            }
                            addUser(newName);
                            updateHandleInput(newName);
                            if (window.updateSettingsStatus) {
                                window.updateSettingsStatus("Handle: " + newName);
                            }
                        }
                        break;
                }
            }
        });
    }

    loadChattableScript().then(() => {
        const cssURL = new URL("./commands/chat/chat.css", window.location.origin + window.location.pathname).href;
        if (window.chattable) {
            window.chattable.commands = window.chattable.commands || {};
            window.chattable.commands.img = function (fullText) {
                if (!fullText) return;
                let raw = String(fullText).trim();
                let url = raw.replace(/^!img\s*|^!image\s*/i, "").trim();
                if (url) {
                    const markdown = `![Image](${url})`;
                    const iframe = document.getElementById("chattable");
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({ type: "sendMessage", text: markdown }, "*");
                    }
                }
            };
            window.chattable.commands.image = window.chattable.commands.img;

            if (typeof window.chattable.initialize === "function") {
                try {
                    window.chattable.initialize({ stylesheet: cssURL });
                } catch (e) {
                    console.error("Chattable init error:", e);
                }
            }

            storeCommandsInFrame();

            if (typeof window.chattable.on === "function") {
                window.chattable.on("connection", (users) => {
                    processConnectionPayload(users);
                });
                window.chattable.on("message", (msg) => {
                    processMessagePayload(msg);
                });
                window.chattable.on("payload", (data) => {
                    if (data && data.type === "website" && data.user && data.url) {
                        addUser(data.user, { website: data.url });
                    }
                });
            }

            if (window.chattable.user && window.chattable.user.name) {
                addUser(window.chattable.user.name);
                updateHandleInput(window.chattable.user.name);
            }
        }
        applyCSS();
    }).catch(err => {
        console.error("Failed to load Chattable API script:", err);
        applyCSS();
    });

    const iframe = document.getElementById("chattable");
    if (iframe) {
        iframe.onload = () => {
            syncThemeToIframe();
            applyCSS();
            storeCommandsInFrame();
            blurTerminalInput();

            [100, 400, 1000].forEach(delay => {
                setTimeout(() => {
                    syncThemeToIframe();
                    applyCSS();
                }, delay);
            });

            const storedName = localStorage.getItem("name");
            if (storedName) {
                iframe.contentWindow.postMessage({ type: "setName", value: storedName }, "*");
                updateHandleInput(storedName);
            }
        };

        let attempts = 0;
        const interval = setInterval(() => {
            updateHandleInput();
            attempts++;
            if (attempts >= 6) clearInterval(interval);
        }, 500);
    }
}

export function blurTerminalInput() {
    if (document.activeElement && typeof document.activeElement.blur === "function") {
        document.activeElement.blur();
    }
}

export function playModemAudio() {
    try {
        const audio = new Audio("./media/modem.mp3");
        audio.volume = 0.45;
        audio.play().catch(() => {});
        return audio;
    } catch {
        return null;
    }
}

export async function runModemConnectionSequence() {
    playModemAudio();
    await type([
        { kind: "type", text: "Establishing Connection to Serenity Relay Servers.....", wait: 12 },
        { kind: "pause", wait: 1100 },
        { kind: "type", text: "Connection found. Beginning Handshake...", wait: 12 },
        { kind: "pause", wait: 1200 },
        { kind: "type", text: "[!] Warning: Signal intercept in progress...", wait: 12 },
        { kind: "pause", wait: 1100 },
        { kind: "type", text: "[!] Bypassing Serenity daemons...", wait: 12 },
        { kind: "pause", wait: 1100 },
        { kind: "type", text: "Serenity Gateway Dropped.", wait: 12 },
        { kind: "pause", wait: 900 },
        { kind: "type", text: "New connection established: foxNet Relay Node", wait: 12 },
        { kind: "pause", wait: 500 },
        { kind: "type", text: "CyberVixen > Too easy. Welcome to the foxNet, friend.", wait: 12 },
    ]);
}

export default async function () {
    await runModemConnectionSequence();
    openWindow("chat");
    initChattable();
    blurTerminalInput();
    syncThemeToIframe();
    applyCSS();
    return {};
}
