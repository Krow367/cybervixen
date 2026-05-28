import { openWindow } from "../../io.js";

const output = [
	"Starting Blog.exe..."
];

export { output };
export default function () {
    openWindow("blog");
  return {};
}