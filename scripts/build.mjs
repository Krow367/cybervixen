/**
 * scripts/build.mjs — Production Pre-Deploy Build & Encryption Pipeline
 *
 * Run with:  npm run build
 *
 * What it does:
 *   1. Scans blog/ and recipes/ in src_rewrite/ → writes index.json
 *   2. Synchronizes src_rewrite/ into public/ for live Neocities deployment
 *   3. Strips all debug bypasses, cheat shortcuts, and dev flags from public/
 *   4. Encrypts classified secret ciphers into production bytecode blob
 *   5. Removes obsolete legacy root files from public/
 *   6. Indexes public/blog and public/recipes
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, statSync } from "fs";
import { join, resolve } from "path";

const ROOT_DIR = resolve(new URL(".", import.meta.url).pathname, "..");
const SRC_DIR = join(ROOT_DIR, "src_rewrite");
const DIST_DIR = join(ROOT_DIR, "public");

const DEV_IGNORE_LIST = [
    "hackz",
    ".DS_Store",
    "drive_soundboard.html",
    "shootout.html",
    "soundboard.html",
    "microfiche_ref.mp4",
    "attributions",
    "docs"
];

// Legacy root files from pre-rewrite version that should be cleaned from public/
const LEGACY_OBSOLETE_FILES = [
    "animations.css",
    "ciphers.css",
    "ciphers.js",
    "commands.js",
    "games.js",
    "io.js",
    "mobilecheck.js",
    "pause.js",
    "screen.js",
    "style.css",
    "ui.mjs",
    "windows.js",
    "commands",
    "foxClaw",
    "hackz"
];

// ─── 1. Index Blog & Recipes ──────────────────────────────────────────────────

function buildIndexes(baseDir) {
    const isPublic = baseDir.endsWith("public");
    const label = isPublic ? "public/" : "src_rewrite/";

    const blogDir = join(baseDir, "blog");
    if (existsSync(blogDir)) {
        const blogFiles = readdirSync(blogDir)
            .filter(f => f.endsWith(".html") && f !== "index.json")
            .sort()
            .reverse();
        writeFileSync(join(blogDir, "index.json"), JSON.stringify(blogFiles, null, 4) + "\n");
        console.log(`  ✓ ${label}blog/index.json (${blogFiles.length} posts)`);
    }

    const recipesDir = join(baseDir, "recipes");
    if (existsSync(recipesDir)) {
        const recipeFiles = readdirSync(recipesDir)
            .filter(f =>
                f.endsWith(".html") &&
                !f.endsWith("-print.html") &&
                f !== "index.json" &&
                f !== "recipes.html"
            )
            .sort();
        writeFileSync(join(recipesDir, "index.json"), JSON.stringify(recipeFiles, null, 4) + "\n");
        console.log(`  ✓ ${label}recipes/index.json (${recipeFiles.length} recipes)`);
    }
}

// ─── 2. Recursive Build & Production Transform Pipeline ───────────────────────

function copyDirectoryRecursive(src, dest, ignore = []) {
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
    const entries = readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);

        if (ignore.includes(entry.name)) {
            continue;
        }

        if (entry.isDirectory()) {
            copyDirectoryRecursive(srcPath, destPath, ignore);
        } else {
            const ext = entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase();
            const textExtensions = [".html", ".htm", ".js", ".mjs", ".css", ".json", ".txt", ".md", ".svg"];

            // Binary assets (fonts, images, audio) MUST be copied verbatim as raw bytes
            if (!textExtensions.includes(ext)) {
                copyFileSync(srcPath, destPath);
                continue;
            }

            let content = readFileSync(srcPath, "utf-8");

            // Strip debug flags and developer bypass routines from JS/HTML
            if (entry.name === "index.html") {
                content = content.replace(
                    /const urlParams = new URLSearchParams[\s\S]*?globalThis\.DEBUG\s*=\s*[\s\S]*?;/g,
                    "globalThis.DEBUG = false;"
                );
            } else if (entry.name === "boot.js") {
                content = content.replace(
                    /\/\/\s*───\s*Fast Instant Debug Mode Bypass[\s\S]*?return;\s*\}/g,
                    ""
                );
            } else if (entry.name === "kernel.js") {
                content = content.replace(
                    /\s*\/\/\s*Developer Debug Fast-Boot Mode Toggle[\s\S]*?debug:\s*\{[\s\S]*?\n\s*\}\n(?=\s*\};)/g,
                    ""
                );
            } else if (entry.name === "ciphers.js") {
                // Production Encryption: Obfuscate HIDDEN_CIPHER_DEFINITIONS into ENCRYPTED_ANOMALY_BLOB
                const match = content.match(/export const HIDDEN_CIPHER_DEFINITIONS\s*=\s*(\[[\s\S]*?\]);/);
                if (match) {
                    try {
                        const rawArrayStr = match[1];
                        const hiddenDefs = eval(`(${rawArrayStr})`);
                        const json = JSON.stringify(hiddenDefs);
                        const bytes = [];
                        for (let i = 0; i < json.length; i++) {
                            bytes.push(json.charCodeAt(i) ^ (0x5a + (i % 7)));
                        }
                        const b64 = Buffer.from(bytes).toString("base64");

                        const replacement = `// ─── Encrypted Classified Anomaly Vault ───────────────\n// Nice try, but there are some ciphers you'll have to discover on your own! <3\nconst ENCRYPTED_ANOMALY_BLOB = "${b64}";\n\nfunction getDecryptedAnomalies() {\n    try {\n        const bin = atob(ENCRYPTED_ANOMALY_BLOB);\n        let str = "";\n        for (let i = 0; i < bin.length; i++) {\n            str += String.fromCharCode(bin.charCodeAt(i) ^ (0x5a + (i % 7)));\n        }\n        return JSON.parse(str);\n    } catch {\n        return [];\n    }\n}\n\nexport function getAllCipherDefinitions() {\n    return [...CIPHER_DEFINITIONS, ...getDecryptedAnomalies()];\n}`;

                        content = content.replace(/export const HIDDEN_CIPHER_DEFINITIONS[\s\S]*?export function getAllCipherDefinitions\(\)[\s\S]*?\}/, replacement);
                        console.log(`  ✓ Encrypted ${hiddenDefs.length} classified secret ciphers into production blob.`);
                    } catch (err) {
                        console.error("  ✕ Failed to encrypt hidden ciphers:", err);
                    }
                }
            }

            writeFileSync(destPath, content);
        }
    }
}

// ─── 3. Clean Legacy Pre-Rewrite Artifacts from public/ ────────────────────────

function cleanLegacyArtifacts(dest) {
    for (const legacy of LEGACY_OBSOLETE_FILES) {
        const target = join(dest, legacy);
        if (existsSync(target)) {
            rmSync(target, { recursive: true, force: true });
            console.log(`  - Removed obsolete legacy artifact: ${legacy}`);
        }
    }
}

// ─── 4. Main Build Execution ──────────────────────────────────────────────────

console.log("=================================================================");
console.log(" 🦊 SERENITY / foxOS PRODUCTION BUILD PIPELINE");
console.log("=================================================================");

console.log("\n[1/4] Indexing source collections in src_rewrite/...");
buildIndexes(SRC_DIR);

console.log("\n[2/4] Cleaning legacy pre-rewrite artifacts in public/...");
cleanLegacyArtifacts(DIST_DIR);

console.log("\n[3/4] Compiling and hardening src_rewrite/ -> public/...");
copyDirectoryRecursive(SRC_DIR, DIST_DIR, DEV_IGNORE_LIST);

console.log("\n[4/4] Building production manifests in public/...");
buildIndexes(DIST_DIR);

console.log("\n=================================================================");
console.log(" ✓ Production build complete! public/ is ready for deployment.");
console.log("=================================================================\n");

