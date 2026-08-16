/**
 * vault.js — foxOS WebCrypto AES-GCM Encryption & Decryption Subsystem
 * 
 * Implements:
 * 1. Zero-dependency native browser AES-GCM encryption & decryption (crypto.subtle)
 * 2. Secure IV generation and Base64 envelope serialization
 * 3. In-universe Serenity Vault decoding for ARG puzzle payloads and secret lore
 */

/**
 * Encrypts a plaintext string using an AES-GCM password key.
 * 
 * @param {string} plainText - The sensitive secret text or ASCII art
 * @param {string} passwordKey - The passphrase/credential key
 * @returns {Promise<string>} - The encrypted Base64 payload
 */
export async function encryptVault(plainText, passwordKey) {
    const enc = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", enc.encode(passwordKey));
    const cryptoKey = await crypto.subtle.importKey("raw", hashBuffer, { name: "AES-GCM" }, false, ["encrypt"]);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        enc.encode(plainText)
    );

    const combined = new Uint8Array(iv.length + cipherBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuffer), iv.length);

    // Convert Uint8Array to Base64 in chunks to prevent stack limits
    let binary = "";
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
}

/**
 * Decrypts a Base64 AES-GCM ciphertext payload with a password key.
 * 
 * @param {string} base64Cipher - The encrypted Base64 string
 * @param {string} passwordKey - The passphrase/credential key
 * @returns {Promise<string>} - The decrypted plaintext string
 */
export async function decryptVault(base64Cipher, passwordKey) {
    const enc = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", enc.encode(passwordKey));
    const cryptoKey = await crypto.subtle.importKey("raw", hashBuffer, { name: "AES-GCM" }, false, ["decrypt"]);

    const raw = atob(base64Cipher);
    const rawBytes = Uint8Array.from(raw, c => c.charCodeAt(0));

    const iv = rawBytes.slice(0, 12);
    const cipherData = rawBytes.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        cipherData
    );

    return new TextDecoder().decode(decryptedBuffer);
}
