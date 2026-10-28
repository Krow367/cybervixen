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
    return Math.abs(hash).toString(36);
}

function legacySignedHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return hash.toString(36);
}

/**
 * Cryptographic SHA-256 salted PIN hash (64-char hex).
 * Salted with the lowercase handleKey so identical PINs across users never share a hash.
 */
export async function hashPinSecure(handleKey, pin) {
    const cleanKey = (handleKey || "").trim().toLowerCase();
    const cleanPin = (pin || "").trim();
    if (!cleanKey || !cleanPin) return "";
    const payload = `foxos_pin_v2:${cleanKey}:${cleanPin}`;
    if (globalThis.crypto && globalThis.crypto.subtle) {
        const msgBuffer = new TextEncoder().encode(payload);
        const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }
    // Fallback if subtle crypto unavailable (non-HTTPS local IP)
    return (simpleHash(payload) + simpleHash(cleanPin + cleanKey)).padEnd(64, "0").slice(0, 64);
}

/**
 * Verifies a candidate 64-char SHA-256 token against the non-enumerable
 * /handle_pins/<handleKey>/<token> vault in Firebase RTDB.
 * Because /handle_pins/<handleKey> has .read: false and /handle_pins/<handleKey>/<token>
 * has .read: "data.exists()", Firebase only allows reading the path if the token is exact.
 */
export async function verifyPinInVault(db, ref, get, handleKey, candidateToken) {
    if (!candidateToken || candidateToken.length !== 64) return false;
    try {
        const vaultSnap = await get(ref(db, `handle_pins/${handleKey}/${candidateToken}`));
        return Boolean(vaultSnap && vaultSnap.exists() && vaultSnap.val() === true);
    } catch {
        // PERMISSION_DENIED means the candidateToken does not exist in handle_pins
        return false;
    }
}

/**
 * Authenticates a handle and PIN against Firebase RTDB reserved handles.
 * - If handle is reserved: validates PIN or existing valid auth token against /handle_pins/<handleKey>/<sha256>.
 * - Automatically migrates legacy simpleHash PINs to the unreadable /handle_pins vault.
 * - If handle is unreserved and PIN is provided: registers it in /reserved_handles and /handle_pins.
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
        const { getDatabase, ref, child, get, set, update, remove, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js");
        const { initializeApp, getApps, getApp } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
        const { getUnlockedCiphers, syncCiphersToFirebase } = await import("../programs/ciphers/ciphers.js");

        const firebaseConfig = {
            apiKey: "AIzaSyBvUk_WFAnCs2YpfnYsjdFJ0zyoimbguJA",
            authDomain: "foxnet-chat.firebaseapp.com",
            projectId: "foxnet-chat",
            databaseURL: "https://foxnet-chat-default-rtdb.firebaseio.com"
        };

        const appName = "foxos-auth-session";
        const app = getApps().some(a => a.name === appName)
            ? getApp(appName)
            : initializeApp(firebaseConfig, appName);
        const db = getDatabase(app);

        const handleSnap = await Promise.race([
            get(child(ref(db), `reserved_handles/${handleKey}`)),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3500))
        ]);

        const reservedData = handleSnap ? handleSnap.val() : null;

        if (reservedData) {
            // Handle IS RESERVED!
            const myStoredToken = localStorage.getItem(`foxnet_authtoken_${handleKey}`) || "";
            const trimmedPin = enteredPin ? enteredPin.trim() : "";
            const sha256Pin = trimmedPin ? await hashPinSecure(handleKey, trimmedPin) : "";

            // 1. Check non-enumerable /handle_pins/<handleKey>/<token> vault
            let isAuthenticated = false;
            let activeToken = "";

            if (sha256Pin && await verifyPinInVault(db, ref, get, handleKey, sha256Pin)) {
                isAuthenticated = true;
                activeToken = sha256Pin;
            } else if (myStoredToken.length === 64 && await verifyPinInVault(db, ref, get, handleKey, myStoredToken)) {
                isAuthenticated = true;
                activeToken = myStoredToken;
            } else if (reservedData.pinHash) {
                // 2. Legacy fallback & automatic migration to /handle_pins/<handleKey>/<sha256>
                const legacyStoredPinHash = reservedData.pinHash;
                const legacyEnteredUnsigned = trimmedPin ? simpleHash(trimmedPin) : "";
                const legacyEnteredSigned = trimmedPin ? legacySignedHash(trimmedPin) : "";
                const isLegacyPinMatch = Boolean(trimmedPin) && (
                    legacyEnteredUnsigned === legacyStoredPinHash ||
                    legacyEnteredSigned === legacyStoredPinHash ||
                    sha256Pin === legacyStoredPinHash
                );

                if (isLegacyPinMatch || myStoredToken === legacyStoredPinHash) {
                    isAuthenticated = true;
                    activeToken = sha256Pin || legacyStoredPinHash;
                    // If user typed their PIN, upgrade their account to SHA-256 vault and scrub exposed pinHash
                    if (sha256Pin) {
                        try {
                            await set(ref(db, `handle_pins/${handleKey}/${sha256Pin}`), true);
                            await remove(ref(db, `reserved_handles/${handleKey}/pinHash`));
                            await update(ref(db, `reserved_handles/${handleKey}`), { isReserved: true });
                        } catch {}
                    }
                }
            }

            if (isAuthenticated) {
                localStorage.setItem(`foxnet_authtoken_${handleKey}`, activeToken);
                setActiveUser(cleanHandle);
                await syncCiphersToFirebase();
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
                const sha256Pin = await hashPinSecure(handleKey, enteredPin.trim());
                const unlockedIds = Object.keys(getUnlockedCiphers());
                await set(ref(db, `handle_pins/${handleKey}/${sha256Pin}`), true);
                await set(ref(db, `reserved_handles/${handleKey}`), {
                    handle: cleanHandle,
                    isReserved: true,
                    role: "user",
                    ciphers: unlockedIds,
                    createdAt: serverTimestamp()
                });
                localStorage.setItem(`foxnet_authtoken_${handleKey}`, sha256Pin);
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
