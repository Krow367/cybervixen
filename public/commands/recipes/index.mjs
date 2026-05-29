import { openWindow, loadRecipeList } from "../../io.js";

const output = [
  "Poets have been mysteriously silent on the subject of cheese."
];

export { output };
export default function () {
  openWindow("recipes");
  loadRecipeList();
  return {};
}
