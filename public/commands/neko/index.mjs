export default function () {
  window.NekoType = "neon";

  let nl = document.getElementById("nl");
  if (!nl) {
    nl = document.createElement("h1");
    nl.id = "nl";
    document.body.appendChild(nl);
  }

  nl.innerHTML = '<script src="https://webneko.net/n20171213.js"><\/script>';
}