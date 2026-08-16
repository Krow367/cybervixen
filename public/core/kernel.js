/**
 * kernel.js — foxOS Command Shell & Execution Kernel
 * 
 * Provides:
 * 1. Command History Recall (Up/Down arrow key cycling).
 * 2. Shell Command Dispatcher & Tokenizer.
 * 3. Execution Context Sandbox & Binary Runner.
 */

import { resolvePath, switchDrive } from "./vfs.js";
import { getCommand } from "./commands.js";
import { launchFoxhound } from "../programs/foxhound/foxhound.js";
import { launchRepair } from "../programs/repair/repair.js";
import { launchBlog } from "../programs/blog/blog.js";
import { launchRecipes } from "../programs/recipes/recipes.js";
import { launchChat } from "../programs/chat/chat.js";
import { launchLinks } from "../programs/links/links.js";

// Helper for randomized flavor text
const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─── 1. Command History State ────────────────────────────────────────────────
const history = [];
let historyIndex = -1;
let historyDraft = "";

/**
 * Pushes a command to history and resets the traversal index.
 */
export function pushHistory(rawCmd) {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;
    // Don't duplicate if same as the most recent command
    if (history.length === 0 || history[history.length - 1] !== trimmed) {
        history.push(trimmed);
    }
    historyIndex = -1;
    historyDraft = "";
}

/**
 * Traverses command history backwards (Up Arrow) or forwards (Down Arrow).
 * Returns the text that should be placed in the input field.
 */
export function navigateHistory(direction, currentInputText) {
    if (history.length === 0) return currentInputText;

    if (historyIndex === -1) {
        historyDraft = currentInputText; // Save what the user was currently typing
    }

    if (direction === "up") {
        if (historyIndex === -1) {
            historyIndex = history.length - 1;
        } else if (historyIndex > 0) {
            historyIndex--;
        }
        return history[historyIndex];
    } else if (direction === "down") {
        if (historyIndex === -1) {
            return currentInputText;
        }
        if (historyIndex < history.length - 1) {
            historyIndex++;
            return history[historyIndex];
        } else {
            historyIndex = -1;
            return historyDraft;
        }
    }
    return currentInputText;
}

/**
 * Parses a raw command string into a command name and argument array.
 * Supports quoted strings (e.g. cat "my note.txt" or type 'hello world').
 */
export function parseCommandArgs(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return { cmdName: "", args: [] };

    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const tokens = [];
    let match;

    while ((match = regex.exec(trimmed)) !== null) {
        if (match[1] !== undefined) {
            tokens.push(match[1]);
        } else if (match[2] !== undefined) {
            tokens.push(match[2]);
        } else {
            tokens.push(match[0]);
        }
    }

    const cmdName = (tokens[0] || "").toLowerCase();
    const args = tokens.slice(1);
    return { cmdName, args };
}

/**
 * Main Shell Command Dispatcher & Binary Executor.
 * 
 * @param {string} rawInput - The raw string typed by the user
 * @param {object} ctx - The execution context with print, type, clear, audio methods
 */
export async function executeCommand(rawInput, ctx) {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    // 1. Record in History
    pushHistory(trimmed);

    // Direct Drive Switch (e.g. "A:", "B:", "C:")
    const driveSwitchMatch = trimmed.match(/^([A-Za-z]):$/);
    if (driveSwitchMatch) {
        const res = switchDrive(driveSwitchMatch[1]);
        if (res.success) {
            if (res.message) ctx.print(res.message);
        } else {
            ctx.error(res.error);
        }
        return;
    }

    const { cmdName, args } = parseCommandArgs(trimmed);

    // 2. Query Central Command Registry (built-in commands & aliases)
    const cmdObj = getCommand(cmdName);

    if (cmdObj) {
        try {
            // Automatic Output Randomizer
            if (cmdObj.outputs) {
                const randomMsg = Array.isArray(cmdObj.outputs) ? pickRandom(cmdObj.outputs) : cmdObj.outputs;
                if (randomMsg) {
                    if (cmdObj.typewriter === false) {
                        ctx.print(randomMsg);
                    } else {
                        await ctx.type(randomMsg);
                    }
                }
            }

            if (cmdObj.exec) {
                await cmdObj.exec(args, ctx);
            }
        } catch (err) {
            ctx.error(`[EXECUTION ERROR] ${err.message}`);
        }
        return;
    }

    // 3. Check for Executable Cartridges in VFS (Searches Current Directory & System PATH C:/PROGRAMS/)
    const firstWord = trimmed.split(/\s+/)[0];
    const exeUpper = firstWord.toUpperCase();
    const exeName = exeUpper.endsWith(".EXE") ? exeUpper : `${exeUpper}.EXE`;

    // Authentic PATH Search: 1. Current Working Directory / Explicit Path, 2. System PATH (C:/PROGRAMS/)
    const targetNode =
        resolvePath(firstWord).node ||
        resolvePath(exeName).node ||
        resolvePath(`C:/PROGRAMS/${exeName}`).node;

    if (targetNode && (targetNode.executable || targetNode.type === "exe")) {
        const cmdKey = (targetNode.command || firstWord.replace(/\.exe$/i, "")).toLowerCase();
        
        // Direct cartridge launchers with authentic quotes and outputs
        if (cmdKey === "foxhound" || targetNode.name === "FOXHOUND.EXE") {
            await launchFoxhound(ctx);
            return;
        }

        const mappedCmd = getCommand(cmdKey);
        if (mappedCmd) {
            try {
                if (mappedCmd.outputs) {
                    const randomMsg = Array.isArray(mappedCmd.outputs) ? pickRandom(mappedCmd.outputs) : mappedCmd.outputs;
                    if (randomMsg) {
                        if (mappedCmd.typewriter === false) {
                            ctx.print(randomMsg);
                        } else {
                            await ctx.type(randomMsg);
                        }
                    }
                }
                if (mappedCmd.exec) {
                    await mappedCmd.exec(args, ctx);
                }
            } catch (err) {
                ctx.error(`[EXECUTION ERROR] ${err.message}`);
            }
            return;
        }

        ctx.print(`[LAUNCH] Executing binary '${targetNode.name || firstWord}'...`);
        return;
    }

    // 4. Command Not Found
    ctx.errorBuzz?.();
    ctx.error(`'${trimmed.split(/\s+/)[0]}' is not recognized as a command or program.\nType 'help' for a list of available commands.`);
}
