import { openWindow, type } from "../../io.js";
import pause from "../../pause.js";

// Firebase ESM SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getDatabase, ref, push, onChildAdded, onChildChanged, onChildRemoved,
    onValue, set, get, child, update, remove, onDisconnect, serverTimestamp,
    query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyBvUk_WFAnCs2YpfnYsjdFJ0zyoimbguJA",
    authDomain: "foxnet-chat.firebaseapp.com",
    projectId: "foxnet-chat",
    storageBucket: "foxnet-chat.firebasestorage.app",
    messagingSenderId: "369594579904",
    appId: "1:369594579904:web:fa636df85e1c343a906625",
    databaseURL: "https://foxnet-chat-default-rtdb.firebaseio.com"
};

let app, db;
let initialized = false;
let sessionKey = "sess_" + Math.random().toString(36).substr(2, 9);
let currentHandle = localStorage.getItem("foxnet_handle") || localStorage.getItem("name") || "Guest_" + Math.floor(1000 + Math.random() * 9000);
let currentFlair = localStorage.getItem("foxnet_flair") || "";
let currentWebsite = localStorage.getItem("foxnet_website") || localStorage.getItem("website") || "";
let currentUserRole = "user"; // "owner", "mod", "vip", "user"
let activePresenceUsers = new Map();
let activeContextMenu = null;
let activeReplyData = null;
let visitorMeta = { ip: "unknown", ipKey: "unknown", fpHash: "unknown" };

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function isOwnerHandle(name) {
    if (!name) return false;
    const h = name.toLowerCase();
    return h === "cybervixen" || h === "owner";
}

async function ensureChatWindowDOM() {
    const win = document.getElementById("chat");
    if (!win) return;
    if (win.classList.contains("loading-template") || !document.getElementById("btn-enter-chat")) {
        await new Promise(resolve => win.addEventListener("template-loaded", resolve, { once: true }));
    }
}

function injectChatCSS() {
    if (!document.getElementById("foxnet-chat-css-link")) {
        const link = document.createElement("link");
        link.id = "foxnet-chat-css-link";
        link.rel = "stylesheet";
        link.href = "./commands/chat/chat.css";
        document.head.appendChild(link);
    }
}

// ─── IP & Device Fingerprinting Engine ───────────────────────────────────────

async function fetchVisitorMetadata() {
    let ip = "unknown";
    try {
        const res = await Promise.race([
            fetch("https://api.ipify.org?format=json"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("IP timeout")), 2500))
        ]);
        const data = await res.json();
        if (data && data.ip) ip = data.ip;
    } catch (e) {
        console.warn("IP fetch fallback:", e.message);
    }

    let fpStr = "";
    try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.textBaseline = "top";
        ctx.font = "14px 'Arial'";
        ctx.fillStyle = "#f60";
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069";
        ctx.fillText("foxNet_fp_v1", 2, 15);
        ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
        ctx.fillText("foxNet_fp_v1", 4, 17);
        fpStr = canvas.toDataURL();
    } catch (e) {}

    const rawFingerprint = [
        navigator.userAgent,
        navigator.language,
        screen.width + "x" + screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 1,
        fpStr
    ].join("||");

    const fpHash = "fp_" + simpleHash(rawFingerprint);
    const ipKey = "ip_" + ip.replace(/[\.\:]/g, "_");

    visitorMeta = { ip, ipKey, fpHash };
    return visitorMeta;
}

// ─── Firebase Engine Init ───────────────────────────────────────────────────

async function initFirebaseEngine() {
    if (initialized) return;
    try {
        await ensureChatWindowDOM();
        injectChatCSS();

        // Clear any browser password manager autofill on input
        const msgInput = document.getElementById("foxnet-message-input");
        if (msgInput) {
            msgInput.value = "";
            setTimeout(() => { if (msgInput) msgInput.value = ""; }, 100);
            setTimeout(() => { if (msgInput) msgInput.value = ""; }, 500);
        }

        app = initializeApp(firebaseConfig);
        db = getDatabase(app);
        initialized = true;

        await fetchVisitorMetadata();
        await checkUserRole(currentHandle);

        const isBanned = await checkBannedStatus();
        if (isBanned) return;

        listenForKicks();
        setupPresence();
        listenToMessages();
        setupUIEvents();
        setupContextMenuEvents();
        renderLocalWelcomeMessage();
    } catch (e) {
        console.error("Firebase init error:", e);
    }
}

function renderLocalWelcomeMessage() {
    const container = document.getElementById("foxnet-messages");
    if (!container) return;
    const msgEl = document.createElement("div");
    msgEl.className = "foxnet-msg-item msg-system";
    msgEl.style.fontStyle = "italic";
    msgEl.style.opacity = "0.9";
    msgEl.style.padding = "6px 12px";
    msgEl.style.color = "var(--phosphor)";
    msgEl.innerHTML = `<span>[ Welcome to foxNet! Type <strong style="text-shadow: 0 0 4px var(--phosphor);">/help</strong> for a list of available commands. ]</span>`;
    container.appendChild(msgEl);
}

async function checkBannedStatus() {
    if (!db) return false;

    try {
        // Check Handle Ban
        const userBanSnap = await get(ref(db, `banned_users/${currentHandle.toLowerCase()}`));
        if (userBanSnap.exists()) {
            disconnectAndLockout("[ ACCESS DENIED: YOUR HANDLE HAS BEEN PERMANENTLY BANNED FROM FOXNET ]");
            return true;
        }
    } catch (e) {}

    try {
        // Check IP Ban
        if (visitorMeta.ipKey !== "ip_unknown") {
            const ipBanSnap = await get(ref(db, `banned_ips/${visitorMeta.ipKey}`));
            if (ipBanSnap.exists()) {
                disconnectAndLockout(`[ ACCESS DENIED: YOUR IP (${visitorMeta.ip}) IS PERMANENTLY BANNED FROM FOXNET ]`);
                return true;
            }
        }
    } catch (e) {}

    try {
        // Check Device Fingerprint Ban
        if (visitorMeta.fpHash !== "fp_unknown") {
            const fpBanSnap = await get(ref(db, `banned_fingerprints/${visitorMeta.fpHash}`));
            if (fpBanSnap.exists()) {
                disconnectAndLockout("[ ACCESS DENIED: YOUR DEVICE HARDWARE HAS BEEN PERMANENTLY BANNED FROM FOXNET ]");
                return true;
            }
        }
    } catch (e) {}

    return false;
}

function listenForKicks() {
    if (!db) return;
    const kickRef = ref(db, `kicked_users/${currentHandle.toLowerCase()}`);
    onValue(kickRef, (snapshot) => {
        if (snapshot.exists()) {
            remove(kickRef);
            disconnectAndLockout("[ DISCONNECTED: YOU WERE KICKED FROM FOXNET BY A MODERATOR ]");
        }
    });
}

function disconnectAndLockout(reasonMessage) {
    if (db) {
        remove(ref(db, `presence/${sessionKey}`));
    }
    const container = document.getElementById("foxnet-messages");
    if (container) {
        container.innerHTML = `<div style="padding: 30px; color: #FF0000; font-family: 'VT323', monospace; font-size: 1.3rem; text-align: center; text-shadow: 0 0 8px #FF0000;">
            ${escapeHTML(reasonMessage)}
        </div>`;
    }
    const inputBar = document.getElementById("foxnet-input-bar");
    if (inputBar) inputBar.style.display = "none";
}

async function checkUserRole(handle) {
    if (isOwnerHandle(handle)) {
        currentUserRole = "owner";
        return "owner";
    }
    if (!db) return "user";

    try {
        const handleSnap = await get(child(ref(db), `reserved_handles/${handle.toLowerCase()}`));
        const data = handleSnap.val();
        if (data && data.role) {
            currentUserRole = data.role;
            return data.role;
        }
    } catch (e) {}

    currentUserRole = "user";
    return "user";
}

// ─── User Presence & Roster ──────────────────────────────────────────────────

let presenceHeartbeat = null;

function setupPresence() {
    if (!db) return;
    const connectedRef = ref(db, ".info/connected");
    const myPresenceRef = ref(db, `presence/${sessionKey}`);

    // Auto-reconnect & presence re-establishment on network/socket restore
    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            onDisconnect(myPresenceRef).remove();
            updatePresenceData();
        }
    });

    // 15-second active heartbeat so idle/AFK users NEVER drop from the roster
    if (presenceHeartbeat) clearInterval(presenceHeartbeat);
    presenceHeartbeat = setInterval(() => {
        updatePresenceData();
    }, 15000);

    // Clean up presence ONLY when page is closed or unloaded
    window.addEventListener("beforeunload", () => {
        if (db) remove(ref(db, `presence/${sessionKey}`));
    });
    window.addEventListener("pagehide", () => {
        if (db) remove(ref(db, `presence/${sessionKey}`));
    });

    const allPresenceRef = ref(db, "presence");
    onValue(allPresenceRef, (snapshot) => {
        activePresenceUsers.clear();
        const data = snapshot.val();
        if (data) {
            Object.values(data).forEach(u => {
                if (u && u.name) {
                    activePresenceUsers.set(u.name.toLowerCase(), u);
                }
            });
        }
        renderUserList();
    });
}

function updatePresenceData() {
    if (!db) return;
    const myPresenceRef = ref(db, `presence/${sessionKey}`);
    const isOwner = currentUserRole === "owner" || isOwnerHandle(currentHandle);
    const website = isOwner ? "https://cybervixen.dev" : currentWebsite;

    set(myPresenceRef, {
        name: currentHandle,
        flair: currentFlair,
        role: currentUserRole,
        website: website,
        isOwner: isOwner,
        ipKey: visitorMeta.ipKey,
        fpHash: visitorMeta.fpHash,
        ip: visitorMeta.ip,
        joinedAt: serverTimestamp()
    });
}

function renderUserList() {
    const listEl = document.getElementById("chat-user-list");
    const countBadge = document.getElementById("user-count-badge");
    if (!listEl) return;

    const isAmber = (localStorage.getItem("theme") || document.documentElement.getAttribute("data-theme")) === "amber";
    const globeFilter = isAmber
        ? "filter: sepia(100%) hue-rotate(5deg) saturate(350%) brightness(1.05); display: inline-block; opacity: 0.9;"
        : "filter: sepia(100%) hue-rotate(75deg) saturate(300%) brightness(0.95); display: inline-block; opacity: 0.9;";

    const users = Array.from(activePresenceUsers.values());
    if (countBadge) countBadge.textContent = `(${users.length})`;

    if (users.length === 0) {
        listEl.innerHTML = `<div style="opacity:0.6; font-style:italic; padding:6px;">No users active</div>`;
        return;
    }

    if (!listEl._hasEasterEggListener) {
        listEl._hasEasterEggListener = true;
        let lastClick = 0;
        listEl.addEventListener("click", (e) => {
            const link = e.target.closest(".easter-egg-site-link");
            if (link) {
                e.preventDefault();
                e.stopPropagation();

                const now = Date.now();
                if (now - lastClick < 1000) return;
                lastClick = now;

                const choices = [
                    `${currentHandle} clicked CyberVixen's link and entered a recursion loop.`,
                    `${currentHandle} tried to visit CyberVixen's site... while standing inside it.`
                ];
                const text = choices[Math.floor(Math.random() * choices.length)];
                sendChatMessage(text, true);
            }
        });
    }

    listEl.innerHTML = users.map(u => {
        const isSelf = u.name.toLowerCase() === currentHandle.toLowerCase();
        const isOwner = u.role === "owner" || u.isOwner || isOwnerHandle(u.name);
        const isMod = !isOwner && u.role === "mod";
        const isVip = !isOwner && !isMod && u.role === "vip";
        const dotColor = isOwner ? '#FF0000' : (isMod ? '#FFD700' : 'var(--phosphor)');

        let roleBadge = '';
        if (isOwner) {
            roleBadge = ' <small style="color: #FF0000; text-shadow: 0 0 4px #FF0000; font-weight: bold;">[owner]</small>';
        } else if (isMod) {
            roleBadge = ' <small style="color: #FFD700; text-shadow: 0 0 4px #FFD700; font-weight: bold;">[mod]</small>';
        } else if (isVip) {
            roleBadge = ' <small style="color: #00FFFF; text-shadow: 0 0 4px #00FFFF; font-weight: bold;">[vip]</small>';
        } else if (u.flair) {
            roleBadge = ` <small style="color: var(--phosphor); opacity: 0.9;">[${escapeHTML(u.flair)}]</small>`;
        }

        let websiteUrl = u.website || (isOwner ? "https://cybervixen.dev" : "");
        let siteBtn = "";
        if (websiteUrl) {
            const isCyberVixenDev = isOwner || /cybervixen\.dev/i.test(websiteUrl);
            const linkClass = isCyberVixenDev ? 'class="easter-egg-site-link"' : '';
            siteBtn = ` <a href="${escapeHTML(websiteUrl)}" target="_blank" rel="noopener" ${linkClass} title="Visit ${escapeHTML(u.name)}'s website" style="margin-left: auto; color: var(--phosphor); text-decoration: none; border: 1px solid rgba(var(--phosphor-rgb), 0.5); padding: 0 5px; font-size: 0.8rem; background: rgba(var(--phosphor-rgb), 0.1); border-radius: 2px; flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px;"><span style="${globeFilter}">🌐</span> [SITE]</a>`;
        }

        return `<div class="sidebar-user-item" data-username="${escapeHTML(u.name)}" style="padding: 4px 6px; display: flex; align-items: center; gap: 8px; text-shadow: 0 0 3px var(--phosphor); border-radius: 2px; background: rgba(var(--phosphor-rgb), 0.04); cursor: pointer;" title="Click to whisper ${escapeHTML(u.name)}">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${dotColor}; box-shadow: 0 0 5px ${dotColor}; flex-shrink: 0;"></span>
            <span class="user-name" style="word-break: break-word; flex: 1; ${isSelf ? 'font-weight: bold;' : ''}">${escapeHTML(u.name)}${roleBadge}${isSelf ? ' <small style="opacity:0.75;">(You)</small>' : ''}</span>
            ${siteBtn}
        </div>`;
    }).join("");
}

// ─── Real-Time Messaging & Whisper Engine ─────────────────────────────────────

function listenToMessages() {
    if (!db) return;
    const messagesQuery = query(ref(db, "messages"), limitToLast(100));
    const container = document.getElementById("foxnet-messages");
    if (!container) return;

    onChildAdded(messagesQuery, (snapshot) => {
        const msg = snapshot.val();
        if (!msg) return;
        renderMessageItem(msg, container, snapshot.key);
    });

    onChildChanged(messagesQuery, (snapshot) => {
        const msg = snapshot.val();
        if (!msg) return;
        const existingEl = container.querySelector(`[data-msg-key="${snapshot.key}"]`);
        if (existingEl) {
            updateMessageDOM(existingEl, msg);
        }
    });

    onChildRemoved(messagesQuery, (snapshot) => {
        const existingEl = container.querySelector(`[data-msg-key="${snapshot.key}"]`);
        if (existingEl) existingEl.remove();
    });
}

function renderMessageItem(msg, container, msgKey) {
    if (container.querySelector(`.user-item-loading, .msg-system`)) {
        const initMsg = container.querySelector(`.msg-system`);
        if (initMsg) initMsg.remove();
    }

    // Handle Whispers (Private Messages)
    const isWhisper = !!msg.whisperTo;
    if (isWhisper) {
        const myHandle = currentHandle.toLowerCase();
        const whisperTo = msg.whisperTo.toLowerCase();
        const sender = (msg.sender || "").toLowerCase();
        if (myHandle !== whisperTo && myHandle !== sender && currentUserRole !== "owner") {
            return; // Skip rendering private whispers intended for others!
        }
    }

    const msgEl = document.createElement("div");
    msgEl.className = "foxnet-msg-item";
    if (msgKey) msgEl.setAttribute("data-msg-key", msgKey);
    msgEl._msgData = msg;

    updateMessageDOM(msgEl, msg);
    container.appendChild(msgEl);

    // Smooth auto-scroll
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom < 300 || msg.sender?.toLowerCase() === currentHandle.toLowerCase()) {
        container.scrollTop = container.scrollHeight + 1000;
    }
}

function updateMessageDOM(msgEl, msg) {
    const isSystem = msg.isSystem;
    const isWhisper = !!msg.whisperTo;
    const isOwner = msg.role === "owner" || msg.isOwner || isOwnerHandle(msg.sender);
    const isMod = !isOwner && msg.role === "mod";
    const isVip = !isOwner && !isMod && msg.role === "vip";
    const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

    if (isSystem) {
        msgEl.style.fontStyle = "italic";
        msgEl.style.opacity = "0.85";
        msgEl.innerHTML = `<span style="color: var(--phosphor);">${escapeHTML(msg.text)}</span>`;
    } else if (isWhisper) {
        const isFromMe = msg.sender.toLowerCase() === currentHandle.toLowerCase();
        const headerText = isFromMe ? `[WHISPER TO ${escapeHTML(msg.whisperTo).toUpperCase()}]` : `[WHISPER FROM ${escapeHTML(msg.sender).toUpperCase()}]`;
        
        msgEl.style.background = "rgba(221, 160, 221, 0.08)";
        msgEl.style.borderLeft = "2px solid #DDA0DD";
        msgEl.innerHTML = `
            <div class="foxnet-msg-header">
                <span style="color: #DDA0DD; text-shadow: 0 0 4px #DDA0DD; font-weight: bold;">${headerText}</span>
                <span class="foxnet-msg-time">${timeStr}</span>
            </div>
            <div class="foxnet-msg-body" style="color: #E6E6FA; font-style: italic;">${escapeHTML(msg.text)}</div>
        `;
    } else {
        const senderColor = "var(--phosphor)";
        let roleBadge = '';
        if (isOwner) {
            roleBadge = '<small style="color: #FF0000; text-shadow: 0 0 4px #FF0000;">[owner]</small> ';
        } else if (isMod) {
            roleBadge = '<small style="color: #FFD700; text-shadow: 0 0 4px #FFD700;">[mod]</small> ';
        } else if (isVip) {
            roleBadge = '<small style="color: #00FFFF; text-shadow: 0 0 4px #00FFFF;">[vip]</small> ';
        } else if (msg.flair) {
            roleBadge = `<small style="opacity:0.8;">[${escapeHTML(msg.flair)}]</small> `;
        }

        const editedLabel = msg.isEdited ? ' <small style="opacity:0.5; font-style:italic;">(edited)</small>' : '';

        // Check for /img or /image command
        let textContent = msg.text || "";
        let imgHTML = "";

        const imgMatch = textContent.match(/^\/img\s+(https?:\/\/\S+)|^\/image\s+(https?:\/\/\S+)/i);
        if (imgMatch) {
            const imgUrl = imgMatch[1] || imgMatch[2];
            imgHTML = `<img src="${escapeHTML(imgUrl)}" class="foxnet-msg-img" alt="Chat Image" onload="this.parentNode.parentNode.scrollTop = this.parentNode.parentNode.scrollHeight;">`;
            textContent = textContent.replace(imgMatch[0], "").trim();
        }

        const formattedText = textContent ? `<div>${escapeHTML(textContent)}</div>` : "";

        let quoteHTML = "";
        if (msg.replyTo) {
            quoteHTML = `
                <div class="foxnet-quote-block">
                    <small style="opacity: 0.75;">┌─ Replying to <strong>@${escapeHTML(msg.replyTo.sender)}</strong>:</small>
                    <div style="opacity: 0.9;">"${escapeHTML(msg.replyTo.text)}"</div>
                </div>
            `;
        }

        let reactionsHTML = "";
        if (msg.reactions) {
            let pills = [];
            Object.entries(msg.reactions).forEach(([emojiKey, usersObj]) => {
                if (usersObj) {
                    const emoji = decodeEmojiKey(emojiKey);
                    const userKeys = Object.keys(usersObj);
                    const count = userKeys.length;
                    const hasReacted = userKeys.includes(currentHandle.toLowerCase());
                    if (count > 0) {
                        pills.push(`<span class="reaction-pill ${hasReacted ? 'user-reacted' : ''}" data-emoji-key="${emojiKey}" title="Reacted by: ${userKeys.map(u=>'@'+u).join(', ')}">${emoji} ${count}</span>`);
                    }
                }
            });
            if (pills.length > 0) {
                reactionsHTML = `<div class="foxnet-msg-reactions">${pills.join('')}</div>`;
            }
        }

        msgEl.innerHTML = `
            <div class="foxnet-msg-header">
                <span class="sender-name" style="color: ${senderColor}; text-shadow: 0 0 3px ${senderColor};">${escapeHTML(msg.sender)}</span>
                ${roleBadge}
                <span class="foxnet-msg-time">${timeStr}${editedLabel}</span>
            </div>
            ${quoteHTML}
            <div class="foxnet-msg-body">${formattedText}${imgHTML}</div>
            ${reactionsHTML}
        `;

        // Handle reaction pill click delegation
        const reactionsContainer = msgEl.querySelector(".foxnet-msg-reactions");
        if (reactionsContainer) {
            reactionsContainer.addEventListener("click", (e) => {
                const pill = e.target.closest(".reaction-pill");
                if (pill) {
                    const emojiKey = pill.getAttribute("data-emoji-key");
                    const emoji = decodeEmojiKey(emojiKey);
                    const msgKey = msgEl.getAttribute("data-msg-key");
                    if (msgKey && emoji) {
                        toggleReaction(msgKey, emoji);
                    }
                }
            });
        }

        // Play notification bleep for incoming messages from others
        if (msg.sender && msg.sender.toLowerCase() !== currentHandle.toLowerCase()) {
            if (audioEnabled) {
                try {
                    const audio = new Audio("./media/beep.mp3");
                    audio.volume = 0.2;
                    audio.play().catch(() => {});
                } catch (e) {}
            }
            incrementUnreadBadge();
        }
    }
}

function decodeEmojiKey(key) {
    const map = {
        "thumbsup": "👍",
        "fire": "🔥",
        "skull": "💀",
        "heart": "❤️",
        "robot": "🤖",
        "fox": "🦊"
    };
    return map[key] || key;
}

function encodeEmojiKey(emoji) {
    const map = {
        "👍": "thumbsup",
        "🔥": "fire",
        "💀": "skull",
        "❤️": "heart",
        "🤖": "robot",
        "🦊": "fox"
    };
    return map[emoji] || emoji;
}

let audioEnabled = localStorage.getItem("foxnet_audio_enabled") !== "false";
let unreadCount = 0;

function incrementUnreadBadge() {
    const isDocHidden = document.hidden;
    const chatWin = document.getElementById("chat");
    const isWinMinimized = chatWin && chatWin.classList.contains("minimized");
    if (isDocHidden || isWinMinimized) {
        unreadCount++;
        const titleEl = document.querySelector("#chat .window-title") || document.querySelector("#chat h1");
        if (titleEl) {
            titleEl.textContent = `SRC.EXE (${unreadCount}) - SERENITY RELAY CHAT`;
        }
        document.title = `(${unreadCount}) Cyber Vixen`;
    }
}

function clearUnreadBadge() {
    unreadCount = 0;
    const titleEl = document.querySelector("#chat .window-title") || document.querySelector("#chat h1");
    if (titleEl) {
        titleEl.textContent = `SRC.EXE - SERENITY RELAY CHAT - YOU CHAT. WE READ.`;
    }
    document.title = "Cyber Vixen";
}

async function toggleReaction(msgKey, emoji) {
    if (!msgKey || !emoji || !db) return;
    const emojiKey = encodeEmojiKey(emoji);
    const myHandleKey = currentHandle.toLowerCase();
    const reactionRef = ref(db, `messages/${msgKey}/reactions/${emojiKey}/${myHandleKey}`);
    const snap = await get(reactionRef);
    if (snap.exists()) {
        await remove(reactionRef);
    } else {
        await set(reactionRef, true);
    }
}

function openCommandsFlyout() {
    const modal = document.getElementById("foxnet-commands-modal");
    if (modal) modal.style.display = "flex";
}

function sendChatMessage(rawText, isSystem = false) {
    if (!rawText || !rawText.trim() || !db) return;
    const trimmed = rawText.trim();

    // Check for /commands or /help
    if (/^\/(?:commands|help)$/i.test(trimmed)) {
        openCommandsFlyout();
        return;
    }

    // Check for whisper command syntax: /w handle message OR /whisper handle message
    const whisperMatch = trimmed.match(/^\/(?:w|whisper)\s+([^\s]+)\s+(.+)/i);
    if (whisperMatch) {
        const targetHandle = whisperMatch[1].trim();
        const whisperMsg = whisperMatch[2].trim();
        if (targetHandle && whisperMsg) {
            push(ref(db, "messages"), {
                sender: currentHandle,
                whisperTo: targetHandle.toLowerCase(),
                flair: currentFlair,
                role: currentUserRole,
                text: whisperMsg,
                timestamp: serverTimestamp()
            });
            return;
        }
    }

    const isOwner = currentUserRole === "owner" || isOwnerHandle(currentHandle);
    const msgData = {
        sender: isSystem ? "SYSTEM" : currentHandle,
        flair: currentFlair,
        role: currentUserRole,
        text: trimmed,
        isOwner: isOwner,
        isSystem: isSystem,
        timestamp: serverTimestamp()
    };

    if (activeReplyData) {
        msgData.replyTo = activeReplyData;
        activeReplyData = null;
        const replyBar = document.getElementById("foxnet-reply-bar");
        if (replyBar) replyBar.style.display = "none";
    }

    push(ref(db, "messages"), msgData);
}

// ─── Handle Reservation & Inline Auth ────────────────────────────────────────

async function checkAndSetHandle(newHandle, enteredPin = "") {
    if (!newHandle || !newHandle.trim()) return false;
    const cleanName = newHandle.trim();
    const handleKey = cleanName.toLowerCase();
    const statusMsg = document.getElementById("settings-status-msg");

    if (cleanName.toLowerCase() === currentHandle.toLowerCase() && !enteredPin) {
        if (statusMsg) statusMsg.textContent = `[ CURRENT HANDLE IS ${cleanName.toUpperCase()} ]`;
        return true;
    }

    if (!db) {
        setHandleSuccess(cleanName);
        if (statusMsg) statusMsg.textContent = `[ HANDLE SET TO ${cleanName.toUpperCase()} ]`;
        return true;
    }

    try {
        const handleSnap = await Promise.race([
            get(child(ref(db), `reserved_handles/${handleKey}`)),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
        ]);
        const reservedData = handleSnap ? handleSnap.val() : null;

        if (reservedData) {
            // Handle IS RESERVED!
            const storedPinHash = reservedData.pinHash;
            const myStoredToken = localStorage.getItem(`foxnet_authtoken_${handleKey}`);
            const hashedEnteredPin = enteredPin && enteredPin.trim() ? simpleHash(enteredPin.trim()) : "";

            if (myStoredToken === storedPinHash || hashedEnteredPin === storedPinHash) {
                if (hashedEnteredPin === storedPinHash) {
                    localStorage.setItem(`foxnet_authtoken_${handleKey}`, storedPinHash);
                }
                const role = reservedData.role || (isOwnerHandle(cleanName) ? "owner" : "user");
                currentUserRole = role;
                setHandleSuccess(cleanName);
                if (statusMsg) statusMsg.textContent = `[ AUTHENTICATED AS ${cleanName.toUpperCase()} ]`;
                return true;
            } else {
                // Incorrect / missing PIN -> BLOCK HANDLE CHANGE!
                const handleInput = document.getElementById("setting-handle-input");
                if (handleInput) handleInput.value = currentHandle;
                if (statusMsg) statusMsg.textContent = `[ ERROR: INCORRECT PIN FOR RESERVED HANDLE ]`;
                return false;
            }
        } else {
            // Handle IS NOT RESERVED YET!
            const role = isOwnerHandle(cleanName) ? "owner" : "user";
            currentUserRole = role;

            if (enteredPin && enteredPin.trim()) {
                const hashedPin = simpleHash(enteredPin.trim());
                await set(ref(db, `reserved_handles/${handleKey}`), {
                    handle: cleanName,
                    pinHash: hashedPin,
                    role: role,
                    createdAt: serverTimestamp()
                });
                localStorage.setItem(`foxnet_authtoken_${handleKey}`, hashedPin);
                setHandleSuccess(cleanName);
                if (statusMsg) statusMsg.textContent = `[ HANDLE ${cleanName.toUpperCase()} RESERVED WITH PIN ]`;
            } else {
                setHandleSuccess(cleanName);
                if (statusMsg) statusMsg.textContent = `[ HANDLE SET TO ${cleanName.toUpperCase()} ]`;
            }
            return true;
        }
    } catch (e) {
        console.warn("Firebase handle check skipped/offline:", e.message);
        setHandleSuccess(cleanName);
        if (statusMsg) statusMsg.textContent = `[ HANDLE SET TO ${cleanName.toUpperCase()} ]`;
        return true;
    }
}

function setHandleSuccess(cleanName) {
    currentHandle = cleanName;
    localStorage.setItem("foxnet_handle", cleanName);
    localStorage.setItem("name", cleanName);

    const input = document.getElementById("setting-handle-input");
    if (input) input.value = cleanName;

    updatePresenceData();
}

// ─── Right-Click Context Menu & Moderation ───────────────────────────────────

function setupContextMenuEvents() {
    const container = document.getElementById("foxnet-messages");
    const menu = document.getElementById("foxnet-context-menu");
    const btnQuote = document.getElementById("ctx-quote");
    const btnWhisper = document.getElementById("ctx-whisper");
    const btnEdit = document.getElementById("ctx-edit");
    const btnDelete = document.getElementById("ctx-delete");
    const btnKick = document.getElementById("ctx-kick");
    const btnBan = document.getElementById("ctx-ban");
    if (!container || !menu) return;

    let targetMsgEl = null;

    const openMenuAt = (msgEl, clientX, clientY) => {
        targetMsgEl = msgEl;
        const msgData = msgEl._msgData;
        const sender = msgData.sender || "";

        const isMyMsg = sender.toLowerCase() === currentHandle.toLowerCase();
        const isPrivileged = currentUserRole === "owner" || currentUserRole === "mod";

        if (btnEdit) btnEdit.style.display = (isMyMsg || isPrivileged) ? "block" : "none";
        if (btnDelete) btnDelete.style.display = (isMyMsg || isPrivileged) ? "block" : "none";
        if (btnKick) btnKick.style.display = (isPrivileged && !isMyMsg) ? "block" : "none";
        if (btnBan) btnBan.style.display = (isPrivileged && !isMyMsg) ? "block" : "none";

        // Use fixed positioning so the menu can escape its parent container
        menu.style.position = "fixed";
        menu.style.left = "0px";
        menu.style.top = "0px";
        menu.style.display = "block";
        menu.style.visibility = "hidden"; // measure without flash

        // Measure true rendered size
        const menuW = menu.offsetWidth;
        const menuH = menu.offsetHeight;
        const vpW = window.innerWidth;
        const vpH = window.innerHeight;
        const pad = 6; // px gap from edges

        let left = clientX;
        let top = clientY;

        // Flip left if it would overflow right edge
        if (left + menuW + pad > vpW) left = vpW - menuW - pad;
        // Clamp to left edge
        if (left < pad) left = pad;
        // Flip up if it would overflow bottom edge
        if (top + menuH + pad > vpH) top = vpH - menuH - pad;
        // Clamp to top edge
        if (top < pad) top = pad;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.visibility = "visible";
        activeContextMenu = menu;
    };

    container.addEventListener("contextmenu", (e) => {
        const msgEl = e.target.closest(".foxnet-msg-item");
        if (!msgEl || !msgEl._msgData) return;

        e.preventDefault();
        e.stopPropagation();

        openMenuAt(msgEl, e.clientX, e.clientY);
    });

    // Touchscreen Long-Press Listener for Mobile (500ms)
    let touchTimer = null;
    let touchStartPos = { x: 0, y: 0 };

    container.addEventListener("touchstart", (e) => {
        const msgEl = e.target.closest(".foxnet-msg-item");
        if (!msgEl || !msgEl._msgData) return;
        const touch = e.touches[0];
        touchStartPos = { x: touch.clientX, y: touch.clientY };

        touchTimer = setTimeout(() => {
            openMenuAt(msgEl, touchStartPos.x, touchStartPos.y);
        }, 500);
    }, { passive: true });

    container.addEventListener("touchmove", (e) => {
        if (touchTimer && e.touches[0]) {
            const touch = e.touches[0];
            const dist = Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y);
            if (dist > 10) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        }
    }, { passive: true });

    container.addEventListener("touchend", () => {
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
    });

    document.addEventListener("click", () => {
        if (activeContextMenu) {
            activeContextMenu.style.display = "none";
            activeContextMenu = null;
        }
    });

    // Emoji reaction row click
    const reactionsRow = document.getElementById("ctx-reactions-row");
    if (reactionsRow) {
        reactionsRow.addEventListener("click", (e) => {
            e.stopPropagation();
            const emojiSpan = e.target.closest(".ctx-emoji");
            if (emojiSpan && targetMsgEl) {
                const emoji = emojiSpan.getAttribute("data-emoji");
                const msgKey = targetMsgEl.getAttribute("data-msg-key");
                if (emoji && msgKey) {
                    toggleReaction(msgKey, emoji);
                    if (activeContextMenu) {
                        activeContextMenu.style.display = "none";
                        activeContextMenu = null;
                    }
                }
            }
        });
    }

    if (btnQuote) {
        btnQuote.addEventListener("click", () => {
            if (!targetMsgEl || !targetMsgEl._msgData) return;
            const data = targetMsgEl._msgData;
            const textPreview = data.text.length > 50 ? data.text.substr(0, 47) + "..." : data.text;
            activeReplyData = {
                id: targetMsgEl.getAttribute("data-msg-key"),
                sender: data.sender,
                text: textPreview
            };
            const replyBar = document.getElementById("foxnet-reply-bar");
            const replyText = document.getElementById("reply-bar-text");
            if (replyBar && replyText) {
                replyText.textContent = `Replying to @${data.sender}: "${textPreview}"`;
                replyBar.style.display = "flex";
            }
            const input = document.getElementById("foxnet-message-input");
            if (input) input.focus();
        });
    }

    if (btnWhisper) {
        btnWhisper.addEventListener("click", () => {
            if (!targetMsgEl || !targetMsgEl._msgData) return;
            const input = document.getElementById("foxnet-message-input");
            if (input) {
                input.value = `/w ${targetMsgEl._msgData.sender} `;
                input.focus();
            }
        });
    }

    if (btnEdit) {
        btnEdit.addEventListener("click", async () => {
            if (!targetMsgEl || !targetMsgEl._msgData || !db) return;
            const msgKey = targetMsgEl.getAttribute("data-msg-key");
            const oldText = targetMsgEl._msgData.text;
            const newText = await showRetroPrompt("// EDIT MESSAGE //", "Modify message text below:", oldText);
            if (newText && newText.trim() && newText.trim() !== oldText) {
                await update(ref(db, `messages/${msgKey}`), {
                    text: newText.trim(),
                    isEdited: true
                });
            }
        });
    }

    if (btnDelete) {
        btnDelete.addEventListener("click", async () => {
            if (!targetMsgEl || !db) return;
            const msgKey = targetMsgEl.getAttribute("data-msg-key");
            const confirmed = await showRetroConfirm("// DELETE MESSAGE //", "Are you sure you want to erase this message from system memory?");
            if (msgKey && confirmed) {
                await remove(ref(db, `messages/${msgKey}`));
            }
        });
    }

    if (btnKick) {
        btnKick.addEventListener("click", () => {
            if (!targetMsgEl || !targetMsgEl._msgData) return;
            kickUser(targetMsgEl._msgData.sender);
        });
    }

    if (btnBan) {
        btnBan.addEventListener("click", () => {
            if (!targetMsgEl || !targetMsgEl._msgData) return;
            banUser(targetMsgEl._msgData.sender);
        });
    }
}

async function kickUser(targetHandle) {
    if (!targetHandle || !db) return;
    const confirmed = await showRetroConfirm("// KICK USER //", `Disconnect @${targetHandle} from foxNet?`);
    if (confirmed) {
        await set(ref(db, `kicked_users/${targetHandle.toLowerCase()}`), {
            kickedBy: currentHandle,
            timestamp: serverTimestamp()
        });
        sendChatMessage(`[ SYSTEM ]: @${targetHandle} was kicked from the node by @${currentHandle}.`, true);
    }
}

async function banUser(targetHandle) {
    if (!targetHandle || !db) return;
    const confirmed = await showRetroConfirm("// BAN USER //", `PERMANENTLY BAN @${targetHandle} (IP & Device) from foxNet?`);
    if (confirmed) {
        const targetUserObj = activePresenceUsers.get(targetHandle.toLowerCase());

        // 1. Handle Ban
        await set(ref(db, `banned_users/${targetHandle.toLowerCase()}`), {
            bannedBy: currentHandle,
            timestamp: serverTimestamp()
        });

        // 2. IP Ban (if present in presence metadata)
        if (targetUserObj && targetUserObj.ipKey && targetUserObj.ipKey !== "ip_unknown") {
            await set(ref(db, `banned_ips/${targetUserObj.ipKey}`), {
                handle: targetHandle,
                ip: targetUserObj.ip,
                bannedBy: currentHandle,
                timestamp: serverTimestamp()
            });
        }

        // 3. Canvas Hardware Fingerprint Ban (if present in presence metadata)
        if (targetUserObj && targetUserObj.fpHash && targetUserObj.fpHash !== "fp_unknown") {
            await set(ref(db, `banned_fingerprints/${targetUserObj.fpHash}`), {
                handle: targetHandle,
                bannedBy: currentHandle,
                timestamp: serverTimestamp()
            });
        }

        // 4. Remove Reserved Handle & Presence
        await remove(ref(db, `reserved_handles/${targetHandle.toLowerCase()}`));
        
        sendChatMessage(`[ SYSTEM ]: @${targetHandle} (IP & Device) was PERMANENTLY BANNED from foxNet by @${currentHandle}.`, true);
    }
}

function showRetroPrompt(titleText, descText, defaultInputText) {
    return new Promise((resolve) => {
        const modal = document.getElementById("foxnet-dialog-modal");
        const title = document.getElementById("dialog-modal-title");
        const desc = document.getElementById("dialog-modal-desc");
        const input = document.getElementById("dialog-modal-input");
        const btnSubmit = document.getElementById("dialog-modal-submit");
        const btnCancel = document.getElementById("dialog-modal-cancel");
        if (!modal) return resolve(null);

        if (title) title.textContent = titleText;
        if (desc) desc.textContent = descText;
        if (input) {
            input.style.display = "block";
            input.value = defaultInputText || "";
            setTimeout(() => input.focus(), 50);
        }

        modal.style.display = "flex";

        const cleanup = () => {
            modal.style.display = "none";
        };

        const onConfirm = () => {
            cleanup();
            resolve(input ? input.value : "");
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        if (btnSubmit) btnSubmit.onclick = onConfirm;
        if (btnCancel) btnCancel.onclick = onCancel;
    });
}

function showRetroConfirm(titleText, descText) {
    return new Promise((resolve) => {
        const modal = document.getElementById("foxnet-dialog-modal");
        const title = document.getElementById("dialog-modal-title");
        const desc = document.getElementById("dialog-modal-desc");
        const input = document.getElementById("dialog-modal-input");
        const btnSubmit = document.getElementById("dialog-modal-submit");
        const btnCancel = document.getElementById("dialog-modal-cancel");
        if (!modal) return resolve(false);

        if (title) title.textContent = titleText;
        if (desc) desc.textContent = descText;
        if (input) input.style.display = "none";

        modal.style.display = "flex";

        const cleanup = () => {
            modal.style.display = "none";
        };

        const onConfirm = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        if (btnSubmit) btnSubmit.onclick = onConfirm;
        if (btnCancel) btnCancel.onclick = onCancel;
    });
}

const FONT_SIZE_LEVELS = {
    1: { name: "SMALL (1)", header: "0.95rem", sender: "1.0rem", time: "0.8rem", body: "1.1rem" },
    2: { name: "NORMAL (2)", header: "1.02rem", sender: "1.08rem", time: "0.85rem", body: "1.2rem" },
    3: { name: "LARGE (3)", header: "1.12rem", sender: "1.18rem", time: "0.92rem", body: "1.32rem" },
    4: { name: "X-LARGE (4)", header: "1.22rem", sender: "1.28rem", time: "1.0rem", body: "1.45rem" },
    5: { name: "BBS GIANT (5)", header: "1.35rem", sender: "1.4rem", time: "1.1rem", body: "1.65rem" }
};

function applyFontSizeLevel(levelVal) {
    const val = Math.max(1, Math.min(5, parseInt(levelVal) || 3));
    const lvl = FONT_SIZE_LEVELS[val] || FONT_SIZE_LEVELS[3];

    const label = document.getElementById("font-size-label");
    const slider = document.getElementById("setting-fontsize-slider");
    if (label) label.textContent = lvl.name;
    if (slider) slider.value = val;

    const targetEl = document.getElementById("chat") || document.documentElement;
    targetEl.style.setProperty("--chat-font-header", lvl.header);
    targetEl.style.setProperty("--chat-font-sender", lvl.sender);
    targetEl.style.setProperty("--chat-font-time", lvl.time);
    targetEl.style.setProperty("--chat-font-body", lvl.body);

    localStorage.setItem("foxnet_fontsize_level", val);
}

// ─── UI Controls & Events ────────────────────────────────────────────────────

function setupUIEvents() {
    const inputMsg = document.getElementById("foxnet-message-input");
    const btnSend = document.getElementById("foxnet-btn-send");

    const doSend = () => {
        if (inputMsg && inputMsg.value.trim()) {
            sendChatMessage(inputMsg.value.trim());
            inputMsg.value = "";
            inputMsg.focus();
        }
    };

    // Reply Bar Cancel Button
    const replyBar = document.getElementById("foxnet-reply-bar");
    const btnCancelReply = document.getElementById("btn-cancel-reply");
    if (btnCancelReply) {
        btnCancelReply.addEventListener("click", () => {
            activeReplyData = null;
            if (replyBar) replyBar.style.display = "none";
        });
    }

    // Font Size Stepped Slider
    const fontSizeSlider = document.getElementById("setting-fontsize-slider");
    const savedLevel = localStorage.getItem("foxnet_fontsize_level") || "3";
    applyFontSizeLevel(savedLevel);

    if (fontSizeSlider) {
        fontSizeSlider.value = savedLevel;
        fontSizeSlider.addEventListener("input", (e) => {
            applyFontSizeLevel(e.target.value);
        });
    }

    // Audio Toggle
    const audioToggle = document.getElementById("setting-audio-toggle");
    if (audioToggle) {
        audioToggle.checked = audioEnabled;
        audioToggle.addEventListener("change", () => {
            audioEnabled = audioToggle.checked;
            localStorage.setItem("foxnet_audio_enabled", audioEnabled ? "true" : "false");
        });
    }

    // Clear unread badge when chat is focused or clicked
    const chatMessages = document.getElementById("foxnet-messages");
    if (chatMessages) {
        chatMessages.addEventListener("click", clearUnreadBadge);
        chatMessages.addEventListener("scroll", clearUnreadBadge);
    }
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) clearUnreadBadge();
    });

    // Commands Flyout Modal Dismiss Handlers
    const commandsModal = document.getElementById("foxnet-commands-modal");
    const btnCloseCommands = document.getElementById("btn-close-commands");
    const btnDismissCommands = document.getElementById("btn-dismiss-commands-modal");
    const closeCommandsModal = () => {
        if (commandsModal) commandsModal.style.display = "none";
    };
    if (btnCloseCommands) btnCloseCommands.addEventListener("click", closeCommandsModal);
    if (btnDismissCommands) btnDismissCommands.addEventListener("click", closeCommandsModal);

    document.addEventListener("keydown", (e) => {
        const modal = document.getElementById("foxnet-commands-modal");
        if (modal && modal.style.display !== "none" && (e.key === "Enter" || e.key === "Escape")) {
            e.preventDefault();
            e.stopPropagation();
            closeCommandsModal();
        }
    }, true);

    if (btnSend) btnSend.addEventListener("click", doSend);
    if (inputMsg) {
        inputMsg.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                doSend();
            }
        });
    }

    // Settings Toggle
    const btnToggleSettings = document.getElementById("btn-toggle-settings");
    const userListPanel = document.getElementById("chat-user-list");
    const settingsPanel = document.getElementById("chat-settings-panel");
    const headerUsers = document.getElementById("sidebar-header-users");
    const headerSettings = document.getElementById("sidebar-header-settings");

    if (btnToggleSettings) {
        btnToggleSettings.addEventListener("click", () => {
            const isSettingsOpen = settingsPanel && settingsPanel.style.display !== "none";
            if (isSettingsOpen) {
                if (settingsPanel) settingsPanel.style.display = "none";
                if (headerSettings) headerSettings.style.display = "none";
                if (userListPanel) userListPanel.style.display = "flex";
                if (headerUsers) headerUsers.style.display = "flex";
                btnToggleSettings.textContent = "[ SETTINGS ]";
            } else {
                if (userListPanel) userListPanel.style.display = "none";
                if (headerUsers) headerUsers.style.display = "none";
                if (settingsPanel) settingsPanel.style.display = "flex";
                if (headerSettings) headerSettings.style.display = "flex";
                btnToggleSettings.textContent = "[ ONLINE USERS ]";
            }
        });
    }

    // Save Handle Button & Enter key
    const handleInput = document.getElementById("setting-handle-input");
    const pinInputSettings = document.getElementById("setting-pin-input");
    const btnSaveHandle = document.getElementById("btn-save-handle");
    if (handleInput) handleInput.value = currentHandle;
    if (btnSaveHandle) {
        btnSaveHandle.addEventListener("click", () => {
            if (handleInput) checkAndSetHandle(handleInput.value, pinInputSettings ? pinInputSettings.value : "");
        });
    }
    if (handleInput) {
        handleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                checkAndSetHandle(handleInput.value, pinInputSettings ? pinInputSettings.value : "");
            }
        });
    }

    // Save Flair Button & Enter key
    const flairInput = document.getElementById("setting-flair-input");
    const btnSaveFlair = document.getElementById("btn-save-flair");
    if (flairInput) flairInput.value = currentFlair;
    const saveFlair = () => {
        if (flairInput) {
            currentFlair = flairInput.value.trim();
            localStorage.setItem("foxnet_flair", currentFlair);
            updatePresenceData();
            const status = document.getElementById("settings-status-msg");
            if (status) status.textContent = "[ FLAIR UPDATED ]";
        }
    };
    if (btnSaveFlair) btnSaveFlair.addEventListener("click", saveFlair);
    if (flairInput) {
        flairInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                saveFlair();
            }
        });
    }

    // Save Website Button & Enter key
    const webInput = document.getElementById("setting-website-input");
    const btnSaveWeb = document.getElementById("btn-save-website");
    if (webInput) webInput.value = currentWebsite;
    const saveWeb = () => {
        if (webInput) {
            currentWebsite = webInput.value.trim();
            localStorage.setItem("foxnet_website", currentWebsite);
            localStorage.setItem("website", currentWebsite);
            updatePresenceData();
            const status = document.getElementById("settings-status-msg");
            if (status) status.textContent = "[ WEBSITE SAVED ]";
        }
    };
    if (btnSaveWeb) btnSaveWeb.addEventListener("click", saveWeb);
    if (webInput) {
        webInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                saveWeb();
            }
        });
    }

    // Splash Overlay Dismiss & Focus
    const splashOverlay = document.getElementById("chat-splash-overlay");
    const btnEnterChat = document.getElementById("btn-enter-chat");
    const dismissSplash = () => {
        const overlay = document.getElementById("chat-splash-overlay") || splashOverlay;
        if (overlay) overlay.style.display = "none";
        const input = document.getElementById("foxnet-message-input");
        if (input) input.focus();
    };

    if (btnEnterChat) {
        btnEnterChat.addEventListener("click", dismissSplash);
        setTimeout(() => {
            document.getElementById("cli")?.blur();
            btnEnterChat.focus();
        }, 150);
    }

    if (!document._hasSplashDelegatedListener) {
        document._hasSplashDelegatedListener = true;
        document.addEventListener("click", (e) => {
            if (e.target && (e.target.id === "btn-enter-chat" || e.target.closest("#btn-enter-chat"))) {
                dismissSplash();
            }
        });
        document.addEventListener("keydown", (e) => {
            const overlay = document.getElementById("chat-splash-overlay");
            if (overlay && overlay.style.display !== "none" && e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                document.getElementById("cli")?.blur();
                dismissSplash();
            }
        }, true);
    }

    // Sidebar User Roster Click -> Whisper
    const userListEl = document.getElementById("chat-user-list");
    if (userListEl) {
        userListEl.addEventListener("click", (e) => {
            const userItem = e.target.closest(".sidebar-user-item");
            if (userItem && !e.target.closest(".easter-egg-site-link")) {
                const targetUser = userItem.getAttribute("data-username");
                if (targetUser && targetUser.toLowerCase() !== currentHandle.toLowerCase()) {
                    const input = document.getElementById("foxnet-message-input");
                    if (input) {
                        input.value = `/w ${targetUser} `;
                        input.focus();
                    }
                }
            }
        });
    }
}

// ─── 56k Modem Connection Audio Sequence ───────────────────────────────────

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
    if (globalThis.DEBUG) {
        await type("DEBUG MODE: Fast-tracking modem connection to foxNet...", { wait: 0 });
        return;
    }

    playModemAudio();
    await type([
        { kind: "type", text: "Establishing Connection to Serenity Relay Servers.....", wait: 12 },
        { kind: "pause", wait: 1200 },
        { kind: "type", text: "Connection found. Beginning Handshake...", wait: 12 },
        { kind: "pause", wait: 1400 },
        { kind: "type", text: "[!] Warning: Signal intercept in progress...", wait: 12 },
        { kind: "pause", wait: 1200 },
        { kind: "type", text: "[!] Bypassing Serenity daemons...", wait: 12 },
        { kind: "pause", wait: 1200 },
        { kind: "type", text: "Serenity Gateway Dropped.", wait: 12 },
        { kind: "pause", wait: 1000 },
        { kind: "type", text: "New connection established: foxNet Relay Node", wait: 16 },
        { kind: "pause", wait: 600 },
        { kind: "type", text: "CyberVixen > Too easy. Welcome to the foxNet, friend.", wait: 12 },
    ]);
}

export function syncThemeToIframe() {
    injectChatCSS();
    renderUserList();
}

export default async function () {
    await runModemConnectionSequence();
    openWindow("chat");
    initFirebaseEngine();
    return {};
}
