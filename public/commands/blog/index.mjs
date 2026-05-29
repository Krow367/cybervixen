import { openWindow } from "../../io.js";


let quotes = [
  "The concept of progress acts as a protective mechanism to shield us from the terrors of the future.",
];

let selection = Math.floor(Math.random() * quotes.length);
let output = quotes[selection];

export { output };
export default function () {
    openWindow("blog");
  return {};
}