import { openWindow, loadRecipeList } from "../../io.js";

const output = [
    "To consume is human.",
    "To create is life."
];

export { output };
export default function () {
    openWindow("recipes");
    loadRecipeList();
  return {};
}
