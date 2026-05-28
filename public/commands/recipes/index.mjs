import { openWindow, loadRecipeList } from "../../io.js";

const output = [
    "Starting cookbook.exe..."
];

export { output };
export default function () {
    openWindow("recipes");
    loadRecipeList();
  return {};
}
