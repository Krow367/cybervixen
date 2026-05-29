import { openWindow } from "../../io.js";


let quotes = [
  "I have no mouth and I must scream",
];

let selection = Math.floor(Math.random() * quotes.length);
let output = quotes[selection];

export { output };
export default function () {
  openWindow("about");
  return {};
}