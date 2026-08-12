import { openWindow, loadRecipeList } from "../../io.js";

let quotes = [
  `Poets have been mysteriously silent on the subject of cheese.`,
  `Double, double toil and trouble\;\nFire burn and cauldron bubble.`
];


let output;
const recipeIndex = await fetch("/recipes/index.json").then(r => r.json());
function pickOutput() {
  output = quotes[Math.floor(Math.random() * quotes.length)];
  return output;
}

pickOutput();

export { output }

export default function () {
  localStorage.setItem("recipeIndexSnapshot", JSON.stringify(recipeIndex));
  pickOutput();
  openWindow("recipes");
  loadRecipeList();
  return {};
}
