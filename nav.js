// Hides the members-only links when logged out and adds a login/logout link on the right of the navbar.
(() => {
  const loggedIn = !!localStorage.getItem("token");
  const container = document.querySelector("nav .container-fluid");
  if (!loggedIn) {
    container.querySelectorAll('a[href="daily.html"], a[href="endless.html"]').forEach((a) => a.remove());
  }
  const link = document.createElement("a");
  link.className = "navbar-brand navbar-spacing";
  link.textContent = loggedIn ? "logout" : "login";
  link.href = loggedIn ? "index.html" : "login.html";
  if (loggedIn) link.addEventListener("click", () => localStorage.removeItem("token"));
  container.appendChild(link);
})();
