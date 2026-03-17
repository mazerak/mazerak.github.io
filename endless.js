const API_BASE = "https://api.mazerak.com";
const token = localStorage.getItem("token");

async function fetchWithAuth(url, body = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "index.html";
    return null;
  }
  return await res.json();
}

const people = [
  "walker",
  "keith",
  "chris",
  "nim",
  "kylie",
  "ethan",
  "avery",
  "theodore",
];

const quoteTextField = document.getElementById("quoteText");
const dateTextField = document.getElementById("quoteDate");
const streakField = document.getElementById("streak");
const nameGrid = document.getElementById("button-grid-names");

let currentQuoteId = null;
let streak = 0;

function updateStreak() {
  streakField.textContent = `Streak: ${streak}`;
}

function buildNameButtons() {
  nameGrid.innerHTML = "";
  people.forEach((name) => {
    const btn = document.createElement("button");
    btn.id = `button-${name.toLowerCase()}`;
    btn.className = "btn btn-dark w-100";
    btn.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    nameGrid.appendChild(btn);
  });
}

function blockNameButtons() {
  nameGrid.querySelectorAll(".btn").forEach((btn) => (btn.disabled = true));
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const day = date.getDate();
  const suffix = [11, 12, 13].includes(day)
    ? "th"
    : day % 10 === 1
      ? "st"
      : day % 10 === 2
        ? "nd"
        : day % 10 === 3
          ? "rd"
          : "th";
  return `${months[date.getMonth()]} ${day}${suffix}, ${date.getFullYear()}`;
}

nameGrid.addEventListener("click", async function (e) {
  if (e.target.tagName !== "BUTTON" || e.target.disabled) return;

  const guess = e.target.id.replace("button-", "");
  blockNameButtons();

  const result = await fetchWithAuth(`${API_BASE}/check-endless-guess`, {
    id: currentQuoteId,
    guess: guess,
  });

  if (!result) return;

  if (result.correct) {
    e.target.classList.remove("btn-dark");
    e.target.classList.add("btn-success");
    streak++;
    updateStreak();

    setTimeout(() => {
      loadNextQuote();
    }, 1000);
  } else {
    e.target.classList.remove("btn-dark");
    e.target.classList.add("btn-danger");
    endGame();
  }
});

function endGame() {
  quoteTextField.textContent = "you are dead LOL";
  dateTextField.textContent = `final streak: ${streak}`;
  nameGrid.style.display = "none";

  const shareText = [
    `egirldle endless`,
    `Streak: ${streak}`,
    "https://mazerak.com",
  ].join("\n");

  const shareButton = document.getElementById("share-button");
  shareButton.style.display = "";
  shareButton.addEventListener("click", () => {
    navigator.clipboard.writeText(shareText).then(() => {
      shareButton.textContent = "Copied to clipboard";
      setTimeout(() => (shareButton.textContent = "Share Results"), 2000);
    });
  });
}

async function loadNextQuote() {
  const data = await fetchWithAuth(`${API_BASE}/get-endless-quote`);
  if (!data) return;

  currentQuoteId = data.id;
  quoteTextField.textContent = `"${data.text}"`;
  dateTextField.textContent = formatDate(data.timestamp);
  nameGrid.style.display = "grid";
  buildNameButtons();
  updateStreak();
}

loadNextQuote();
