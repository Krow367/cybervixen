import { openWindow } from "../../io.js";

let cssCache = null;
const onlineUsers = new Map();

async function getChatCSS() {
    if (cssCache) return cssCache;
    try {
        const res = await fetch("./commands/chat/chat.css");
        cssCache = await res.text();
        return cssCache;
    } catch (e) {
        console.error("Failed to load chat.css:", e);
        return "";
    }
}

function applyCSS() {
    const iframe = document.getElementById("chattable");
    if (!iframe || !iframe.contentWindow) return;

    getChatCSS().then(cssText => {
        if (!cssText) return;
        iframe.contentWindow.postMessage(cssText, "*");
        if (window.chattable && typeof window.chattable.sendMessageToFrame === "function") {
            window.chattable.sendMessageToFrame(cssText);
        }
    });
}

function addUser(name, extra = {}) {
    if (!name || typeof name !== "string") return;
    const cleanName = name.trim();
    if (!cleanName || cleanName === "undefined" || cleanName === "null") return;

    const existing = onlineUsers.get(cleanName) || {};
    onlineUsers.set(cleanName, {
        name: cleanName,
        lastSeen: Date.now(),
        isOwner: extra.isOwner || extra.owner || existing.isOwner || false,
        isMod: extra.isMod || extra.mod || existing.isMod || false,
        ...extra
    });

    renderUserList();
}

function processConnectionPayload(data) {
    if (!data) return;

    if (Array.isArray(data)) {
        data.forEach(item => {
            if (typeof item === "string") addUser(item);
            else if (item && typeof item === "object") {
                addUser(item.name || item.username || item.uid, {
                    isOwner: item.isOwner || item.owner,
                    isMod: item.isMod || item.mod
                });
            }
        });
    } else if (typeof data === "object") {
        Object.values(data).forEach(item => {
            if (typeof item === "string") addUser(item);
            else if (item && typeof item === "object") {
                addUser(item.name || item.username || item.uid, {
                    isOwner: item.isOwner || item.owner,
                    isMod: item.isMod || item.mod
                });
            }
        });
    }
}

function processMessagePayload(data) {
    if (!data) return;

    const name = data.name ||
                 data.sender ||
                 data.author ||
                 (data.message && (data.message.name || data.message.sender)) ||
                 (data.object && (data.object.name || data.object.sender));

    const isOwner = data.isOwner || data.owner || (data.message && data.message.isOwner);
    const isMod = data.isMod || data.mod || (data.message && data.message.isMod);

    if (name) {
        addUser(name, { isOwner, isMod });
    }
}

function renderUserList() {
    const listEl = document.getElementById("chat-user-list");
    const countEl = document.getElementById("user-count-badge");
    if (!listEl) return;

    if (window.chattable && window.chattable.user && window.chattable.user.name) {
        const myName = window.chattable.user.name.trim();
        if (myName && !onlineUsers.has(myName)) {
            onlineUsers.set(myName, {
                name: myName,
                lastSeen: Date.now(),
                isOwner: window.chattable.user.isOwner || false,
                isMod: window.chattable.user.isMod || false
            });
        }
    }

    const userArray = Array.from(onlineUsers.values());

    if (userArray.length === 0) {
        listEl.innerHTML = '<div style="opacity: 0.6; font-style: italic;">No active nodes</div>';
        if (countEl) countEl.textContent = "(0)";
        return;
    }

    if (countEl) countEl.textContent = `(${userArray.length})`;

    const currentUser = (window.chattable && window.chattable.user && window.chattable.user.name) || localStorage.name || "";

    listEl.innerHTML = userArray.map(u => {
        const isSelf = currentUser && u.name === currentUser;
        const isOwner = u.isOwner || (isSelf && window.chattable && window.chattable.user && window.chattable.user.isOwner);
        const isMod = u.isMod || (isSelf && window.chattable && window.chattable.user && window.chattable.user.isMod);

        let roleBadge = "";
        if (isOwner) {
            roleBadge = ' <small style="color: #FF0000; text-shadow: 0 0 4px #FF0000; font-weight: bold;">[owner]</small>';
        } else if (isMod) {
            roleBadge = ' <small style="color: #00FF66; text-shadow: 0 0 3px #00FF66; font-weight: bold;">[mod]</small>';
        }

        const dotColor = isOwner ? '#FF0000' : '#00FF66';

        return `<div class="sidebar-user-item" style="padding: 4px 6px; display: flex; align-items: center; gap: 8px; text-shadow: 0 0 3px #00AA44; border-radius: 2px; background: rgba(0, 255, 102, 0.04);">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${dotColor}; box-shadow: 0 0 5px ${dotColor};"></span>
            <span class="user-name" style="word-break: break-word; ${isSelf ? 'font-weight: bold;' : ''}">${escapeHTML(u.name)}${roleBadge}${isSelf ? ' <small style="opacity:0.75;">(You)</small>' : ''}</span>
        </div>`;
    }).join("");
}

function updateHandleInput(name) {
    const val = name || (window.chattable && window.chattable.user && window.chattable.user.name) || localStorage.getItem("name") || "";
    if (!val) return;
    const input = document.getElementById("setting-handle-input");
    if (input) {
        input.value = val;
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
                    case "confirmation":
                        applyCSS();
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
                    case "connection":
                        processConnectionPayload(e.data.value);
                        break;
                    case "message":
                    case "sendMessage":
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
        getChatCSS().then(cssText => {
            if (window.chattable) {
                window.chattableStylesheet = cssText;
                
                if (typeof window.chattable.on === "function") {
                    window.chattable.on("connection", (users) => {
                        processConnectionPayload(users);
                    });
                    window.chattable.on("message", (msg) => {
                        processMessagePayload(msg);
                    });
                }

                if (window.chattable.user && window.chattable.user.name) {
                    addUser(window.chattable.user.name);
                    updateHandleInput(window.chattable.user.name);
                }
            }
            applyCSS();
        });
    }).catch(err => {
        console.error("Failed to load Chattable API script:", err);
        applyCSS();
    });

    const iframe = document.getElementById("chattable");
    if (iframe) {
        iframe.onload = () => {
            applyCSS();
            const storedName = localStorage.getItem("name");
            if (storedName) {
                iframe.contentWindow.postMessage({ type: "setName", value: storedName }, "*");
                updateHandleInput(storedName);
            }
        };

        let attempts = 0;
        const interval = setInterval(() => {
            applyCSS();
            updateHandleInput();
            attempts++;
            if (attempts >= 12) clearInterval(interval);
        }, 500);
    }
}

let quotes = [
    "Establishing connection to Chattable relay [ID: 39818112]...",
];

let output;

function pickOutput() {
    output = quotes[Math.floor(Math.random() * quotes.length)];
    return output;
}

pickOutput();

export { output };
export default function () {
    pickOutput();
    openWindow("chat");
    initChattable();
    return {};
}
