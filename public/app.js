const API = window.location.origin;
const TOKEN_KEY = "crepuscul_token";
const USER_KEY = "crepuscul_user";

let selectedMood = null;
let activeExercise = null;
let timerInterval = null;
let signalRConnection = null;

// --- Auth Helpers ---
function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getAuthUser() {
  return localStorage.getItem(USER_KEY);
}

function isLoggedIn() {
  return !!getAuthToken();
}

async function authFetch(url, options = {}) {
  const token = getAuthToken();
  if (token) {
    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return fetch(url, options);
}

// --- User Status Bar ---
function initUserStatus() {
  const header = document.querySelector("header");
  const user = getAuthUser();

  const statusBar = document.createElement("div");
  statusBar.className = "user-status-bar";

  if (user) {
    statusBar.innerHTML = `
      <span class="user-greeting">Signed in as <strong>${escapeHtml(user)}</strong></span>
      <button id="logout-btn" class="logout-btn">Sign Out</button>
    `;
  } else {
    statusBar.innerHTML = `
      <span class="user-greeting">Browsing as <strong>Guest</strong></span>
      <button id="login-link-btn" class="logout-btn">Sign In</button>
    `;
  }

  header.appendChild(statusBar);

  const logoutBtn = document.getElementById("logout-btn");
  const loginLinkBtn = document.getElementById("login-link-btn");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      if (signalRConnection) {
        signalRConnection.stop();
        signalRConnection = null;
      }
      window.location.href = "/login.html";
    });
  }

  if (loginLinkBtn) {
    loginLinkBtn.addEventListener("click", () => {
      window.location.href = "/login.html";
    });
  }
}

// --- SignalR ---
async function connectSignalR() {
  if (typeof signalR === "undefined") return;

  signalRConnection = new signalR.HubConnectionBuilder()
    .withUrl(`${API}/hubs/support`, {
      accessTokenFactory: () => getAuthToken() || null,
    })
    .withAutomaticReconnect()
    .build();

  signalRConnection.on("ReceiveMessage", (username, content, timestamp) => {
    const container = document.getElementById("messages-container");
    const msgHtml = `
      <div class="message-item">
        <p>${escapeHtml(content)} <span class="message-user">- ${escapeHtml(username)}</span></p>
        <div class="message-time">${timeAgo(timestamp)}</div>
      </div>
    `;
    container.insertAdjacentHTML("afterbegin", msgHtml);
  });

  try {
    await signalRConnection.start();
    console.log("SignalR connected");
  } catch (err) {
    console.error("SignalR connection failed:", err);
  }
}

// --- DOM Elements ---
const moodButtons = document.querySelectorAll(".mood-btn");
const noteInput = document.getElementById("note-input");
const submitBtn = document.getElementById("submit-checkin");
const exerciseArea = document.getElementById("exercise-area");
const exerciseTitle = document.getElementById("exercise-title");
const exerciseInstructions = document.getElementById("exercise-instructions");
const exerciseTimer = document.getElementById("exercise-timer");
const timerText = document.getElementById("timer-text");
const startExerciseBtn = document.getElementById("start-exercise");
const closeExerciseBtn = document.getElementById("close-exercise");
const messagesContainer = document.getElementById("messages-container");
const messageInput = document.getElementById("message-input");
const sendMessageBtn = document.getElementById("send-message");

// --- Mood Selection ---
moodButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    moodButtons.forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedMood = parseInt(btn.dataset.mood);
    submitBtn.disabled = false;
  });
});

// --- Check-in Submit ---
submitBtn.addEventListener("click", async () => {
  if (!selectedMood) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending...";

  try {
    const res = await authFetch(`${API}/api/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood: selectedMood, note: noteInput.value }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Something went wrong");
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Check-in";
      return;
    }

    const checkinSection = document.getElementById("checkin");
    checkinSection.innerHTML = `
      <div class="success-message">
        <p>Your check-in has been received. Thank you for reaching out.</p>
      </div>
    `;

    if (data.exercise) {
      showExercise(data.exercise);
    } else {
      fetchRandomExercise(selectedMood);
    }
  } catch (err) {
    console.error("Check-in failed:", err);
    alert("Could not connect to server. Try again.");
    submitBtn.disabled = false;
    submitBtn.textContent = "Send Check-in";
  }
});

// --- Fetch Exercise for Mood ---
async function fetchRandomExercise(mood) {
  try {
    const res = await authFetch(`${API}/api/exercises/${mood}`);
    const exercises = await res.json();
    if (exercises.length > 0) {
      showExercise(exercises[0]);
    }
  } catch (err) {
    console.error("Failed to fetch exercise:", err);
  }
}

// --- Show Exercise ---
function showExercise(exercise) {
  activeExercise = exercise;
  exerciseTitle.textContent = exercise.title;
  exerciseInstructions.textContent = exercise.instructions;
  exerciseTimer.classList.add("hidden");
  startExerciseBtn.textContent = "Start Exercise";
  startExerciseBtn.classList.remove("hidden");
  exerciseArea.classList.remove("hidden");
  exerciseArea.scrollIntoView({ behavior: "smooth" });
}

// --- Start Exercise Timer ---
startExerciseBtn.addEventListener("click", () => {
  if (!activeExercise) return;

  let remaining = activeExercise.durationSeconds;
  exerciseTimer.classList.remove("hidden");
  startExerciseBtn.classList.add("hidden");
  updateTimerDisplay(remaining);

  timerInterval = setInterval(() => {
    remaining--;
    updateTimerDisplay(remaining);

    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerText.textContent = "Done";
      startExerciseBtn.textContent = "Try Again";
      startExerciseBtn.classList.remove("hidden");
    }
  }, 1000);
});

function updateTimerDisplay(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  timerText.textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

// --- Close Exercise ---
closeExerciseBtn.addEventListener("click", () => {
  if (timerInterval) clearInterval(timerInterval);
  exerciseArea.classList.add("hidden");
  activeExercise = null;
});

// --- Support Wall Messages ---
async function loadMessages() {
  try {
    const res = await authFetch(`${API}/api/support/messages`);
    const messages = await res.json();
    renderMessages(messages);
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

function renderMessages(messages) {
  if (messages.length === 0) {
    messagesContainer.innerHTML =
      '<p style="color:#4a4260;text-align:center;padding:1rem;">No messages yet. Be the first to share support.</p>';
    return;
  }

  messagesContainer.innerHTML = messages
    .map(
      (msg) => `
    <div class="message-item">
      <p>${escapeHtml(msg.content)}</p>
      <div class="message-time">${timeAgo(msg.created_at)}</div>
    </div>
  `
    )
    .join("");
}

// --- Send Message ---
sendMessageBtn.addEventListener("click", async () => {
  const content = messageInput.value.trim();
  if (!content) return;

  sendMessageBtn.disabled = true;

  try {
    const res = await authFetch(`${API}/api/support/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (res.ok) {
      messageInput.value = "";
      loadMessages();
    } else {
      const data = await res.json();
      alert(data.error || "Could not send message");
    }
  } catch (err) {
    console.error("Send failed:", err);
    alert("Could not connect to server");
  }

  sendMessageBtn.disabled = false;
});

// --- Helpers ---
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function timeAgo(dateStr) {
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

// --- Init ---
initUserStatus();
connectSignalR();
loadMessages();
setInterval(loadMessages, 30000);
initHelpButton();
loadRegionalCrisis();

// --- Crisis Numbers by Region ---
const CRISIS_DATA = {
  US: {
    label: "United States",
    lines: [
      { name: "988 Suicide & Crisis Lifeline", number: "988", type: "tel" },
      { name: "Crisis Text Line", number: "741741", type: "sms", prefix: "Text HOME to " },
      { name: "SAMHSA Helpline", number: "1-800-662-4357", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "911", type: "tel" },
  },
  GB: {
    label: "United Kingdom",
    lines: [
      { name: "Samaritans", number: "116 123", type: "tel" },
      { name: "Shout Crisis Text", number: "85258", type: "sms", prefix: "Text SHOUT to " },
      { name: "Mind Infoline", number: "0300 123 3393", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "999", type: "tel" },
  },
  RO: {
    label: "Romania",
    lines: [
      { name: "Telefonul Sperantei", number: "0800 820 020", type: "tel" },
      { name: "Lifeline Romania", number: "0800 800 111", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "112", type: "tel" },
  },
  DE: {
    label: "Germany",
    lines: [
      { name: "Telefonseelsorge", number: "0800 111 0 111", type: "tel" },
      { name: "Telefonseelsorge (alternative)", number: "0800 111 0 222", type: "tel" },
      { name: "Nummer gegen Kummer", number: "116 123", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "112", type: "tel" },
  },
  FR: {
    label: "France",
    lines: [
      { name: "SOS Amitie", number: "09 72 39 40 50", type: "tel" },
      { name: "Fil Santé Jeunes", number: "0 800 235 236", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "112", type: "tel" },
  },
  ES: {
    label: "Spain",
    lines: [
      { name: "Teléfono de la Esperanza", number: "717 000 078", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "112", type: "tel" },
  },
  IT: {
    label: "Italy",
    lines: [
      { name: "Telefono Amico", number: "02 2327 2327", type: "tel" },
      { name: "Telefono Azzurro", number: "19696", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "112", type: "tel" },
  },
  JP: {
    label: "Japan",
    lines: [
      { name: "TELL Lifeline", number: "03-5774-0992", type: "tel" },
      { name: "Yorisoi Hotline", number: "0120-279-338", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "119", type: "tel" },
  },
  AU: {
    label: "Australia",
    lines: [
      { name: "Lifeline Australia", number: "13 11 14", type: "tel" },
      { name: "Kids Helpline", number: "1800 55 1800", type: "tel" },
      { name: "Beyond Blue", number: "1300 22 4636", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "000", type: "tel" },
  },
  CA: {
    label: "Canada",
    lines: [
      { name: "Talk Suicide Canada", number: "1-833-456-4566", type: "tel" },
      { name: "Crisis Text Line", number: "45645", type: "sms", prefix: "Text HOME to " },
    ],
    emergency: { name: "Emergency", number: "911", type: "tel" },
  },
  BR: {
    label: "Brazil",
    lines: [
      { name: "CVV (Life Valuation)", number: "188", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "192", type: "tel" },
  },
  IN: {
    label: "India",
    lines: [
      { name: "iCall", number: "9152987821", type: "tel" },
      { name: "AASRA", number: "9820466726", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "112", type: "tel" },
  },
  PL: {
    label: "Poland",
    lines: [
      { name: "Centrum Wsparcia", number: "800 70 2222", type: "tel" },
      { name: "Phone Crisis", number: "116 123", type: "tel" },
    ],
    emergency: { name: "Emergency", number: "112", type: "tel" },
  },
  DEFAULT: {
    label: "International",
    lines: [
      { name: "Befrienders Worldwide", number: "https://www.befrienders.org", type: "web" },
      { name: "International Association for Suicide Prevention", number: "https://www.iasp.info/resources/Crisis_Centres/", type: "web" },
    ],
    emergency: { name: "Emergency (EU)", number: "112", type: "tel" },
  },
};

function getRegionLines(region) {
  const data = CRISIS_DATA[region] || CRISIS_DATA.DEFAULT;
  const all = [...data.lines];
  if (data.emergency) all.push(data.emergency);
  return { label: data.label, lines: all };
}

function renderCrisisList(container, lines) {
  container.innerHTML = lines
    .map((l) => {
      if (l.type === "web") {
        return `<li><strong>${l.name}</strong> - <a href="${l.number}" target="_blank" rel="noopener">Find local help</a></li>`;
      }
      const prefix = l.prefix || "";
      return `<li><strong>${l.name}</strong> - ${prefix}<a href="tel:${l.number.replace(/\s/g, "")}">${l.number}</a></li>`;
    })
    .join("");
}

// --- Region Detection & Crisis Loading ---
async function loadRegionalCrisis() {
  let region = "DEFAULT";

  try {
    const res = await fetch("https://ipapi.co/json/");
    if (res.ok) {
      const data = await res.json();
      region = data.country_code || "DEFAULT";
    }
  } catch {}

  const { label, lines } = getRegionLines(region);

  const crisisLabel = document.getElementById("crisis-region-label");
  const crisisList = document.getElementById("crisis-list");
  const helpPanelRegion = document.getElementById("help-panel-region");
  const helpPanelList = document.getElementById("help-panel-list");

  crisisLabel.textContent = `Resources for ${label}:`;
  renderCrisisList(crisisList, lines);

  helpPanelRegion.textContent = `Resources for ${label}:`;
  renderCrisisList(helpPanelList, lines);
}

// --- Floating Help Button ---
function initHelpButton() {
  const fab = document.getElementById("help-fab");
  const panel = document.getElementById("help-panel");
  const closeBtn = document.getElementById("close-help-panel");

  fab.addEventListener("click", () => {
    panel.classList.toggle("hidden");
  });

  closeBtn.addEventListener("click", () => {
    panel.classList.add("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== fab) {
      panel.classList.add("hidden");
    }
  });
}
