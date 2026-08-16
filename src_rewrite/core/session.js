/**
 * session.js — foxOS User Identity, Session Memory & Offline Backup Engine
 * 
 * Schematics:
 * 1. Two-Tier Identity: Guest (Offline NVRAM) vs foxNet Registered Operator.
 * 2. Active Session Management: Persists active handle across page reloads.
 * 3. Offline State Export/Import: Zero-server cross-device save tokens ('backup' / 'restore').
 * 4. Migration Guard: Merges guest progress smoothly when claiming a handle.
 */

import { playBootChime, playBell, playDiskSeek } from "./audio.js";

const SESSION_KEY = "foxos_active_session";
const GUEST_ID = "GUEST";

/**
 * Gets the current active user handle.
 * Defaults to "GUEST" if not authenticated with a handle.
 * 
 * @returns {string} - Upper-case handle (e.g. "GUEST", "KROW")
 */
export function getActiveUser() {
    const isRemembered = localStorage.getItem("foxos_remember_me") === "true";
    if (!isRemembered) {
        return GUEST_ID;
    }
    return (localStorage.getItem(SESSION_KEY) || GUEST_ID).toUpperCase();
}

/**
 * Sets the active user handle in session memory.
 * 
 * @param {string} handle - The operator handle
 * @param {boolean} remember - Whether to persist auto-login for return visits
 */
export function setActiveUser(handle, remember = true) {
    const clean = (handle || GUEST_ID).trim().toUpperCase();
    localStorage.setItem(SESSION_KEY, clean);
    if (clean !== GUEST_ID) {
        localStorage.setItem("foxnet_handle", clean);
        if (remember) {
            localStorage.setItem("foxos_remember_me", "true");
        }
    } else {
        localStorage.setItem("foxos_remember_me", "false");
    }
    return clean;
}

/**
 * Standard simpleHash function matching foxNet Chat PIN hashing.
 */
export function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return hash.toString(36);
}

/**
 * Authenticates a handle and PIN against Firebase RTDB reserved handles.
 * - If handle is reserved: validates PIN or existing valid auth token.
 * - If handle is unreserved and PIN is provided: automatically registers/reserves it.
 * - If offline / network error: allows login with warning or stored local token.
 * 
 * @param {string} handle
 * @param {string} enteredPin
 * @returns {Promise<{ success: boolean, cleanHandle: string, error?: string, isNewRegistration?: boolean }>}
 */
export async function authenticateHandleAndPin(handle, enteredPin = "") {
    const clean = (handle || "").trim();
    if (!clean) return { success: false, error: "Handle cannot be blank." };

    const handleKey = clean.toLowerCase();
    const cleanHandle = clean.toUpperCase();

    // Guests bypass PIN checks
    if (cleanHandle === "GUEST" || cleanHandle.startsWith("GUEST_")) {
        setActiveUser(cleanHandle);
        return { success: true, cleanHandle };
    }

    try {
        const { getDatabase, ref, child, get, set, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js");
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");

        const firebaseConfig = {
            apiKey: "AIzaSyBvUk_WFAnCs2YpfnYsjdFJ0zyoimbguJA",
            authDomain: "foxnet-chat.firebaseapp.com",
            projectId: "foxnet-chat",
            databaseURL: "https://foxnet-chat-default-rtdb.firebaseio.com"
        };

        const app = initializeApp(firebaseConfig, "foxos-auth-session");
        const db = getDatabase(app);

        const handleSnap = await Promise.race([
            get(child(ref(db), `reserved_handles/${handleKey}`)),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500))
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
                setActiveUser(cleanHandle);
                return { success: true, cleanHandle };
            } else {
                // Easter Egg: If attempting to spoof CyberVixen, trigger the hidden cipher and playful denial!
                if (handleKey === "cybervixen" || handleKey === "cv") {
                    try {
                        const { unlockCipher } = await import("../programs/ciphers/ciphers.js");
                        unlockCipher("identity_theft_is_not_a_joke");
                    } catch {}
                    return {
                        success: false,
                        error: `[SYSADMIN HONEYPOT] Did you really think it would be that easy? Better luck next time! Ciao~`
                    };
                }

                return { 
                    success: false, 
                    error: `[AUTH ERROR] ACCESS DENIED: Incorrect PIN for reserved handle '${cleanHandle}'.` 
                };
            }
        } else {
            // Handle IS NOT RESERVED YET!
            if (enteredPin && enteredPin.trim()) {
                const hashedPin = simpleHash(enteredPin.trim());
                await set(ref(db, `reserved_handles/${handleKey}`), {
                    handle: cleanHandle,
                    pinHash: hashedPin,
                    role: "user",
                    createdAt: serverTimestamp()
                });
                localStorage.setItem(`foxnet_authtoken_${handleKey}`, hashedPin);
                setActiveUser(cleanHandle);
                return { success: true, cleanHandle, isNewRegistration: true };
            } else {
                // Logged in without reserving
                setActiveUser(cleanHandle);
                return { success: true, cleanHandle };
            }
        }
    } catch (err) {
        // Fallback: If offline or timeout, check local token
        const myStoredToken = localStorage.getItem(`foxnet_authtoken_${handleKey}`);
        if (myStoredToken) {
            setActiveUser(cleanHandle);
            return { success: true, cleanHandle };
        }
        // If offline and no local token, allow local session
        setActiveUser(cleanHandle);
        return { success: true, cleanHandle };
    }
}

/**
 * Logs out the active user and resets session to GUEST.
 */
export function logoutUser() {
    localStorage.setItem(SESSION_KEY, GUEST_ID);
    localStorage.setItem("foxnet_handle", GUEST_ID);
    localStorage.setItem("foxos_remember_me", "false");
    return GUEST_ID;
}

/**
 * Generates an isolated, zero-server offline backup token of the player's progress.
 * 
 * @returns {string} - Alphanumeric backup token
 */
export function generateBackupToken() {
    const keysToSave = [
        "foxnet_ciphers",
        "helpRepaired",
        "theme",
        "custom_themes",
        "foxhoundState",
        "foxos_user_notes"
    ];

    const state = {};
    for (const key of keysToSave) {
        const val = localStorage.getItem(key);
        if (val !== null) {
            try {
                state[key] = JSON.parse(val);
            } catch {
                state[key] = val;
            }
        }
    }

    const jsonStr = JSON.stringify(state);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    return `FOX-${b64}`;
}

/**
 * Restores an offline backup token into browser localStorage.
 * 
 * @param {string} token - The FOX-... backup token
 * @returns {object} - { success: boolean, count: number, error?: string }
 */
export function restoreBackupToken(token) {
    if (!token || !token.startsWith("FOX-")) {
        return { success: false, error: "Invalid backup token format. Must begin with 'FOX-'" };
    }

    try {
        const rawB64 = token.slice(4).trim();
        const jsonStr = decodeURIComponent(escape(atob(rawB64)));
        const state = JSON.parse(jsonStr);

        let restoredCount = 0;
        for (const [key, val] of Object.entries(state)) {
            const strVal = typeof val === "string" ? val : JSON.stringify(val);
            localStorage.setItem(key, strVal);
            restoredCount++;
        }

        playBootChime();
        return { success: true, count: restoredCount };
    } catch (err) {
        return { success: false, error: `Corrupted or invalid token payload: ${err.message}` };
    }
}
