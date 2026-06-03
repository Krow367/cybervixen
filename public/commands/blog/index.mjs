import { openWindow, loadBlogPosts } from "../../io.js";

let quotes = [
  "The concept of progress acts as a protective mechanism to shield us from the terrors of the future.",
];

let output;

function pickOutput() {
  output = quotes[Math.floor(Math.random() * quotes.length)];
  return output;
}

pickOutput();

export { output };
export default function () {
  pickOutput();
  openWindow("blog");
  loadBlogPosts();
  return {};
}
