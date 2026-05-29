import { openWindow } from "../../io.js";
import { setupWindow } from "../../screen.js";



let quotes = [
  `Everything is connected.\nNethack.Scan(\"localHost\").GetNeighbors(all)\n...................Done!\nCompiling.....`,
];

let selection = Math.floor(Math.random() * quotes.length);
let output = quotes[selection];


export { output };
export default function () {
    openWindow("links");
  return {};
}