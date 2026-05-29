import { openWindow, loadRecipeList } from "../../io.js";

let quotes = [
  `Poets have been mysteriously silent on the subject of cheese.`,
  `Double, double toil and trouble\;\nFire burn and cauldron bubble.`
];

let selection = Math.floor(Math.random() * quotes.length);
let output = quotes[selection];

export { output };

export default function () {
  openWindow("recipes");
  loadRecipeList();
  return {};
}
