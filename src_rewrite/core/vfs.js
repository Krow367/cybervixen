/**
 * vfs.js — Modular VFS Engine for foxOS
 * 
 * Schematics:
 * 1. Consumes the flat `systemManifest` from `vfs_manifest.js`.
 * 2. Compiles a live multi-drive hierarchy (A:, B:, C:) dynamically on demand.
 * 3. Enforces file types (.TXT, .EXE, .BAT, .SYS, .ROM, .DAT, .WAD, .BIN).
 * 4. Merges dynamic user-created notes from localStorage NVRAM.
 * 5. Provides 'tree' rendering, drive switching, and live static source inspection.
 */

import { systemManifest } from "./vfs_manifest.js";
import { getActiveUser } from "./session.js";
import { playDiskSeek } from "./audio.js";

// ─── Drive Volume Metadata ───────────────────────────────────────────────────
export const DRIVE_INFO = {
    A: { label: "SERENITY_FLOPPY", type: "floppy_525", writeProtected: true },
    C: { label: "SERENITY_HD10", type: "winchester", writeProtected: false }
};

// ─── Active Working State ────────────────────────────────────────────────────
let currentDrive = "C";
let currentPath = ["USERS", getActiveUser()];

/**
 * Resets the working directory to the user's home folder on login/logout.
 */
export function resetCurrentPathToUser(handle) {
    currentDrive = "C";
    currentPath = ["USERS", (handle || getActiveUser()).toUpperCase()];
}

/**
 * Returns the unified DOS-style prompt string (e.g. C:\USERS\CYBERVIXEN> )
 */
export function getPromptPath() {
    const sub = currentPath.length === 0 ? "" : currentPath.join("\\");
    return `${currentDrive}:\\${sub}> `;
}

/**
 * Switches the active hardware drive (e.g. A:, B:, C:)
 */
export function switchDrive(driveLetter) {
    if (!driveLetter) return { success: false, error: "No drive specified." };
    const letter = driveLetter.toUpperCase().replace(/[:\/\\]/g, "");

    if (!DRIVE_INFO[letter]) {
        return { success: false, error: `Invalid drive specification: '${letter}:'` };
    }

    currentDrive = letter;
    currentPath = []; // Land at root of selected drive

    if (letter === "A" || letter === "B") {
        playDiskSeek(3);
        return {
            success: true,
            message: `[SHUGART SA400 FDC] DRIVE ${letter}: SPINDLE MOTOR ENGAGED // 300 RPM`
        };
    } else {
        playDiskSeek(1);
        return {
            success: true,
            message: `[SEAGATE ST-506 MFM] DRIVE C: WINCHESTER HEAD ALIGNED`
        };
    }
}

/**
 * Compiles all active files (system manifest + localStorage NVRAM notes)
 * into a single flat lookup list, evaluating visibility guards dynamically.
 */
function getAllActiveFiles() {
    const files = [];

    // 1. Static Manifest Files (filtering out hidden/locked files)
    for (const record of systemManifest) {
        if (typeof record.visible === "function" && !record.visible()) {
            continue; // File condition guard returned false
        }
        files.push({ ...record });
    }

    // 2. Dynamic User Files from localStorage (Mounted on C:)
    try {
        const user = getActiveUser().toUpperCase();
        const customNotesKey = `foxos_user_notes_${user}`;
        const savedNotes = JSON.parse(localStorage.getItem(customNotesKey) || "{}");

        for (const [savedPath, content] of Object.entries(savedNotes)) {
            // Ensure path format C:/USERS/<USER>/...
            let fullPath = savedPath.replace(/\\/g, "/").toUpperCase();
            if (!fullPath.includes(":")) {
                fullPath = `C:/${fullPath}`;
            }

            const fileName = fullPath.split("/").pop();
            const ext = fileName.includes(".") ? fileName.split(".").pop().toLowerCase() : "txt";

            files.push({
                path: fullPath,
                type: ext,
                content: content,
                size: `${content.length} B`,
                date: "08-16-81",
                time: "12:00p",
                isUserFile: true
            });
        }
    } catch (e) {
        console.warn("[VFS] Failed to load localStorage notes:", e);
    }

    return files;
}

/**
 * Normalizes any relative or absolute path string into { drive, segments }
 * e.g. "..", "PROGRAMS", "A:\FOXHOUND.EXE", "/USERS/GUEST"
 */
function normalizePathInput(pathStr) {
    let raw = (pathStr || "").replace(/\\/g, "/").trim();
    if (raw.toUpperCase().startsWith("FOXOS:")) raw = raw.slice(6);

    let drive = currentDrive;
    const driveMatch = raw.match(/^([A-Za-z]):(.*)/);
    if (driveMatch) {
        drive = driveMatch[1].toUpperCase();
        raw = driveMatch[2];
    }

    const parts = raw.split("/").filter(p => p.length > 0 && p !== ".");
    let segments = [];
    if (!driveMatch && !raw.startsWith("/")) {
        segments = [...currentPath];
    }

    for (const part of parts) {
        if (part === "..") {
            if (segments.length > 0) segments.pop();
        } else {
            segments.push(part.toUpperCase());
        }
    }

    return { drive, segments };
}

/**
 * Resolves a given path into a file record, directory presence, or null.
 */
export function resolvePath(pathStr) {
    const { drive, segments } = normalizePathInput(pathStr);
    const targetDrive = DRIVE_INFO[drive] ? drive : currentDrive;
    const allFiles = getAllActiveFiles();

    // 1. Check if matching exact File Path
    const fullPathStr = `${targetDrive}:/${segments.join("/")}`.toUpperCase();
    const exactFile = allFiles.find(f => f.path.replace(/\\/g, "/").toUpperCase() === fullPathStr);

    if (exactFile) {
        return {
            type: "file",
            file: exactFile,
            node: { ...exactFile, name: segments[segments.length - 1] },
            drive: targetDrive,
            path: segments
        };
    }

    // 2. Check if matching Directory Path (any active file lives under this prefix)
    const dirPrefix = segments.length === 0 ? `${targetDrive}:/` : `${targetDrive}:/${segments.join("/")}/`;
    const isDir = segments.length === 0 || allFiles.some(f => f.path.replace(/\\/g, "/").toUpperCase().startsWith(dirPrefix));

    if (isDir) {
        return {
            type: "dir",
            node: { type: "dir", name: segments[segments.length - 1] || "" },
            drive: targetDrive,
            path: segments
        };
    }

    return { type: null, node: null, drive: targetDrive, path: segments };
}

/**
 * Lists the directory at target path (or current working directory).
 */
export function listDirectory(targetPathStr = "") {
    const resolved = resolvePath(targetPathStr);

    if (!resolved.type) {
        return { error: `Directory not found: ${targetPathStr}` };
    }
    if (resolved.type === "file") {
        return { error: `'${targetPathStr}' is a file, not a directory.` };
    }

    const { drive, path } = resolved;
    const allFiles = getAllActiveFiles();
    const prefix = path.length === 0 ? `${drive}:/` : `${drive}:/${path.join("/")}/`;

    const dirMap = new Map();
    const fileList = [];

    // Authentic Parent Directory Entry
    if (path.length > 0) {
        fileList.push({ name: "..", type: "dir", desc: "<PARENT DIR>", size: "" });
    }

    for (const f of allFiles) {
        const norm = f.path.replace(/\\/g, "/").toUpperCase();
        if (norm.startsWith(prefix)) {
            const rel = norm.slice(prefix.length);
            const slashIdx = rel.indexOf("/");

            if (slashIdx === -1) {
                // Direct child file
                const fileName = rel;
                fileList.push({
                    name: fileName,
                    type: f.type || "txt",
                    desc: f.desc || "",
                    size: f.size || "",
                    date: f.date || "08-16-81",
                    time: f.time || "12:00p",
                    readOnly: !!f.readOnly,
                    executable: f.type === "exe" || f.type === "bat"
                });
            } else {
                // Direct sub-directory
                const subDirName = rel.slice(0, slashIdx);
                if (!dirMap.has(subDirName)) {
                    dirMap.set(subDirName, {
                        name: subDirName,
                        type: "dir",
                        desc: "<DIR>",
                        size: "",
                        date: "08-16-81",
                        time: "12:00p"
                    });
                }
            }
        }
    }

    const entries = [...fileList, ...Array.from(dirMap.values())];
    return { drive, path, entries };
}

/**
 * Changes the current working directory or active drive.
 */
export function changeDirectory(targetPathStr) {
    if (!targetPathStr || targetPathStr === "~") {
        currentDrive = "C";
        currentPath = ["USERS", getActiveUser()];
        return { success: true, drive: currentDrive, path: currentPath };
    }

    // Direct drive switch syntax (e.g. cd A:, cd B:, cd C:)
    const driveOnlyMatch = targetPathStr.trim().toUpperCase().match(/^([A-Z]):$/);
    if (driveOnlyMatch) {
        return switchDrive(driveOnlyMatch[1]);
    }

    if (targetPathStr === "/" || targetPathStr === "\\") {
        currentPath = [];
        return { success: true, drive: currentDrive, path: currentPath };
    }

    const resolved = resolvePath(targetPathStr);

    if (!resolved.type) {
        return { success: false, error: `Invalid path: '${targetPathStr}'` };
    }
    if (resolved.type === "file") {
        return { success: false, error: `'${targetPathStr}' is a file, not a directory.` };
    }

    currentDrive = resolved.drive;
    currentPath = resolved.path;
    return { success: true, drive: currentDrive, path: currentPath };
}

/**
 * Reads a file's content from the virtual filesystem.
 * Handles file types and falls back to live static source inspection.
 */
export async function readFileContent(filePathStr) {
    if (!filePathStr) {
        return { error: "Usage: type <file> or cat <file>" };
    }

    const resolved = resolvePath(filePathStr);

    // 1. Found in Virtual File System Table
    if (resolved.type === "file" && resolved.file) {
        const f = resolved.file;
        const fileType = (f.type || "txt").toLowerCase();

        // Binary / Firmware / Cartridge Type Handling
        if (fileType === "exe" || fileType === "bat") {
            return {
                content: `[EXECUTABLE BINARY IMAGE: ${f.path.split("/").pop()}]\nType '${f.command || f.path.split("/").pop()}' to execute.`
            };
        }
        if (fileType === "sys" || fileType === "rom") {
            return {
                content: `[SYSTEM ROM IMAGE // PROTECTED MEMORY BLOCK: 0xF000-0xFFFF]\n${typeof f.content === "function" ? f.content() : (f.content || "FIRMWARE LOADED.")}`
            };
        }
        if (fileType === "dat" || fileType === "wad" || fileType === "bin") {
            const raw = typeof f.content === "function" ? f.content() : f.content;
            return {
                content: raw || "[RAW DATA BUFFER: ENCRYPTED OR COMPRESSED ASSET]"
            };
        }

        // Standard Text Files (.TXT, .DOC, .LOG)
        const text = typeof f.content === "function" ? f.content() : f.content;
        return {
            content: text || "",
            readOnly: !!f.readOnly
        };
    }

    if (resolved.type === "dir") {
        return { error: `'${filePathStr}' is a directory, not a text file.` };
    }

    // 2. Real Code Peeking: Fetch live website source file
    const cleanPath = filePathStr.trim().replace(/^(\.\/|\/|[A-Za-z]:[\/\\])/, "");

    if (cleanPath.includes("..") || cleanPath.startsWith("private/") || cleanPath.startsWith(".git")) {
        return { error: `File not found: '${filePathStr}'` };
    }

    const allowedExtensions = [".js", ".css", ".html", ".txt", ".json", ".mjs"];
    const hasAllowedExt = allowedExtensions.some(ext => cleanPath.toLowerCase().endsWith(ext));

    if (hasAllowedExt) {
        try {
            const url = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;
            const res = await fetch(url);
            if (res.ok) {
                const text = await res.text();
                return {
                    isRealSource: true,
                    readOnly: true,
                    content: text
                };
            }
        } catch {}
    }

    return { error: `File not found: '${filePathStr}'` };
}

/**
 * Writes or creates a text file in the Virtual File System.
 * Persists into localStorage NVRAM.
 */
export function writeFileContent(filePathStr, newContent) {
    if (!filePathStr) {
        return { success: false, error: "No target file specified." };
    }

    const { drive, segments } = normalizePathInput(filePathStr);

    // Floppy Write-Protection
    if (drive === "A" || drive === "B") {
        return { success: false, error: `Drive ${drive}: is write-protected. (Physical notch covered).` };
    }

    // Protected System Directory Check
    if (segments[0] === "PROGRAMS" || segments[0] === "SYSTEM") {
        return { success: false, error: "Access denied. System directory is write-protected." };
    }

    const resolved = resolvePath(filePathStr);
    if (resolved.type === "file" && resolved.file?.readOnly) {
        return { success: false, error: "File is write-protected (Read-Only)." };
    }

    // Persist into localStorage user notes table
    try {
        const user = getActiveUser().toUpperCase();
        const customNotesKey = `foxos_user_notes_${user}`;
        const savedNotes = JSON.parse(localStorage.getItem(customNotesKey) || "{}");
        const fullSavedPath = `${drive}:/${segments.join("/")}`.toUpperCase();
        savedNotes[fullSavedPath] = newContent;
        localStorage.setItem(customNotesKey, JSON.stringify(savedNotes));
    } catch (e) {
        console.warn("[VFS] Failed to persist file:", e);
    }

    return { success: true };
}

/**
 * Generates an ASCII visual directory tree representation.
 */
export function generateTree(targetDriveLetter = currentDrive) {
    const drive = targetDriveLetter.toUpperCase().replace(/[:\/\\]/g, "");
    if (!DRIVE_INFO[drive]) return `Invalid drive: '${drive}:'`;

    const allFiles = getAllActiveFiles().filter(f => f.path.toUpperCase().startsWith(`${drive}:`));
    const root = {};

    // Build hierarchy tree object
    for (const f of allFiles) {
        const parts = f.path.replace(/\\/g, "/").slice(3).split("/").filter(p => p.length > 0);
        let curr = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === parts.length - 1) {
                curr[part] = null; // File leaf
            } else {
                if (!curr[part]) curr[part] = {};
                curr = curr[part];
            }
        }
    }

    let out = `${drive}:\\\n`;

    function printBranch(node, prefix = "") {
        const keys = Object.keys(node);
        keys.forEach((key, index) => {
            const isLast = index === keys.length - 1;
            const connector = isLast ? "└── " : "├── ";
            out += `${prefix}${connector}${key}\n`;
            if (node[key] && typeof node[key] === "object") {
                printBranch(node[key], prefix + (isLast ? "    " : "│   "));
            }
        });
    }

    printBranch(root);
    return out;
}
