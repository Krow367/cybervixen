/**
 * vfs_manifest.js — Declarative Flat File Table for foxOS
 * 
 * Schematics:
 * - Every file is declared as a flat record with an absolute drive path (e.g. "C:/PROGRAMS/BLOG.EXE").
 * - The VFS engine automatically constructs directory trees, handles permissions, and enforces types.
 * 
 * Supported File Types:
 * - "txt" / "doc" / "log" : Plain text files (viewable with 'type', editable in 'nano')
 * - "exe" / "bat"         : Executable system cartridges (launched via command name or PATH)
 * - "sys" / "rom"         : Low-level system binary firmware images
 * - "dat" / "wad" / "bin" : Raw data assets & game cartridges
 * 
 * Condition Guards & Obfuscation:
 * - visible: Function returning boolean. If false, file is completely hidden from VFS & dir.
 * - content: Static string OR dynamic function evaluated on read.
 */

export const systemManifest = [
    // ═════════════════════════════════════════════════════════════════════════
    // DRIVE A: (5.25" Removable Floppy Diskette / Tactical Cartridge)
    // ═════════════════════════════════════════════════════════════════════════
    {
        path: "A:/DRIVE_STATUS.TXT",
        type: "txt",
        readOnly: true,
        size: "64 B",
        date: "11-04-81",
        time: "10:14p",
        // Only visible when terminal buffer is uncalibrated / corrupt
        visible: () => localStorage.getItem("helpRepaired") !== "true",
        content: "[DRIVE A: / REMOVABLE MEDIA]\nState: DISK INSERTED // AZIMUTH UNCALIBRATED\nRun 'repair help.sys' to synchronize floppy drive head."
    },
    {
        path: "A:/FOXHOUND.EXE",
        type: "exe",
        executable: true,
        command: "foxhound",
        desc: "Serenity Tactical Infiltration Simulator",
        size: "64 KB",
        date: "11-04-81",
        time: "11:20p",
        // Unlocked after running 'repair'
        visible: () => localStorage.getItem("helpRepaired") === "true"
    },
    {
        path: "A:/README.TXT",
        type: "txt",
        readOnly: true,
        size: "512 B",
        date: "11-04-81",
        time: "11:22p",
        visible: () => localStorage.getItem("helpRepaired") === "true",
        content: [
            "==================================================",
            "  SERENITY INDUSTRIES // R&D DIVISION ARCHIVE    ",
            "  PROJECT: FOXHOUND PROTOTYPE VER 0.3            ",
            "==================================================",
            "",
            "WARNING: CLASSIFIED UNDER CITIZEN SURVEILLANCE",
            "DIRECTIVE CODE 20.77.",
            "",
            "This 5.25\" magnetic disk contains the tactical",
            "credential decryption cipher 'FOXHOUND'.",
            "",
            "Run 'FOXHOUND' or 'FOXHOUND.EXE' to initialize",
            "security matrix breach simulation.",
            "",
            "Do NOT execute on civilian terminals without",
            "Serenity Security Clearance Level 3."
        ].join("\n")
    },
    {
        path: "A:/TRANSMISSION.DAT",
        type: "dat",
        readOnly: true,
        size: "256 B",
        date: "11-04-81",
        time: "11:45p",
        visible: () => localStorage.getItem("helpRepaired") === "true",
        content: [
            "-----BEGIN SERENITY AES-256-GCM CIPHERTEXT-----",
            "4nyTqFwdDGmpA2m5YkdBmM+eYMU9lvpNAP+7uK9xH2NDCHOclQfXTvvPJZDDMfn8",
            "SyY+xftlKrCRQfLlK8asJ9TJv+POQUp7LAJHU3Wdvr8Yel3xjeT3y/uN5JMJlaVC",
            "KWxOz/DQow/1aSM1wmb7Yt0wj+KH1l/nNGsoLKrvM+rB1N+JP0Cl2eFQIJ8Vfq5B",
            "7XoYdjecTh7uEcE=",
            "-----END SERENITY AES-256-GCM CIPHERTEXT-----",
            "",
            "[STATUS: ENCRYPTED WITH LEVEL 3 STAGE CREDENTIAL KEY]",
            "Use: 'decrypt TRANSMISSION.DAT <password>'"
        ].join("\n")
    },

    // ═════════════════════════════════════════════════════════════════════════
    // DRIVE C: (10MB Winchester Hard Disk — System, Programs & Workspaces)
    // ═════════════════════════════════════════════════════════════════════════
    // Core System Firmware & Utilities
    {
        path: "C:/SYSTEM/FOXOS.SYS",
        type: "sys",
        readOnly: true,
        desc: "foxOS Kernel Bootstrap Image",
        size: "32 KB",
        date: "08-12-81",
        time: "04:02a",
        content: "[foxOS KERNEL BOOTSTRAP // SYSTEM FIRMWARE]\nSERENITY ROM BIOS v4.02 // ARCHITECTURE: SI-8100 REV B"
    },
    {
        path: "C:/SYSTEM/HELP.SYS",
        type: "sys",
        readOnly: true,
        desc: "System Command & Buffer Definition Table",
        size: "16 KB",
        date: "08-12-81",
        time: "04:03a",
        content: "[SERENITY HELP BUFFER // CLEARANCE LEVEL 0]\nCommand Registry Integrity: OK"
    },
    {
        path: "C:/SYSTEM/REPAIR.EXE",
        type: "exe",
        executable: true,
        command: "repair",
        desc: "Terminal Buffer Integrity Restoration",
        size: "8 KB",
        date: "08-12-81",
        time: "04:05a"
    },

    // ═════════════════════════════════════════════════════════════════════════
    // DRIVE C: (10MB Winchester Hard Disk — System & Workspaces)
    // ═════════════════════════════════════════════════════════════════════════
    // System Programs
    {
        path: "C:/PROGRAMS/BLOG.EXE",
        type: "exe",
        executable: true,
        command: "blog",
        desc: "CyberVixen's Transmissions & Articles",
        size: "128 KB",
        date: "08-14-81",
        time: "02:15p"
    },
    {
        path: "C:/PROGRAMS/RECIPES.EXE",
        type: "exe",
        executable: true,
        command: "recipes",
        desc: "Culinary Compendium & Formulae",
        size: "96 KB",
        date: "08-14-81",
        time: "02:20p"
    },
    {
        path: "C:/PROGRAMS/CHAT.EXE",
        type: "exe",
        executable: true,
        command: "chat",
        desc: "Relay Chat Terminal",
        size: "16 KB",
        date: "08-14-81",
        time: "02:25p"
    },
    {
        path: "C:/PROGRAMS/LINKS.EXE",
        type: "exe",
        executable: true,
        command: "links",
        desc: "Serenity Neighboring Network Nodes Catalog",
        size: "32 KB",
        date: "08-14-81",
        time: "02:30p"
    },

    // Guest Workspace
    {
        path: "C:/USERS/GUEST/DOCS/WELCOME.TXT",
        type: "txt",
        readOnly: true,
        desc: "Guest Workspace Welcome Dossier",
        size: "512 B",
        date: "08-12-81",
        time: "09:00a",
        content: [
            "==================================================",
            "  WELCOME TO foxOS // GUEST WORKSPACE            ",
            "==================================================",
            "",
            "You are operating in an offline Guest session.",
            "All notes and puzzle state are preserved directly",
            "in your browser's private local memory (NVRAM).",
            "",
            "• To transfer your progress to another device without",
            "  creating an account, type: 'backup'",
            "• On your other device, type: 'restore <token>'",
            "",
            "Type 'help' to inspect available system commands,",
            "or 'dir' to explore the Serenity directory tree."
        ].join("\n")
    },
    {
        path: "C:/USERS/GUEST/DOCS/TODO.TXT",
        type: "txt",
        size: "256 B",
        date: "08-12-81",
        time: "09:05a",
        content: [
            "[ ] Explore directory tree with 'dir' and 'cd'",
            "[ ] Inspect system integrity with 'help'",
            "[ ] Locate and decrypt classified Serenity archives",
            "[ ] Back up terminal state using 'backup' command"
        ].join("\n")
    },
    {
        path: "C:/USERS/GUEST/NOTES/SCRATCHPAD.TXT",
        type: "txt",
        size: "128 B",
        date: "08-12-81",
        time: "09:10a",
        content: "Guest scratchpad. Stored in local browser memory (NVRAM)."
    },

    // CyberVixen Workspace
    {
        path: "C:/USERS/CYBERVIXEN/DOCS/OPERATOR_DOSSIER.TXT",
        type: "txt",
        readOnly: true,
        desc: "Primary Operator Workspace & System Dossier",
        size: "256 B",
        date: "08-12-81",
        time: "01:00a",
        content: [
            "==================================================",
            "  OPERATOR DOSSIER // CYBERVIXEN                  ",
            "==================================================",
            "",
            "Clearance: ROOT / SYSADMIN",
            "Node: 42 (Serenity Research Division)",
            "Status: TRANSMITTING",
            "",
            "\"Harmony engineered. Reality rewritten.\""
        ].join("\n")
    },
    {
        path: "C:/USERS/CYBERVIXEN/LOGS/BOOT_01.LOG",
        type: "log",
        readOnly: true,
        desc: "Initial Kernel Initialization Diagnostic",
        size: "384 B",
        date: "08-12-81",
        time: "01:05a",
        content: [
            "[SYS_INIT] Serenity Kernel 1.33.7 initialized.",
            "[AUDIO_DRV] 555-Timer square-wave clock locked.",
            "[CRT_RASTER] 80x24 character grid sync OK.",
            "[SECURITY] Clearance level verified: SYSADMIN (1)"
        ].join("\n")
    },
    {
        path: "C:/USERS/CYBERVIXEN/LOGS/INCIDENT_REPORT.TXT",
        type: "log",
        readOnly: true,
        desc: "Security Incident Sector Breach Log",
        size: "384 B",
        date: "08-12-81",
        time: "01:10a",
        content: [
            "[INCIDENT REPORT: SECTOR BREACH]",
            "Unidentified probe intercepted near Serenity R&D perimeter.",
            "Breach cartridge 'FOXHOUND' was isolated to magnetic floppy.",
            "Terminal memory integrity degraded to 0%.",
            "Diagnostic restoration required."
        ].join("\n")
    },

    // Secret Puzzle Reward (Dynamically unlocked via Project FOXHOUND)
    {
        path: "C:/USERS/GUEST/NOTES/SPOOF_EXTRACT.TXT",
        type: "txt",
        readOnly: true,
        desc: "Captured Serenity R&D Clearance Extract",
        size: "384 B",
        date: "11-04-81",
        time: "11:59p",
        visible: () => {
            try {
                const fh = JSON.parse(localStorage.getItem("foxhound_state") || "{}");
                return !!fh.credentialUnlocked;
            } catch {
                return false;
            }
        },
        content: [
            "==================================================",
            "  SERENITY TRANSMISSION EXTRACT // PROJECT FOXHOUND",
            "==================================================",
            "",
            "Captured Spoof Clearance:",
            "  OPERATOR ID : B.Higgs.1746",
            "  PASSPHRASE  : L00kWhatIC4nD0",
            "  INTEGRITY   : CHECKSUM:Yq23Q9+7r,rE",
            "",
            "NOTICE: This clearance authorizes execution of",
            "restricted Serenity core binaries (e.g. 'foxclaw')."
        ].join("\n")
    }
];
