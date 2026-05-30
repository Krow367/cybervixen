import { type } from "../../io.js";
import { clear } from "../../screen.js";

async function command() {
    clear();

    await type([
        {
            kind: "type",
            text: "Initiating nethack.....",
            wait: 5,
            initialWait: 0
        },
        {
            kind: "type",
            text: "\nLoading.....",
            wait: 30
        },
        {
            kind: "pause",
            wait: 1000
        },
        {
            kind: "type",
            text: "\n░░░░░░░░░░░░░",
            wait: 0
        },

        { kind: "replace", line: -1, index: 0, char: "█", wait: 90 },
        { kind: "replace", line: -1, index: 1, char: "█", wait: 90 },
        { kind: "replace", line: -1, index: 2, char: "█", wait: 500 },
        { kind: "replace", line: -1, index: 3, char: "█", wait: 500 },
        { kind: "replace", line: -1, index: 4, char: "█", wait: 500 },
        { kind: "replace", line: -1, index: 5, char: "█", wait: 60 },
        { kind: "replace", line: -1, index: 6, char: "█", wait: 80 },
        { kind: "replace", line: -1, index: 7, char: "█", wait: 80 },
        { kind: "replace", line: -1, index: 8, char: "█", wait: 160 },
        { kind: "replace", line: -1, index: 9, char: "█", wait: 900 },
        { kind: "replace", line: -1, index: 10, char: "█", wait: 130 },
        { kind: "replace", line: -1, index: 11, char: "█", wait: 75 },
        { kind: "replace", line: -1, index: 12, char: "█", wait: 200 },

        {
            kind: "pause",
            wait: 400
        },
        {
            kind: "type",
            text: '\n"Harmony engineered."',
            wait: 20
        }
    ], {
        initialWait: 0,
        finalWait: 0
    });
}

export default command;