import { prompt, type } from "../../io.js";
import pause from "../../pause.js";
import {clear} from "../../screen.js";

export default async function () {

    const validInputs = ["y", "n", "yes", "no"];
    const confirm = ["y", "yes"];

    // ── First check ───────────────────────────────────────────────
    // Start with an empty string so the while condition is true
    // on the first pass — forcing at least one prompt.
    let firstCheck = "";
    let firstAttempt = true;

    while (!validInputs.includes(firstCheck)) {
        if (firstAttempt) {
            firstCheck = await prompt(
                "Warning: Hard reset will wipe all saved data. You will lose all game progress.\nAre you sure? [Y/N]"
            );
            firstAttempt = false;
        } else {
            firstCheck = await prompt(
                "What? It's not rocket surgery. Delete data or no? [Y/N]"
            );
        }
    }

    // Loop has exited — firstCheck is now guaranteed to be in validInputs.
    // Check if it was actually a confirmation or a refusal.
    if (!confirm.includes(firstCheck)) {
        await type("Reset aborted. That was smart. Who knows what kind of damage you would have done.\nI might not have even survived.");
        return;
    }

    // ── Second check ──────────────────────────────────────────────
    // Same pattern — empty string forces entry into the loop.
    let secondCheck = "";
    let secondAttempt = true;

    while (!validInputs.includes(secondCheck)) {
        if (secondAttempt){
            secondCheck = await prompt(
                "Are you absolutely sure? There's no going back.\nThis is really your last chance. [Y/N]"
            );
        } else {
            secondCheck = await prompt(
                "What? Its a yes or no question. Don't make me delete you.\nDelete data or no? [Y/N]"
            );
        }
    }

    // Same pattern — loop exited, now check if it was yes or no.
    if (!confirm.includes(secondCheck)) {
        await type("Reset aborted. Good call.");
        return;
    }

    // ── Both checks passed — wipe data ────────────────────────────
    localStorage.removeItem("commandHistory");
    localStorage.removeItem("helpRepaired");
    localStorage.removeItem("foxhoundState");

    await type([
        { kind: "type", text: "Understood. Deleting data...." },
        { kind: "type", text: "\n █████████████" },
        { kind: "replace", line: -1, index: 13, char: "░", wait: 900 },
        { kind: "replace", line: -1, index: 12, char: "░", wait: 190 },
        { kind: "replace", line: -1, index: 11, char: "░", wait: 500 },
        { kind: "replace", line: -1, index: 10, char: "░", wait: 500 },
        { kind: "replace", line: -1, index: 9, char: "░", wait: 500 },
        { kind: "replace", line: -1, index: 8, char: "░", wait: 200 },
        { kind: "replace", line: -1, index: 7, char: "░", wait: 80 },
        { kind: "replace", line: -1, index: 6, char: "░", wait: 80 },
        { kind: "replace", line: -1, index: 5, char: "░", wait: 160 },
        { kind: "replace", line: -1, index: 4, char: "░", wait: 900 },
        { kind: "replace", line: -1, index: 3, char: "░", wait: 130 },
        { kind: "replace", line: -1, index: 2, char: "░", wait: 75 },
        { kind: "replace", line: -1, index: 1, char: "░", wait: 200 },
        { kind: "type", text: "\nGood bye.", wait: 400 },
    ]);

    await pause(2);
    clear();
}