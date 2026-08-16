/**
 * ciphers.js — foxOS Network Cipher & ARG Achievement Engine + Vault Window
 * 
 * Provides:
 * 1. Cipher / Achievement definitions  
 * 2. Hardware Square-Wave Audio Chime & CRT Scanline Toast Notification
 * 3. Dedicated DEC/Unix Vault Window (ciphers / vault command)
 * 4. Offline NVRAM Persistence (foxnet_ciphers) + Cloud Sync when handle is logged in
 * 5. Cross-Device Save String Importer/Exporter (FOX-...)
 */

import { openWindow } from "../../core/windows.js";

export const CIPHER_DEFINITIONS = [
    {
        id: "first_contact",
        name: "Where's the Power Button?",
        desc: "Discovered the abandoned terminal and initialized foxOS for the first time.",
        hint: "Power on the CRT monitor and initialize the operating system.",
        icon: "[01]",
        image: "/img/ciphers/cipher_01.png",
    },
    {
        id: "circuit_repair",
        name: "Hardware Hacker",
        desc: "Successfully diagnosed and repaired corrupted system subroutines.",
        hint: "Rearrange the fragmented bytes to repair the corrupted file.",
        icon: "[02]"
    },
    {
        id: "hidden_game",
        name: "Credential Spoofer",
        desc: "Discovered and launched the covert foxHound simulation cartridge.",
        hint: "Fake credentials are real credentials if the system can't tell they're fake.",
        icon: "[03]"
    },
    {
        id: "archive_diver",
        name: "Digital Echoes",
        desc: "Read a personal transmission log entry from CyberVixen's blog.",
        hint: "Find the ramblings of a mad fox lost in the wires.",
        icon: "[04]"
    },
    {
        id: "culinary_notes",
        name: "Midnight Snack",
        desc: "Extracted culinary blueprints from recipes.exe.",
        hint: "Even netizens need to eat.",
        icon: "[05]"
    },
    {
        id: "directory_scout",
        name: "Node Neighbor",
        desc: "Scouted the external Neocities network in web.exe.",
        hint: "Look beyond the borders of your domain to find new friends.",
        icon: "[06]"
    },
    {
        id: "chat_signal",
        name: "Carrier Established",
        desc: "Transmitted your first packet across foxNet Relay Chat.",
        hint: "Shout into the void... and perhaps receive a reply.",
        icon: "[07]"
    },
    {
        id: "terminal_master",
        name: "Command Line Prowler",
        desc: "Probed system boundaries through extensive terminal queries.",
        hint: "Access to the secrets is already at your fingertips.",
        icon: "[08]"
    }
];

// ─── Classified Secret Anomaly Ciphers ───────────────────────────────────────
//Nice try, but I won't give you ALL the secrets that easily! Some things you'll just have to discover for yourself. <3 CV
// ─── Encrypted Classified Anomaly Vault ───────────────
// Nice try, but there are some ciphers you'll have to discover on your own! <3
const ENCRYPTED_ANOMALY_BLOB = "ASB+NDp9WngzPS42PRI1LDIuAT4OPgQvPDIrQnZ5MjwzOkJgeQ8yKy0DP3sfMjo6QBspPzU/Og82NDs0LStCdnk4OC08QmB5GSU9PhY7Lzk5fj4OPns1My0vBTkvOTl+Kwg/eykzOjoSNiI1Mzl/AygiLCkxOBI7KzQ0PX8DOykoLzc7Bz97LzIrLQM/dX5xfDcJNC9+Z3wKDj4yLz4xKQUoPjh9LToDKD4ofS0mEy4+MX0/MQ83OjAkcH1MeDI/MjB9WngAY2IDfUx4MzU5OjoOeGEoLys6HXYgfjQ6fVp4KD0wAT4OPgQ4OD8xQnZ5MjwzOkJgeQUyK3gSP3s9fQk2DjkzOS4qOhJ6NTMqfHNCPj4vPnxlQhI+PS86fxQyPnwxPywUeiwzLzosQDU9fDx+MwU9PjI5Py0ZehMpMyo6EnR5cH82Ng4ueWZ/CzEEMyg/Mig6Ej8/fC47PBI/L3wuJywUPzZ8PDAwDTs3JXN8c0IzODMzfGVCAWRjAHxzQjIyODk7MUJgLy4oOyJMIXk1OXxlQjM/OTMqNhQjBCg1OzkUBTIvAjAwFAU6AzcxNAV4d34zPzIFeGF+Gz8yDy8ofBQzLw8pLzMvLX1MeD85Lj19WngfNTl+Jg8vey44PzMMI3soNTcxC3oyKH0pMBU2P3w/O38UMjoofTs+EyNkfB87KxQ/KXwxKzwLejU5JSp/FDM2OXx+HAk7NCJ/cn0IMzUof2R9NTQ/NS49MBY/KTk5fiwFOSk5KX4sGSkvOTB+Pg41Nj0xJ3FCdnk1PjExQmB5B2JhAkJ2eTQ0OjsFNHlmKSwqBScG";

function getDecryptedAnomalies() {
    try {
        const bin = atob(ENCRYPTED_ANOMALY_BLOB);
        let str = "";
        for (let i = 0; i < bin.length; i++) {
            str += String.fromCharCode(bin.charCodeAt(i) ^ (0x5a + (i % 7)));
        }
        return JSON.parse(str);
    } catch {
        return [];
    }
}

export function getAllCipherDefinitions() {
    return [...CIPHER_DEFINITIONS, ...getDecryptedAnomalies()];
}

const STORAGE_KEY = "foxnet_ciphers";

// ─── Audio Synthesizer: 8-Bit Victory Chime ─────────────────────────────────

function playCipherUnlockSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === "suspended") ctx.resume();

        const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5 arpeggio
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "square";
            osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

            gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.08);
            gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + idx * 0.08 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + idx * 0.08);
            osc.stop(ctx.currentTime + idx * 0.08 + 0.26);
        });

        setTimeout(() => ctx.close(), 1000);
    } catch {}
}

// ─── Local State Helpers ─────────────────────────────────────────────────────

export function getUnlockedCiphers() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
        return {};
    }
}

export function getCipherProgress() {
    const allDefs = getAllCipherDefinitions();
    const unlocked = getUnlockedCiphers();
    // Only count visible standard ciphers + any discovered hidden ciphers
    const visibleDefs = allDefs.filter(c => !c.hidden || Boolean(unlocked[c.id]));
    const total = visibleDefs.length;
    const count = visibleDefs.filter(c => Boolean(unlocked[c.id])).length;
    return { count, total, percentage: total > 0 ? Math.round((count / total) * 100) : 0 };
}

export function isCipherUnlocked(id) {
    const unlocked = getUnlockedCiphers();
    return Boolean(unlocked[id]);
}

/**
 * Unlocks a cipher achievement if not already earned.
 */
export function unlockCipher(id) {
    const allDefs = getAllCipherDefinitions();
    const def = allDefs.find(c => c.id === id);
    if (!def) return false;

    const unlocked = getUnlockedCiphers();
    if (unlocked[id]) return false; // Already unlocked

    unlocked[id] = {
        unlockedAt: Date.now(),
        dateStr: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(unlocked));
    playCipherUnlockSound();
    showCipherToast(def);
    syncCiphersToFirebase(unlocked);

    // Notify window components of cipher unlock
    window.dispatchEvent(new CustomEvent("foxos_cipher_unlocked", { detail: { cipher: def } }));
    return true;
}

// ─── CRT Scanline Toast Notification ─────────────────────────────────────────

function showCipherToast(cipher) {
    const existing = document.getElementById("cipher-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "cipher-toast";
    toast.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 100000;
        background: var(--boot, #041106);
        border: 1px solid var(--phosphor);
        box-shadow: 0 0 16px rgba(var(--phosphor-rgb), 0.5), inset 0 0 8px rgba(var(--phosphor-rgb), 0.2);
        padding: 10px 16px;
        font-family: var(--terminal-font-family, 'VT323', monospace);
        color: var(--phosphor);
        max-width: 340px;
        cursor: var(--cursor-pointer, pointer);
        pointer-events: auto;
        transform: translateY(-20px);
        opacity: 0;
        transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;

    toast.innerHTML = `
        <div style="font-size: 0.85em; opacity: 0.8; letter-spacing: 1.5px; border-bottom: 1px dashed rgba(var(--phosphor-rgb), 0.4); padding-bottom: 3px; margin-bottom: 5px; display: flex; justify-content: space-between;">
            <span>// ${cipher.hidden ? "SECRET CIPHER DISCOVERED" : "CIPHER DECRYPTED"} ${cipher.icon || "[??]"} //</span>
            <span style="opacity: 0.6; font-size: 0.75em;">[OPEN]</span>
        </div>
        <div style="font-size: 1.25em; font-weight: bold; text-shadow: 0 0 6px var(--phosphor); margin-bottom: 2px;">
            ${cipher.name}
        </div>
        <div style="font-size: 0.95em; opacity: 0.85; line-height: 1.25; margin-bottom: 6px;">
            ${cipher.desc}
        </div>
        <div style="font-size: 0.75em; opacity: 0.6; text-align: right; letter-spacing: 1px;">
            ▶ Click to inspect vault
        </div>
    `;

    // Click to launch Cipher Vault window
    toast.addEventListener("click", () => {
        launchCipherVault();
        toast.remove();
    });

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.transform = "translateY(0)";
        toast.style.opacity = "1";
    });

    setTimeout(() => {
        if (document.body.contains(toast)) {
            toast.style.transform = "translateY(-20px)";
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 300);
        }
    }, 5500);
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
        const clean = code.trim().replace(/^FOX-/, "");
        const parsed = JSON.parse(atob(clean));
        if (!parsed.c || !Array.isArray(parsed.c)) return { success: false, msg: "Invalid save token format." };

        const current = getUnlockedCiphers();
        let added = 0;
        parsed.c.forEach(id => {
            if (CIPHER_DEFINITIONS.some(d => d.id === id) && !current[id]) {
                current[id] = { unlockedAt: Date.now(), dateStr: "Restored from Token" };
                added++;
            }
        });

        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
        syncCiphersToFirebase(current);
        window.dispatchEvent(new CustomEvent("foxos_cipher_unlocked"));
        return { success: true, count: added, total: Object.keys(current).length };
    } catch (e) {
        return { success: false, msg: "Failed to decode backup token." };
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
    } catch {}
}

// ─── Vault Window Cartridge Implementation ───────────────────────────────────

export function launchCipherVault(ctx) {
    const renderVault = () => {
        const allDefs = getAllCipherDefinitions();
        const { count, total, percentage } = getCipherProgress();
        const unlocked = getUnlockedCiphers();
        const handle = localStorage.getItem("foxnet_handle") || "";
        const isChatUser = handle && !handle.startsWith("Guest_");

        return `
        <div style="display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; background: transparent; font-family: inherit; font-size: inherit; color: var(--phosphor);">
            
            <!-- Vault Status & Identity Header -->
            <div style="padding: 10px 14px; border-bottom: 1px solid rgba(var(--phosphor-rgb), 0.4); background: rgba(0, 0, 0, 0.4); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; flex-shrink: 0;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.15em; font-weight: bold; text-shadow: 0 0 6px var(--phosphor); letter-spacing: 1px;">
                        CIPHER VAULT: ${count} / ${total} DECRYPTED (${percentage}%)
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.9em;">
                    <span style="opacity: 0.75;">OPERATOR:</span>
                    <strong style="color: var(--phosphor);">${isChatUser ? `@${handle}` : "GUEST (OFFLINE NVRAM)"}</strong>
                    <button type="button" id="btn-export-cipher-token" style="margin-left: 8px; background: rgba(var(--phosphor-rgb), 0.1); border: 1px solid var(--phosphor); color: var(--phosphor); font-family: inherit; font-size: inherit; padding: 2px 8px; cursor: pointer;">
                        [ EXPORT TOKEN ]
                    </button>
                    <button type="button" id="btn-import-cipher-token" style="background: rgba(var(--phosphor-rgb), 0.1); border: 1px solid var(--phosphor); color: var(--phosphor); font-family: inherit; font-size: inherit; padding: 2px 8px; cursor: pointer;">
                        [ IMPORT TOKEN ]
                    </button>
                </div>
            </div>

            <!-- Vault Scrollable Viewport with CRT Hardware Scrollbar -->
            <div class="scrollbox" data-scrollbox style="flex: 1; min-height: 0; position: relative; display: flex;">
                <div class="scrollbox-viewport" id="vault-cards-viewport" data-viewport style="flex: 1; overflow-y: auto; padding: 0.8em; display: flex; flex-direction: column; gap: 1.2em; box-sizing: border-box;">
                    
                    <!-- ─── SECTION 1: CANONICAL ARG CIPHERS ─── -->
                    <div>
                        <div style="font-size: 0.85em; font-weight: bold; letter-spacing: 1.5px; opacity: 0.8; margin-bottom: 0.6em; border-bottom: 1px dashed rgba(var(--phosphor-rgb), 0.35); padding-bottom: 3px; display: flex; justify-content: space-between;">
                            <span>// [01]-[08] CANONICAL SYSTEM CIPHERS //</span>
                            <span>PRIMARY INDEX</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, 17.5em); justify-content: start; gap: 0.8em;">
                            ${allDefs.filter(c => !c.hidden).map(c => {
                                const isUnlocked = Boolean(unlocked[c.id]);
                                const info = unlocked[c.id];
                                const iconDisplay = c.image 
                                    ? `<img src="${c.image}" alt="${c.name}" style="width: 100%; height: 100%; image-rendering: pixelated; object-fit: contain;">`
                                    : `<span style="font-size: 0.82em; font-weight: bold; letter-spacing: 0.5px; white-space: nowrap;">${c.icon || "[00]"}</span>`;

                                return `
                                    <div class="cipher-card" style="width: 17.5em; height: 7.2em; border: 1px ${isUnlocked ? "solid var(--phosphor)" : "dashed rgba(var(--phosphor-rgb), 0.3)"}; background: ${isUnlocked ? "rgba(var(--phosphor-rgb), 0.08)" : "rgba(0, 0, 0, 0.45)"}; padding: 0.65em; border-radius: 3px; display: flex; align-items: flex-start; gap: 0.7em; box-sizing: border-box; box-shadow: ${isUnlocked ? "0 0 10px rgba(var(--phosphor-rgb), 0.2)" : "none"}; flex-shrink: 0;">
                                        <!-- Scaled Icon Frame Slot -->
                                        <div style="width: 3.4em; height: 3.4em; min-width: 3.4em; border: 1px ${isUnlocked ? "solid var(--phosphor)" : "dashed rgba(var(--phosphor-rgb), 0.35)"}; background: ${isUnlocked ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.5)"}; display: flex; align-items: center; justify-content: center; box-shadow: ${isUnlocked ? "inset 0 0 6px rgba(var(--phosphor-rgb), 0.4)" : "none"}; flex-shrink: 0; padding: 4px; box-sizing: border-box; overflow: hidden;">
                                            ${isUnlocked ? iconDisplay : `<span style="font-size: 0.78em; opacity: 0.4; white-space: nowrap;">${c.icon || "[00]"}</span>`}
                                        </div>

                                        <!-- Card Content Area -->
                                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; height: 100%; overflow: hidden;">
                                            <div>
                                                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed rgba(var(--phosphor-rgb), 0.25); padding-bottom: 2px; margin-bottom: 3px;">
                                                    <span style="font-size: 0.75em; letter-spacing: 0.5px; opacity: 0.8;">${c.icon || "[00]"}</span>
                                                    <span style="font-size: 0.7em; font-weight: bold; padding: 1px 4px; border-radius: 2px; ${isUnlocked ? "background: var(--phosphor); color: #000; text-shadow: none;" : "border: 1px solid rgba(var(--phosphor-rgb), 0.4); opacity: 0.7;"}">
                                                        ${isUnlocked ? "[ DECRYPTED ]" : "[ ENCRYPTED ]"}
                                                    </span>
                                                </div>
                                                <div style="font-size: 1.02em; font-weight: bold; margin-bottom: 2px; color: var(--phosphor); text-shadow: ${isUnlocked ? "0 0 4px var(--phosphor)" : "none"}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${isUnlocked ? c.name : '?? ENCRYPTED CIPHER ??'}">
                                                    ${isUnlocked ? c.name : "?? ENCRYPTED CIPHER ??"}
                                                </div>
                                                <div style="font-size: 0.82em; opacity: ${isUnlocked ? "0.9" : "0.75"}; line-height: 1.25; font-style: ${isUnlocked ? "normal" : "italic"}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${isUnlocked ? c.desc : `HINT: ${c.hint}`}">
                                                    ${isUnlocked ? c.desc : `HINT: ${c.hint}`}
                                                </div>
                                            </div>
                                            ${isUnlocked && info?.dateStr ? `
                                                <div style="font-size: 0.7em; opacity: 0.65; border-top: 1px dashed rgba(var(--phosphor-rgb), 0.2); padding-top: 2px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                    Decrypted: ${info.dateStr}
                                                </div>
                                            ` : ""}
                                        </div>
                                    </div>
                                `;
                            }).join("")}
                        </div>
                    </div>

                    <!-- ─── SECTION 2: CLASSIFIED & HIDDEN ANOMALIES ─── -->
                    <div>
                        <div style="font-size: 0.85em; font-weight: bold; letter-spacing: 1.5px; opacity: 0.8; margin-bottom: 0.6em; border-bottom: 1px dashed rgba(var(--phosphor-rgb), 0.35); padding-bottom: 3px; display: flex; justify-content: space-between;">
                            <span>// [??] CLASSIFIED SYSTEM ANOMALIES //</span>
                            <span style="opacity: 0.6;">RESTRICTED SECTOR</span>
                        </div>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, 17.5em); justify-content: start; gap: 0.8em;">
                            ${allDefs.filter(c => c.hidden).map(c => {
                                const isUnlocked = Boolean(unlocked[c.id]);
                                const info = unlocked[c.id];

                                if (!isUnlocked) {
                                    return `
                                        <div class="cipher-card cipher-card-hidden" style="width: 17.5em; height: 7.2em; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0, 0, 0, 0.75); padding: 0.65em; border-radius: 3px; display: flex; align-items: center; gap: 0.7em; box-sizing: border-box; opacity: 0.35; user-select: none; flex-shrink: 0;">
                                            <!-- Dynamic Scaled Mystery Slot -->
                                            <div style="width: 3.4em; height: 3.4em; min-width: 3.4em; border: 1px dashed rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; font-size: 1.1em; color: rgba(255, 255, 255, 0.3); padding: 4px; box-sizing: border-box;">
                                                ?
                                            </div>
                                            <div style="flex: 1; min-width: 0;">
                                                <div style="font-size: 0.75em; letter-spacing: 1px; color: rgba(255, 255, 255, 0.25); margin-bottom: 2px;">
                                                    [ CLASSIFIED ANOMALY ]
                                                </div>
                                                <div style="font-size: 1.05em; font-weight: bold; color: rgba(255, 255, 255, 0.2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                    ░░░░░░░░░░░░░░
                                                </div>
                                                <div style="font-size: 0.85em; color: rgba(255, 255, 255, 0.18); line-height: 1.2; margin-top: 2px;">
                                                    Undiscovered secret subroutine.
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }

                                const iconDisplay = c.image 
                                    ? `<img src="${c.image}" alt="${c.name}" style="width: 100%; height: 100%; image-rendering: pixelated; object-fit: contain;">`
                                    : `<span style="font-size: 0.82em; font-weight: bold; letter-spacing: 0.5px; white-space: nowrap;">${c.icon || "[??]"}</span>`;

                                return `
                                    <div class="cipher-card" style="width: 17.5em; height: 7.2em; border: 1px solid var(--phosphor); background: rgba(var(--phosphor-rgb), 0.12); padding: 0.65em; border-radius: 3px; display: flex; align-items: flex-start; gap: 0.7em; box-sizing: border-box; box-shadow: 0 0 12px rgba(var(--phosphor-rgb), 0.3); flex-shrink: 0;">
                                        <div style="width: 3.4em; height: 3.4em; min-width: 3.4em; border: 1px solid var(--phosphor); background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 6px rgba(var(--phosphor-rgb), 0.4); flex-shrink: 0; padding: 4px; box-sizing: border-box; overflow: hidden;">
                                            ${iconDisplay}
                                        </div>
                                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; height: 100%; overflow: hidden;">
                                            <div>
                                                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed rgba(var(--phosphor-rgb), 0.25); padding-bottom: 2px; margin-bottom: 3px;">
                                                    <span style="font-size: 0.75em; letter-spacing: 0.5px; opacity: 0.8;">[SECRET]</span>
                                                    <span style="font-size: 0.7em; font-weight: bold; padding: 1px 4px; border-radius: 2px; background: var(--phosphor); color: #000; text-shadow: none;">
                                                        [ REVEALED ]
                                                    </span>
                                                </div>
                                                <div style="font-size: 1.02em; font-weight: bold; margin-bottom: 2px; color: var(--phosphor); text-shadow: 0 0 4px var(--phosphor); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${c.name}">
                                                    ${c.name}
                                                </div>
                                                <div style="font-size: 0.82em; opacity: 0.9; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${c.desc}">
                                                    ${c.desc}
                                                </div>
                                            </div>
                                            ${info?.dateStr ? `
                                                <div style="font-size: 0.7em; opacity: 0.65; border-top: 1px dashed rgba(var(--phosphor-rgb), 0.2); padding-top: 2px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                                    Discovered: ${info.dateStr}
                                                </div>
                                            ` : ""}
                                        </div>
                                    </div>
                                `;
                            }).join("")}
                        </div>
                    </div>

                </div>
                <div class="scrollbar" data-scrollbar>
                    <button class="scrollbar-btn scrollbar-up" data-scroll="up" title="Scroll Up">▲</button>
                    <div class="scrollbar-track" data-track>
                        <div class="scrollbar-thumb" data-thumb></div>
                    </div>
                    <button class="scrollbar-btn scrollbar-down" data-scroll="down" title="Scroll Down">▼</button>
                </div>
            </div>
        </div>
        `;
    };

    const win = openWindow("ciphers", {
        title: "// NETWORK CIPHER VAULT //",
        width: Math.min(840, Math.round(window.innerWidth * 0.85)),
        height: Math.min(520, Math.round(window.innerHeight * 0.8)),
        content: renderVault()
    });

    const bindVaultEvents = () => {
        const body = win.element.querySelector(".window-body");
        if (!body) return;

        // Export save token
        body.querySelector("#btn-export-cipher-token")?.addEventListener("click", () => {
            const token = exportCipherSaveString();
            if (navigator.clipboard) {
                navigator.clipboard.writeText(token).then(() => {
                    alert(`[ CIPHER BACKUP TOKEN COPIED ]\n\n${token}\n\nPaste this on any other terminal to restore your unlocked ciphers!`);
                }).catch(() => {
                    prompt("Your Cipher Backup Token:", token);
                });
            } else {
                prompt("Your Cipher Backup Token:", token);
            }
        });

        // Import save token
        body.querySelector("#btn-import-cipher-token")?.addEventListener("click", () => {
            const code = prompt("Enter or paste your FOX- Cipher backup token:");
            if (!code) return;
            const res = importCipherSaveString(code);
            if (res.success) {
                alert(`[ RESTORE COMPLETE ]\n\nRestored ${res.count} new cipher(s)!\nTotal unlocked: ${res.total}/${CIPHER_DEFINITIONS.length}`);
                const bodyEl = win.element.querySelector(".window-body");
                if (bodyEl) {
                    bodyEl.innerHTML = renderVault();
                    bindVaultEvents();
                }
            } else {
                alert(`[ RESTORE FAILED ]: ${res.msg}`);
            }
        });
    };

    bindVaultEvents();

    // Auto-refresh if a cipher is decrypted while the window is open
    const onUnlock = () => {
        if (!document.body.contains(win.element)) {
            window.removeEventListener("foxos_cipher_unlocked", onUnlock);
            return;
        }
        const bodyEl = win.element.querySelector(".window-body");
        if (bodyEl) {
            bodyEl.innerHTML = renderVault();
            bindVaultEvents();
        }
    };
    window.addEventListener("foxos_cipher_unlocked", onUnlock);

    ctx?.print?.("[OK] Network Cipher Vault loaded.");
}
