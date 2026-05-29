import { openWindow } from "../../io.js";
import { setupWindow } from "../../screen.js";



let quotes = [
    `Everything is connected.\nNethack.Scan(\"localHost\").GetNeighbors(all)\n...................Done!\nCompiling.....`,
];


let output;

function pickOutput() {
    output = quotes[Math.floor(Math.random() * quotes.length)];
    return output;
}

pickOutput();

export { output };
export default function () {
    pickOutput();
    openWindow("links");
    return {};
}