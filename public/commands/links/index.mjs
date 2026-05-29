import { openWindow } from "../../io.js";
import { setupWindow } from "../../screen.js";

const output = [
    "Everything is connected.",
    "Nethack.Scan(\"localHost\").GetNeighbors(all)",
    "...................Done!",
    "Compiling....."
];

export { output };
export default function () {
    openWindow("links");
  return {};
}