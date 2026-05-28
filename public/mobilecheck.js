window.isMobile = function(){
  return (window.matchMedia("(any-hover:none)").matches) 
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded");
} else {
    if (window.isMobile()) {
        mobileDetected()
    }
}

function mobileDetected(){


}