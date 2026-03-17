const API_URL = "https://api.mazerak.com/login";

const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("login-button");
const errorMsg = document.getElementById("error-msg");

const existingToken = localStorage.getItem("token");
if (existingToken) {
  fetch("https://api.mazerak.com/verify-token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: existingToken,
    },
    body: JSON.stringify({}),
  })
    .then((res) => {
      if (res.ok) {
        window.location.href = "home.html";
      } else {
        localStorage.removeItem("token");
        document.body.style.visibility = "visible";
      }
    })
    .catch(() => {
      document.body.style.visibility = "visible";
    });
} else {
  document.body.style.visibility = "visible";
}

async function login() {
  errorMsg.classList.remove("visible");
  const password = passwordInput.value;
  if (!password) return;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      errorMsg.classList.add("visible");
      return;
    }

    const data = await res.json();
    localStorage.setItem("token", data.token);
    window.location.href = "home.html";
  } catch (err) {
    console.error("Request failed: ", err);
    errorMsg.textContent = "Could not reach server";
    errorMsg.classList.add("visible");
  }
}

loginButton.addEventListener("click", login);
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
