/**
 * commands.js — foxOS Central Command Library & Registry
 * 
 * Defines all built-in shell commands, alias lookups, and runtime registration.
 */

import { listDirectory, changeDirectory, readFileContent, resetCurrentPathToUser, generateTree, DRIVE_INFO } from "./vfs.js";
import { applyTheme, getAllThemes, createCustomTheme, deleteCustomTheme } from "./themes.js";
import { launchBlog } from "../programs/blog/blog.js";
import { launchRecipes } from "../programs/recipes/recipes.js";
import { launchRepair } from "../programs/repair/repair.js";
import { launchFoxhound } from "../programs/foxhound/foxhound.js";
import { launchThemeStudio } from "../programs/theme_studio/theme_studio.js";
import { launchChat } from "../programs/chat/chat.js";
import { launchCipherVault, unlockCipher } from "../programs/ciphers/ciphers.js";
import { launchLinks } from "../programs/links/links.js";
import { launchNano } from "../programs/nano/nano.js";
import { decryptVault } from "./vault.js";
import { getActiveUser, logoutUser, generateBackupToken, restoreBackupToken, authenticateHandleAndPin } from "./session.js";

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// ─── Alias Mapping Table ───────────────────────────────────────────────────────
export const aliases = {
    ls: "dir",
    cat: "type",
    cls: "clear",
    edit: "nano",
    guestbook: "atabook",
    auth: "login",
};

// ─── Built-in Command Compendium ──────────────────────────────────────────────
export const commandRegistry = {
    // Help Command
    help: {
        desc: "Displays list of available system commands",
        exec: async (args, ctx) => {
            const isRepaired = localStorage.getItem("helpRepaired") === "true";

            if (!isRepaired) {
                const corrupted = `
THE MACHINE OFFERS WHAT LITTLE HELP IT CAN... 
Available commands:
help, clear, blog, recipes, about, atabook, links, follow, balls:;̷͓͆X̴͓͒:̷̲̋^̶̱̒!̶̛͉$̶͎̈_̵̪͑\\̷̻͝*̴̠̓~̴̝̚!̵̢̐>̷̗̈́@̶͖̉#̶̫̈́'̶̣̐,̴̱̔~̵̀ͅ▒̷̬̅:̶̢̽|̵͉̈́7̵̡̚(̶͎̿^̵̳̿*̵̢̅2̶̤̈́9̸͓͐-̷̘͛_̴̯̈&̷̥̿-̸̣̓&̷̧̿<̴̗͆

[ERROR: FILE BUFFER CORRUPTED. UNABLE TO DISPLAY ALL COMMANDS]
Please run 'repair' to restore corrupted file integrity.
`;
                await ctx.type(corrupted, { speed: 8 });
                return;
            }

            let out = `
======================================================================
  foxOS SYSTEM COMMAND COMPENDIUM (INTEGRITY: 100% RESTORED)          
======================================================================

  FILE SYSTEM:
    dir / ls        List contents of current directory
    cd <path>       Navigate to directory (e.g. cd DOCS, cd .., cd /)
    type / cat      Display file contents (or inspect live site code!)

  SYSTEM & DISPLAY:
    theme <name / studio>    Recalibrate phosphor tube (green, amber, cyan, crimson) or launches the Theme Studio
    cls / clear     Flush terminal screen buffer
    help            Display this command compendium
    about           Display operator profile & background dossier

  APPLICATIONS & CARTRIDGES:
    blog            CyberVixen's Transmissions & Articles
    recipes         Culinary Compendium & Formulae
    links           Neighboring Network Nodes
    chat            Relay Chat Terminal
    repair          Terminal Buffer Integrity Restoration
    nano / edit     Interactive Terminal Text Editor
    balls           An echo of a ghost

  USER & SESSION:
    login / auth    Authenticate with foxNet Operator Handle & PIN
    logout          End active session and return to GUEST
    whoami          Display active user identity and access level
    backup          Export offline NVRAM save token
    restore <token> Import offline save token to restore progress
`;
            await ctx.type(out, { speed: 4 });
        }
    },

    // Easter Egg (Bobby Singer)
    balls: {
        desc: "An echo from a monster hunter",
        exec: async (args, ctx) => {
            await ctx.type("Idjits.");
        }
    },

    // Directory Listing (dir / ls)
    dir: {
        desc: "Lists directory contents and file metadata",
        exec: async (args, ctx) => {
            const target = args[0] || "";
            const res = listDirectory(target);
            if (res.error) {
                ctx.error(res.error);
                return;
            }

            const driveLetter = res.drive || "C";
            const sub = res.path.length === 0 ? "" : res.path.join("\\");
            const fullPath = `${driveLetter}:\\${sub}`;

            let out = ` Volume in drive ${driveLetter} is SERENITY_${driveLetter === "C" ? "HD10MB" : "FLOPPY"}\n`;
            out += ` Directory of ${fullPath}\n\n`;
            res.entries.forEach(entry => {
                if (entry.type === "dir") {
                    out += `  <DIR>          ${entry.name}\n`;
                } else {
                    const sizeStr = entry.size ? `${entry.size}`.padStart(10, " ") : "          ";
                    out += `  ${sizeStr}     ${entry.name}\n`;
                }
            });
            out += `\n  ${res.entries.length} File(s) / Directory(ies)\n`;
            await ctx.type(out, { speed: 0, pager: true });
        }
    },

    // Directory Navigation (cd)
    cd: {
        desc: "Changes active working directory",
        exec: async (args, ctx) => {
            const target = args[0] || "";
            const res = changeDirectory(target);
            if (res.error) {
                ctx.error(res.error);
                return;
            }
        }
    },

    // Visual Directory Tree (tree)
    tree: {
        desc: "Graphically displays the folder structure of a drive",
        exec: async (args, ctx) => {
            const driveTarget = args[0] || "";
            const treeOutput = generateTree(driveTarget || undefined);
            await ctx.type(treeOutput, { speed: 0, pager: true });
        }
    },

    // File Content Display (type / cat)
    type: {
        desc: "Displays the contents of a text, source, or code file",
        exec: async (args, ctx) => {
            if (!args[0]) {
                ctx.error("Syntax error: Must specify a file path. (e.g. type README.TXT, cat kernel.js)");
                return;
            }
            const filePath = args[0];
            const res = await readFileContent(filePath);
            if (res.isRealSource) {
                await ctx.type(`[SOURCE PEEK // ${filePath.toUpperCase()}]\n\n${res.content}\n`, { speed: 0, pager: true });
            } else {
                await ctx.type(res.content, { speed: 0, pager: true });
            }
        }
    },

    // In-Terminal Text Editor (nano / edit)
    nano: {
        desc: "Interactive in-terminal text editor for viewing and editing files",
        exec: async (args, ctx) => {
            const target = args[0];
            await launchNano(target, ctx);
        }
    },

    // Phosphor Color Recalibration & Theme Studio
    theme: {
        desc: "Recalibrates phosphor tube (green, amber, cyan, crimson, studio, create, delete)",
        exec: async (args, ctx) => {
            const sub = (args[0] || "").toLowerCase();

            // 1. Launch GUI Theme Studio
            if (sub === "studio" || sub === "gui") {
                await launchThemeStudio(ctx);
                return;
            }

            // 2. List themes
            if (!sub || sub === "list") {
                const all = getAllThemes();
                let out = `AVAILABLE PHOSPHOR TUBE CALIBRATIONS:\n`;
                for (const [id, t] of Object.entries(all)) {
                    const customTag = t.isCustom ? " [CUSTOM]" : " [FACTORY]";
                    out += `  ${id.padEnd(12, " ")} -> ${t.name}${customTag}\n`;
                }
                out += `\nType 'theme <name>' to apply, or 'theme studio' to launch the Theme Studio.`;
                await ctx.type(out, { speed: 0 });
                return;
            }

            // 3. Create theme via CLI
            if (sub === "create") {
                const name = args[1];
                const color = args[2];
                if (!name || !color) {
                    ctx.error("Usage: theme create <name> <hex_or_color> (e.g. theme create magenta #ff00ff)");
                    return;
                }
                try {
                    createCustomTheme(name, color);
                    applyTheme(name);
                    ctx.print(`[CALIBRATION] Custom phosphor theme '${name}' synthesized and applied!`);
                } catch (e) {
                    ctx.error(`Theme creation error: ${e.message}`);
                }
                return;
            }

            // 4. Delete theme via CLI
            if (sub === "delete" || sub === "del") {
                const name = args[1];
                if (!name) {
                    ctx.error("Usage: theme delete <name>");
                    return;
                }
                try {
                    deleteCustomTheme(name);
                    ctx.print(`[CALIBRATION] Theme '${name}' removed from NVRAM.`);
                } catch (e) {
                    ctx.error(e.message);
                }
                return;
            }

            // 5. Apply Theme by Name
            try {
                const applied = applyTheme(sub);
                ctx.print(`[CALIBRATION] Cathode ray tube retuned to ${applied.name}.`);
            } catch (e) {
                ctx.error(`Unknown theme '${sub}'. Type 'theme list' or 'theme studio'.`);
            }
        }
    },

    // Flush Terminal Screen Buffer
    clear: {
        desc: "Flushes screen buffer",
        exec: async (args, ctx) => {
            ctx.clear();
        }
    },

    // Operator Bio / About Dossier
    about: {
        desc: "About the developer, CyberVixen",
        exec: async (args, ctx) => {
            const bio = `<h1>
  Welcome to cybervixen.dev!
</h1>

If you're new here, you might be wondering what's going on and what's with all these commands.
More importantly, where are the links and buttons and pretty colors?!
Well, there's a couple reasons for that.

For one, my earliest computer usage was the old MS-DOS command line interface (CLI) operating system.
It operated a lot like this website does. In fact, some of the very commands you can type here are from DOS!
I've always been enamored with the older computer systems and what developers were able to do with them, despite their severe hardware limitations.
I wanted to recapture that feeling here. While I'm certainly not mad enough to give myself hardware requirements to work in, I *am* crazy enough to build my own virtual computer on the internet!

For two... This site is a game of sorts. It's an ongoing project that I hope will span years worth of development, care, and crafting.
If you haven't figured it out yet, the help "file" has been corrupted and needs to be repaired. Your first task is to figure out how to execute the Repair program and begin restoration of the file.
After that... you'll get hints. Some will be obvious, some subtle. Some will involve looking to the very source code of this website to discover.

In fact, if you're savvy enough with dev tools and the like, there's a way to read the code of (almost) every single file for my website right here in this terminal!
Give it a try. Type out "cat core\\kernel.js" and hit enter. You'll be able to see exactly how I programmed this very message!

I will say this much, however. The Blog and Recipes will never be a part of the overarching game here on the site.
The blog is purely for my own thoughts, musings, topics and essays, while the recipes are just that. Some of my favorite cooking recipes that I've archived on the site and decided to share with the world.

Everything else, however, is fair game.
Guess you'll just have to explore everything. ~.^

Welcome to the pack, foxHound; and good luck.




You'll need it.

Ciao~
CV


<h3>So, who am I, anyway?</h3>
Hi! I'm Katrina! While I share the handle CyberVixen with my in-universe alter ego, she isn't a carbon copy of me, aside from being a huge fuckin' nerd. I'm a 30-something disabled Navy veteran that lives with her three cats, one dog, and delightfully frustrating platonic life partner. I play a lot of video games, almost exclusively on the PC. (I do love me some Zelda, though.)
I also enjoy cooking, whether it's on the stove or my flattop griddle, I can always find solace in a delicious, well-cooked meal and the process in making it. And seriously, if you haven't had the joy of cooking on a flat top, go out and buy one right now. You'll thank me. Better than a grill, I dare say.
I dabble in sewing and making my own clothes with an inherited sewing machine that's over half a century old at this point.
When I'm not sewing, cooking or playing games, I play the violin as well! I'm hardly what one would consider competent but I'm slowly getting better. Hopefully one day I'll be good enough to play for others. Who knows... maybe my music will appear on the site someday.
`;
            await ctx.type(bio, { speed: 8, lineDelay: 25, pager: true, cpuLoad: 20 });
        }
    },

    // Serenity Neighboring Network Nodes
    links: {
        desc: "Opens the Serenity Neighboring Network Nodes window",
        exec: async (args, ctx) => {
            await sleep(150);
            await launchLinks(ctx);
        }
    },

    // CyberVixen Transmissions Blog Cartridge
    blog: {
        desc: "Mounts the CyberVixen Transmissions & Articles Cartridge",
        outputs: [
            "Fuck the reader. I write what I'd want to read. If you don't like what I write, go write your own novel. This one is mine.",
            "Write. Finish things. Go for walks. Read a lot & outside your comfort zone. Stay interested. Daydream. Write.",
            "Star writing, no matter what. The water doesn't flow until the faucet is turned on.",
            "THE CONCEPT OF PROGRESS ACTS AS A PROTECTIVE MECHANISM TO SHIELD US FROM THE TERRORS OF THE FUTURE."
        ],
        exec: async (args, ctx) => {
            await sleep(150);
            await launchBlog();
        }
    },

    // Culinary Compendium Cartridge
    recipes: {
        desc: "Mounts the Culinary Compendium Cartridge",
        outputs: [
            "Poets have been mysteriously silent on the subject of cheese.",
            "Double, double toil and trouble\nFire burn and cauldron bubble",
            "I have no mouth and I must eat"
        ],
        exec: async (args, ctx) => {    
            await sleep(150);
            await launchRecipes();
        }
    },

    // Terminal Buffer Integrity Repair Utility
    repair: {
        desc: "Initializes diagnostic recovery and file restoration (Syntax: repair help.sys)",
        exec: async (args, ctx) => {
            const target = (args[0] || "").toLowerCase();
            if (target !== "help.sys" && target !== "help") {
                ctx.print("Serenity Diagnostic Recovery Utility v1.02");
                ctx.print("Usage: repair <system_file>");
                ctx.print("Example: repair help.sys");
                return;
            }
            await launchRepair(ctx);
        }
    },

    // Relay Chat Terminal
    chat: {
        desc: "Opens the Serenity Relay Chat interface",
        exec: async (args, ctx) => {
            await launchChat(ctx);
        }
    },

    // Cipher Vault / Lore Achievements
    ciphers: {
        desc: "Displays unlocked system ciphers",
        exec: async (args, ctx) => {
            await launchCipherVault(ctx);
        }
    },

    // In-Memory Decryptor for Encrypted Files
    vault: {
        desc: "Attempts decryption on locked files using a passphrase key (Usage: vault decrypt <file> <passphrase>)",
        exec: async (args, ctx) => {
            if (args[0] === "decrypt" && args[1] && args[2]) {
                const targetPath = args[1];
                const key = args[2];
                const res = await readFileContent(targetPath);
                if (res.error) {
                    ctx.error(res.error);
                    return;
                }
                const decrypted = decryptVault(res.content, key);
                if (!decrypted) {
                    ctx.errorBuzz?.();
                    ctx.error("[CIPHER ERROR] Decryption failed: Checksum signature mismatch or invalid key.");
                    return;
                }
                unlockCipher("cryptographer");
                ctx.print(`[CIPHER SUCCESS] Key accepted. Decrypted payload:\n\n${decrypted}`);
                return;
            }
            ctx.print("Serenity Cipher Vault Decryptor v1.0\nUsage: vault decrypt <file_path> <passphrase>");
        }
    },

    // Session: Backup / Export Private Local State
    backup: {
        desc: "Generates a zero-server portable backup token of your NVRAM state",
        exec: async (args, ctx) => {
            const token = generateBackupToken();
            let out = `
======================================================================
  foxOS ZERO-SERVER PRIVATE BACKUP TOKEN                              
======================================================================
This token contains your current user identity, notes, unlocked ciphers,
and theme preferences. It was created 100% locally in your browser.

TOKEN:
${token}

To restore on another device/browser:
  restore ${token}
======================================================================
`;
            await ctx.type(out, { speed: 2, pager: true });
        }
    },

    // Session: Restore State from Token
    restore: {
        desc: "Restores your local NVRAM state from a backup token",
        exec: async (args, ctx) => {
            const token = args[0];
            if (!token) {
                ctx.error("Syntax error: Must provide a backup token. (Usage: restore <token>)");
                return;
            }
            try {
                restoreBackupToken(token);
                ctx.print("[NVRAM] State successfully restored from backup token! System re-calibrating...");
                setTimeout(() => window.location.reload(), 1500);
            } catch (e) {
                ctx.error(`[RESTORE ERROR] ${e.message}`);
            }
        }
    },

    // Session: Interactive 3-Step Operator Login
    login: {
        desc: "Authenticate with a foxNet Operator Handle & PIN",
        exec: async (args, ctx) => {
            if (typeof ctx.readInput !== "function") {
                ctx.error("Interactive login is not supported in this shell environment.");
                return;
            }

            ctx.print("SERENITY foxNET NETWORK AUTHENTICATION");
            ctx.print("───────────────────────────────────────");

            // Step 1: Request Operator Handle
            const handle = await ctx.readInput("Enter Operator Handle: ");
            if (!handle || !handle.trim()) {
                ctx.error("\n[AUTH ABORTED] Operator handle cannot be blank.\n");
                return;
            }

            // Step 2: Request Security PIN (Masked with ****)
            const pin = await ctx.readInput("Enter Security PIN: ", { mask: true });

            // Step 3: Authenticate with foxNet
            ctx.print("\n[ CONTACTING foxNET AUTH GATEWAY... ]");
            const res = await authenticateHandleAndPin(handle.trim(), pin ? pin.trim() : "");

            if (!res.success) {
                if (ctx.errorBuzz) ctx.errorBuzz();
                ctx.error(`\n[ ACCESS DENIED ] ${res.error || "Invalid handle or security PIN."}\n`);
                return;
            }

            if (ctx.bootChime) ctx.bootChime();
            ctx.print(`\n[ ACCESS GRANTED ] Welcome back, Operator ${res.cleanHandle}.`);
            if (res.isNewRegistration) {
                ctx.print(`[ SYSTEM ] Handle '${res.cleanHandle}' has been claimed and registered to your profile.`);
            }

            resetCurrentPathToUser(res.cleanHandle);
            ctx.print(`Active workspace mounted: /USERS/${res.cleanHandle}/\n`);
        }
    },

    // Session: Logout / Reset to Guest
    logout: {
        desc: "Logs out of active handle and resets session to guest",
        exec: async (args, ctx) => {
            logoutUser();
            resetCurrentPathToUser();
            ctx.print("[SESSION] Logged out. Active user set to GUEST.");
        }
    },
    //Show who is currently logged in. Returns GUEST if offline, otherwise return Handle
    whoami: {
        desc: "Displays the name of the current active user",
        exec: async (args, ctx) => {
            const activeUser = getActiveUser();
            ctx.print(`USER: ${activeUser.handle} ACCESS LEVEL: ${activeUser.isGuest ? "UNAUTHENTICATED GUEST, ACCESS LEVEL 0" : "NON-SERENITY EMPLOYEE, ACCESS LEVEL 1"}`)
        }
    },

    // Toggle Fast Boot / Debug Bypass Mode         
    debug: {
        desc: "Toggles fast debug mode (bypasses splash matrix & boot sequence)",
        exec: async (args, ctx) => {
            const sub = (args[0] || "").toLowerCase();
            let enable;
            if (sub === "on" || sub === "1" || sub === "true") {
                enable = true;
            } else if (sub === "off" || sub === "0" || sub === "false") {
                enable = false;
            } else {
                enable = !globalThis.DEBUG;
            }

            globalThis.DEBUG = enable;
            localStorage.setItem("foxOS_debug", enable ? "true" : "false");
            ctx.print(`[KERNEL DEBUG] Fast boot & bypass mode: ${enable ? "ENABLED [ ON ]" : "DISABLED [ OFF ]"}`);
        }
    },
};

/**
 * Retrieves a command definition by name (or alias).
 * 
 * @param {string} name 
 * @returns {object|null}
 */
export function getCommand(name) {
    if (!name) return null;
    const lower = name.toLowerCase().trim();
    const resolvedName = aliases[lower] || lower;
    return commandRegistry[resolvedName] || null;
}

/**
 * Registers a new command definition dynamically at runtime.
 * 
 * @param {string} name 
 * @param {object} commandDef - { desc, exec, outputs, typewriter }
 */
export function registerCommand(name, commandDef) {
    if (!name || typeof commandDef !== "object") return false;
    commandRegistry[name.toLowerCase().trim()] = commandDef;
    return true;
}

/**
 * Returns all registered command definitions.
 */
export function getAllCommands() {
    return { ...commandRegistry };
}
