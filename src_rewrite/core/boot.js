/**
 * boot.js — foxOS 1981 Hardware POST & Bootloader Engine
 * 
 * Implements:
 * 1. CRT electron beam power-on horizontal bloom (.turn-on)
 * 2. Deliberate 1981 Hardware POST checks with readable pacing
 * 3. Serenity Fox logo display
 * 4. Dynamic content update checks
 * 5. Full system reboot orchestration
 */

import { playBell, playDiskSeek, playDiskSpinUp, playBootChime } from "./audio.js";
import { FOX_BRAILLE_LOGO } from "./art.js";
import { unlockCipher } from "../programs/ciphers/ciphers.js";

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Checks if new blog posts or recipes were added since last session.
 */
async function checkContentUpdates() {
    const notes = [];
    try {
        const [blogRes, recipeRes] = await Promise.allSettled([
            fetch("blog/index.json?v=" + Date.now()).then(r => r.ok ? r.json() : fetch("/blog/index.json?v=" + Date.now()).then(r => r.json())),
            fetch("recipes/index.json?v=" + Date.now()).then(r => r.ok ? r.json() : fetch("/recipes/index.json?v=" + Date.now()).then(r => r.json()))
        ]);

        const blogIndex = blogRes.status === "fulfilled" ? blogRes.value : [];
        const recipeIndex = recipeRes.status === "fulfilled" ? recipeRes.value : [];

        const savedBlog = JSON.parse(localStorage.getItem("blogIndexSnapshot") || "null");
        const savedRecipe = JSON.parse(localStorage.getItem("recipeIndexSnapshot") || "null");

        // First visit initialization: save baseline snapshot silently
        if (savedBlog === null && blogIndex.length > 0) {
            localStorage.setItem("blogIndexSnapshot", JSON.stringify(blogIndex));
        } else if (savedBlog !== null && JSON.stringify(savedBlog) !== JSON.stringify(blogIndex)) {
            notes.push("\n[NOTICE] Welcome back — there is a new blog post uploaded from CyberVixen.");
        }

        if (savedRecipe === null && recipeIndex.length > 0) {
            localStorage.setItem("recipeIndexSnapshot", JSON.stringify(recipeIndex));
        } else if (savedRecipe !== null && JSON.stringify(savedRecipe) !== JSON.stringify(recipeIndex)) {
            notes.push("\n[NOTICE] Welcome back — there is a new recipe found in system memory.");
        }
    } catch (e) {
        console.error("[foxOS] Content update check error:", e);
    }
    return notes;
}

/**
 * Executes the authentic 1981 Hardware POST and foxOS boot sequence.
 * 
 * @param {object} ctx - The terminal execution context
 * @param {boolean} isReboot - Whether this is a warm reboot from system repair
 */
export async function runBootSequence(ctx, isReboot = false) {
    ctx.clear();

    // ─── Fast Instant Debug Mode Bypass ───────────────────────────────────────
    if (globalThis.DEBUG) {
        const crt = document.getElementById("crt");
        if (crt) crt.classList.add("turn-on");
        ctx.print("SERENITY INDUSTRIES ROM BIOS VER 4.02 // CPU CLOCK: 4.77 MHz");
        ctx.print("[DEBUG MODE ACTIVE] Bypassed splash animations and boot sequence.\nType 'HELP' for commands, 'DIR' to explore.\n");
        ctx.setInputEnabled(true);
        return;
    }

    ctx.setInputEnabled(false);

    // ─── 1. CRT Electron Beam Power-On Bloom & Magnetic Drive Spin-Up ────────
    playDiskSpinUp(); // Physical 8.0s drive spinup and head calibration spools in background

    const crt = document.getElementById("crt");
    if (crt) {
        crt.classList.remove("turn-on");
        void crt.offsetWidth; // Force reflow
        crt.classList.add("turn-on");
        await sleep(650); // Allow full powerOn beam expansion animation
    }

    // ─── 2. Hardware POST (Power-On Self Test) ─────────────────────────────────
    ctx.print("SERENITY INDUSTRIES INC. // TECHNOLOGY DIVISION", {pager: false});
    ctx.print("FACILITY: CITY 9, DISTRICT 01 // MAINBOARD: SI-8100 REV B", {pager: false});
    ctx.print("ROM BIOS VER 4.02 (08/12/81-0042) // CPU: INTEL D8088 @ 4.77 MHz\n", {pager: false});
    await sleep(550);

    // Live Parity RAM Count (64KB -> 640KB) - Slower and more deliberate
    ctx.print("BASE MEMORY CHECK:   64 KB OK", {pager: false});
    for (let kb = 128; kb <= 640; kb += 64) {
        await sleep(85);
        ctx.printReplace(`BASE MEMORY CHECK:  ${String(kb).padStart(3, ' ')} KB OK`);
    }
    ctx.printReplace("BASE MEMORY CHECK:  640 KB OK (PARITY VERIFIED)");
    playBell(960, 0.04);
    await sleep(550);

    // Subsystem 1: 555-Timer & 8284A Clock Generator
    ctx.print("INTEL 8284A CLOCK OSCILLATOR (14.318 MHz)  [ LOCKED (1.000 Hz) ]", {pager: false});
    await sleep(520);

    // Subsystem 2: Motorola MC6845 CRT Video Raster Controller
    ctx.print("MOTOROLA MC6845 CRT RASTER (50/60 Hz) ... ", {pager: false});
    await sleep(480);
    ctx.printReplace("MOTOROLA MC6845 CRT RASTER (50/60 Hz) ... [ P39 DUAL-BAND OK ]");
    await sleep(380);

    // Subsystem 3: Intel 8259A Interrupt Controller
    ctx.print("INTEL 8259A INTERRUPT CONTROLLER (PIC) ... [ IRQ MASK: 0x00 SYNC ]", {pager: false});
    await sleep(500);

    // Subsystem 4: Shugart Floppy Drive Controller
    ctx.print("SHUGART SA400 FDC (DRIVE A: 5.25\" DSDD) .. ", {pager: false});
    playDiskSeek();
    await sleep(520);
    ctx.printReplace("SHUGART SA400 FDC (DRIVE A: 5.25\" DSDD) .. [ TRACK 00 ALIGNED ]");
    await sleep(480);

    // Subsystem 5: Seagate Winchester Fixed Disk Recalibration
    ctx.print("SEAGATE ST-506 MFM (DRIVE C: 10MB) ....... ", {pager: false});
    await sleep(550);
    ctx.printReplace("SEAGATE ST-506 MFM (DRIVE C: 10MB) ....... [ 3600 RPM SYNC ]");
    await sleep(500);

    if (isReboot) {
        ctx.print("\n[FIRMWARE RECOVERY] Applying patch sectors to VFS...", {pager: false});
        playDiskSeek();
        await sleep(550);
        ctx.print("  PATCH SECTOR 0x003F -> HELP_TABLE_RELOADED [ SUCCESS ]", {pager: false});
        playBell(1200, 0.08);
        await sleep(650);
    }

    ctx.print("\nBOOTING foxOS KERNEL 1.33.7 (CYL 0, HD 0, SEC 1)...", {pager: false});
    await sleep(1100);

    // ─── 3. Clean Screen for OS Banner ─────────────────────────────────────────
    ctx.clear();

    await playBootChime();
    await sleep(200);

    await ctx.type("Welcome to FoxOS ver. 1.33.7\n", {pager: false});
    await sleep(250);

    // Stream Serenity Fox Logo with simulated CPU loading strain
    await ctx.type(FOX_BRAILLE_LOGO.trim(), {
        speed: 6,
        lineDelay: 20,
        cpuLoad: 75,
        pager: false,
    });
    await sleep(400);

    // Header & Greeting with natural teletypewriter stream
    await ctx.type("\"Harmony engineered.\"\n", { speed: 18, lineDelay: 120, pager: false });
    await sleep(200);

    // Content update notices
    const notes = await checkContentUpdates();
    for (const note of notes) {
        ctx.print(note, {pager: false});
        await sleep(150);
    }

    if (isReboot) {
        ctx.print("\n[HARDWARE BUS SCAN] Status change on Expansion Bay B:", {pager: false});
        ctx.print("  DRIVE B: (5.25\" FLOPPY CONTROLLER) -> [ MEDIA INSERTED ]", {pager: false});
        ctx.print("  Removable mount point initialized: /MOUNTS/FLOPPY/\n", {pager: false});
        playDiskSeek(3);
        await sleep(400);
    }

    await ctx.type("Type 'HELP' for commands, 'DIR' to explore.\n", { speed: 16, pager: false });
    await sleep(300);

    // ─── 4. Re-enable terminal command prompt & award initial cipher ─────────
    ctx.setInputEnabled(true);
    unlockCipher("first_contact");
}
