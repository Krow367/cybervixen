/**
 * ciphers.js — FoxOS Network Cipher & Achievement Vault
 */

export const CIPHER_DEFINITIONS = [
    {
        id: "first_contact",
        name: "Where's the Power Button?",
        desc: "Discovered the abandoned terminal and initialized foxOS for the first time.",
        hint: "Just initialize it.",
        icon: "[01]"
    },
    {
        id: "circuit_repair",
        name: "Hardware Hacker",
        desc: "Successfully repaired the corrupted help file and revealed the Project Foxhound floppy disk.",
        hint: "Execute the 'help' command and follow instructions.",
        icon: "[02]"
    },
    {
        id: "hidden_game",
        name: "Credential Spoofer",
        desc: "Discovered and launched the foxHound suite.",
        hint: "Use revealed knowledge to discover the hidden program",
        icon: "[03]"
    },
    {
        id: "archive_diver",
        name: "Digital Echoes",
        desc: "Read a transmission log entry from CyberVixen's blog.",
        hint: "Access the ramblings of a mad fox.",
        icon: "[04]"
    },
    {
        id: "culinary_notes",
        name: "Midnight Snack",
        desc: "Extracted culinary blueprints from cookbook.exe.",
        hint: "Hungry? There's a solution for that.",
        icon: "[05]"
    },
    {
        id: "directory_scout",
        name: "Node Neighbor",
        desc: "Scouted the external Neocities network in web.exe.",
        hint: "Find the connections to friends and neighbors.",
        icon: "[06]"
    },
    {
        id: "chat_signal",
        name: "Carrier Established",
        desc: "Transmitted your first packet across foxNet Chat.",
        hint: "Join the pack and commune with others for the first time.",
        icon: "[07]"
    },
    {
        id: "terminal_master",
        name: "Command Line Prowler",
        desc: "Probed system boundaries through terminal queries.",
        hint: "Experiment with system commands in the command prompt.",
        icon: "[08]"
    }
];

const STORAGE_KEY = "foxnet_ciphers";

// ─── Local State Helpers ─────────────────────────────────────────────────────

export function getUnlockedCiphers() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
        return {};
    }
}

export function getCipherProgress() {
    const unlocked = getUnlockedCiphers();
    const total = CIPHER_DEFINITIONS.length;
    const count = Object.keys(unlocked).length;
    return { count, total, percentage: Math.round((count / total) * 100) };
}

export function isCipherUnlocked(id) {
    const unlocked = getUnlockedCiphers();
    return Boolean(unlocked[id]);
}

export function unlockCipher(id) {
    const def = CIPHER_DEFINITIONS.find(c => c.id === id);
    if (!def) return false;

    const unlocked = getUnlockedCiphers();
    if (unlocked[id]) return false; // Already unlocked

    unlocked[id] = {
        unlockedAt: Date.now(),
        dateStr: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(unlocked));
    updateCipherCounterUI();
    showCipherToast(def);
    syncCiphersToFirebase(unlocked);
    return true;
}

// ─── Toast Notification ──────────────────────────────────────────────────────

function showCipherToast(cipher) {
    const existing = document.getElementById("cipher-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "cipher-toast";
    toast.innerHTML = `
        <div class="cipher-toast-box">
            <div class="cipher-toast-tag">// CIPHER DECRYPTED //</div>
            <div class="cipher-toast-title">${cipher.name}</div>
            <div class="cipher-toast-desc">${cipher.desc}</div>
        </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-show");
    }, 20);

    setTimeout(() => {
        toast.classList.remove("toast-show");
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

// ─── UI Sync Helper ──────────────────────────────────────────────────────────

export function updateCipherCounterUI() {
    const { count, total } = getCipherProgress();
    document.querySelectorAll("[data-cipher-count], #cipher-count").forEach(el => {
        el.textContent = `${count}/${total}`;
    });
}

// ─── Export / Import ─────────────────────────────────────────────────────────

export function exportCipherSaveString() {
    const unlocked = getUnlockedCiphers();
    const payload = {
        h: localStorage.getItem("foxnet_handle") || "guest",
        c: Object.keys(unlocked),
        ts: Date.now()
    };
    return "FOX-" + btoa(JSON.stringify(payload)).replace(/=+$/, "");
}

export function importCipherSaveString(code) {
    try {
        const clean = code.replace(/^FOX-/, "");
        const parsed = JSON.parse(atob(clean));
        if (!parsed.c || !Array.isArray(parsed.c)) return { success: false, msg: "Invalid save string format." };

        const current = getUnlockedCiphers();
        let added = 0;
        parsed.c.forEach(id => {
            if (CIPHER_DEFINITIONS.some(d => d.id === id) && !current[id]) {
                current[id] = { unlockedAt: Date.now(), dateStr: "Imported" };
                added++;
            }
        });

        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        updateCipherCounterUI();
        syncCiphersToFirebase(current);
        return { success: true, count: added, total: Object.keys(current).length };
    } catch (e) {
        return { success: false, msg: "Failed to decode save code." };
    }
}

// ─── Firebase Account Sync ───────────────────────────────────────────────────

async function syncCiphersToFirebase(unlockedMap) {
    const handle = localStorage.getItem("foxnet_handle");
    if (!handle || handle.startsWith("Guest_")) return;

    try {
        const { getDatabase, ref, update } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js");
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");

        const firebaseConfig = {
            apiKey: "AIzaSyBvUk_WFAnCs2YpfnYsjdFJ0zyoimbguJA",
            authDomain: "foxnet-chat.firebaseapp.com",
            projectId: "foxnet-chat",
            databaseURL: "https://foxnet-chat-default-rtdb.firebaseio.com"
        };

        const app = initializeApp(firebaseConfig, "ciphers-sync-app");
        const db = getDatabase(app);
        const handleKey = handle.toLowerCase();

        await update(ref(db, `user_ciphers/${handleKey}`), {
            ciphers: Object.keys(unlockedMap),
            updatedAt: Date.now(),
            count: Object.keys(unlockedMap).length
        });
    } catch (e) {
        console.warn("Cipher cloud sync skipped:", e.message);
    }
}

// ─── Modal Vault Dialog ──────────────────────────────────────────────────────

export function openCipherVaultModal() {
    let modal = document.getElementById("cipher-vault-modal");
    if (modal) {
        modal.hidden = false;
        modal.classList.remove("hidden");
        modal.style.display = "flex";
        renderVaultModalContent(modal);
        return;
    }

    modal = document.createElement("div");
    modal.id = "cipher-vault-modal";
    modal.className = "cipher-modal-overlay";
    document.body.appendChild(modal);
    renderVaultModalContent(modal);
}

export function closeCipherVaultModal() {
    const modal = document.getElementById("cipher-vault-modal");
    if (modal) {
        modal.hidden = true;
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
}

// Global Escape Key Listener for Closing Cipher Modal
window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        const modal = document.getElementById("cipher-vault-modal");
        if (modal && !modal.hidden && modal.style.display !== "none") {
            closeCipherVaultModal();
        }
    }
});

function renderVaultModalContent(modal) {
    const { count, total, percentage } = getCipherProgress();
    const unlocked = getUnlockedCiphers();
    const handle = localStorage.getItem("foxnet_handle") || "";
    const isChatUser = handle && !handle.startsWith("Guest_");

    modal.innerHTML = `
        <div class="cipher-modal-window">
            <div class="cipher-modal-header">
                <div class="header-left">
                    <span class="vault-title">// NETWORK CIPHER VAULT //</span>
                    <span class="vault-stat">${count} / ${total} DECRYPTED (${percentage}%)</span>
                </div>
                <button type="button" class="vault-close-btn" id="btn-close-vault">[ X ]</button>
            </div>

            <!-- Account Sync Status Bar -->
            <div class="vault-account-bar">
                <div class="account-status">
                    <span class="status-label">IDENTITY:</span>
                    <span class="status-val">${isChatUser ? `@${handle}` : "GUEST (LOCAL STORAGE)"}</span>
                    ${isChatUser ? '<span class="status-badge">[ CLOUD SYNC ACTIVE ]</span>' : ""}
                </div>
                <div class="account-actions">
                    <button type="button" id="vault-btn-export" class="vault-mini-btn">[ EXPORT SAVE ]</button>
                    <button type="button" id="vault-btn-import" class="vault-mini-btn">[ IMPORT SAVE ]</button>
                </div>
            </div>

            <!-- Cipher Grid -->
            <div class="vault-grid">
                ${CIPHER_DEFINITIONS.map(c => {
                    const isUnlocked = Boolean(unlocked[c.id]);
                    const info = unlocked[c.id];
                    return `
                        <div class="cipher-card ${isUnlocked ? "unlocked" : "locked"}">
                            <div class="card-top">
                                <span class="card-id">${c.icon}</span>
                                <span class="card-badge">${isUnlocked ? "[ DECRYPTED ]" : "[ ENCRYPTED ]"}</span>
                            </div>
                            <div class="card-name">${isUnlocked ? c.name : "?? ENCRYPTED CIPHER ??"}</div>
                            <div class="card-desc">${isUnlocked ? c.desc : c.hint}</div>
                            ${isUnlocked && info?.dateStr ? `<div class="card-date">Discovered: ${info.dateStr}</div>` : ""}
                        </div>
                    `;
                }).join("")}
            </div>
        </div>
    `;

    // Bind event handlers
    modal.querySelector("#btn-close-vault")?.addEventListener("click", closeCipherVaultModal);
    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeCipherVaultModal();
    });

    modal.querySelector("#vault-btn-export")?.addEventListener("click", () => {
        const str = exportCipherSaveString();
        navigator.clipboard.writeText(str).then(() => {
            alert(`[ SAVE CODE COPIED TO CLIPBOARD ]\n\n${str}\n\nPaste this in another browser or keep it as an offline backup!`);
        }).catch(() => {
            prompt("Copy your Cipher save string below:", str);
        });
    });

    modal.querySelector("#vault-btn-import")?.addEventListener("click", () => {
        const input = prompt("Enter or paste your FOX- save string:");
        if (!input) return;
        const res = importCipherSaveString(input.trim());
        if (res.success) {
            alert(`[ RESTORE COMPLETE ]\n\nRecovered ${res.count} new cipher(s)! Total decrypted: ${res.total}/${CIPHER_DEFINITIONS.length}`);
            renderVaultModalContent(modal);
        } else {
            alert(`[ ERROR ]: ${res.msg}`);
        }
    });
}
