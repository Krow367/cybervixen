import { openWindow, loadRecipeList } from "../../io.js";

let quotes = [
  `Poets have been mysteriously silent on the subject of cheese.`,
  `Double, double toil and trouble\;\nFire burn and cauldron bubble.`
];


let output;

function pickOutput() {
  output = quotes[Math.floor(Math.random() * quotes.length)];
  return output;
}

pickOutput();

export { output }

export default function () {
  pickOutput();
  openWindow("recipes");
  loadRecipeList();
  return {};
}
