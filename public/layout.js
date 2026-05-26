document.addEventListener("DOMContentLoaded", function () {
  // Page has finished loading. Now, do things.
  loadLayoutByPetraPixel();

  // Add any custom JavaScript code here...
});

function loadLayoutByPetraPixel() {
  const mainEl = document.querySelector("main");
  if (!mainEl) return;
  mainEl.insertAdjacentHTML("beforebegin", headerHTML());
  mainEl.insertAdjacentHTML("afterend", footerHTML());
  giveActiveClassToCurrentPage();
}

const nesting = getNesting();

function headerHTML() {
  const path = window.location.pathname;
  // ${nesting} outputs "./" or "../" depending on current page depth.
  // You can use it to refer to images etc.
  // Example: <img src="${nesting}img/logo.png"> might output <img src="../img/logo.png">

    if (!path.includes("/blog/")) {
    return `
          <!-- =============================================== -->
      <!-- HEADER -->
      <!-- =============================================== -->

      <header>

        <div class="header-content">
	        <div class="header-title">Welcome to the Fox Den!</div>
	        
	        <!-- NAVIGATION -->
	        <nav>
	          <ul>
	            <li><a href="/home.html">Home</a></li>
	            <li><a href="/about.html">Who am I?</a></li>
              <li><a href="/blog/blog.html">Ramblings</a></li>
	            <li>
	                <strong><a href="/recipes/recipes.html">Recipes!</a></strong>
	                <ul>
	                  <li><a href="/recipes/smash_sauce.html">Burger Sauce</a></li>
	                  <li><a href="/recipes/pizza_casserole.html">Pizza Casserole</a></li>
	                  <li><a href="/recipes/new_roots_creole_salt.html">New Roots & Sweet Home Spice Blends</a></li>
	                  <li><a href="/recipes/shepherds_pie.html">Shepherd's Pie</a></li>
                    <li><a href="/recipes/ham_and_cheese_delight.html">Ham and Cheese Delight</a></li>
	                </ul>
	            </li>
	          </ul>
	        </nav>
        	
        </div>
      </header>
      <!-- =============================================== -->
      <!-- LEFT SIDEBAR -->
      <!-- =============================================== -->

      <aside class="left-sidebar">
	  
        
        <div class="sidebar-section">
          <div class="sidebar-title">Sign my atabook!</div>
          <a href="https://cybervixen.atabook.org"><img src="${nesting}/ata.png" alt="Sign my guestbook!"></a>
          <div class="sidebar-title">Sites I like!</div>
          <a href="https://onio.neocities.org" title="Visit Onio Café"><img src="https://onio.neocities.org/thebutton.gif" alt="Come Chat With Us!" width="88" height="31"></a>
          <a href="https://kuroi.com.br/" title="KuroiOS"><img src="${nesting}/images/kuroi.png" alt="Kuroi OS" width="88" height="31"></a>
        </div>

      </aside>
    `;
  }

  return `
  
      <!-- =============================================== -->
      <!-- HEADER -->
      <!-- =============================================== -->

      <header>

        <div class="header-content">
	        <div class="header-title">Welcome to the Fox Den!</div>
	        
	        <!-- NAVIGATION -->
	        <nav>
	          <ul>
	            <li><a href="/home.html">Home</a></li>
	            <li><a href="/about.html">Who am I?</a></li>
              <li><a href="/blog/blog.html">Ramblings</a></li>
	            <li>
	                <strong><a href="/recipes/recipes.html">Recipes!</a></strong>
	                <ul>
	                  <li><a href="/recipes/smash_sauce.html">Burger Sauce</a></li>
	                  <li><a href="/recipes/pizza_casserole.html">Pizza Casserole</a></li>
	                  <li><a href="/recipes/new_roots_creole_salt.html">New Roots & Sweet Home Spice Blends</a></li>
	                  <li><a href="/recipes/shepherds_pie.html">Shepherd's Pie</a></li>
                    <li><a href="/recipes/ham_and_cheese_delight.html">Ham and Cheese Delight</a></li>
	                </ul>
	            </li>
	          </ul>
	        </nav>
        	
        </div>
      </header>

	  
        

	
	  
    
      `;
}

function footerHTML() {
  // ${nesting} outputs "./" or "../" depending on current page depth.
  // You can use it to refer to images etc.
  // Example: <img src="${nesting}img/logo.png"> might output <img src="../img/logo.png">

  return ``;
}

/* Do not edit anything below this line unless you know what you're doing. */

function giveActiveClassToCurrentPage() {
  const els = document.querySelectorAll("nav a");
  [...els].forEach((el) => {
    const href = el.getAttribute("href").replace(".html", "").replace("#", "");
    const pathname = window.location.pathname.replace("/public/", "");
    const currentHref = window.location.href.replace(".html", "") + "END";

    /* Homepage */
    if (href == "/" || href == "/home.html") {
      if (pathname == "/") {
        el.classList.add("active");
      }
    } else {
      /* Other pages */
      if (currentHref.includes(href + "END")) {
        el.classList.add("active");

        /* Subnavigation: */

        if (el.closest("details")) {
          el.closest("details").setAttribute("open", "open");
          el.closest("details").classList.add("active");
        }

        if (el.closest("ul")) {
          if (el.closest("ul").closest("ul")) {
            el.closest("ul").closest("ul").classList.add("active");
          }
        }
      }
    }
  });
}

function getNesting() {
  const numberOfSlashes = window.location.pathname.split("/").length - 1;
  if (numberOfSlashes == 1) return "./";
  return "../".repeat(numberOfSlashes - 1);
}
