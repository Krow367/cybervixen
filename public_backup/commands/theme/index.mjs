export default function(entry) {
    let theme = entry.theme;
    const element = document.documentElement;
    if (theme === "amber"){
        element.dataset.theme = "amber"
        localStorage.setItem("theme", "amber")
    }
    else if (theme === "green"){
        document.documentElement.removeAttribute("data-theme");
        localStorage.removeItem("theme")
    }
}