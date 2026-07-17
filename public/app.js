const API = window.location.origin;
const TOKEN_KEY = "afterglow_token";
const USER_KEY = "afterglow_user";
const SESSION_KEY = "afterglow_session_id";

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

let activeExercise = null;
let timerInterval = null;
let signalRConnection = null;
let buddyConnection = null;
let currentBuddyMatchId = null;
let buddyQueueInterval = null;

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

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    stopBuddyPolling();
    try {
      await authFetch(`${API}/api/buddy/queue`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: getSessionId() }),
      });
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    if (signalRConnection) signalRConnection.stop();
    if (buddyConnection) buddyConnection.stop();
    window.location.href = "/login.html";
  });

  document.getElementById("login-link-btn")?.addEventListener("click", () => {
    window.location.href = "/login.html";
  });
}

// --- SignalR (Support Wall) ---
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
    console.log("SignalR support wall connected");
  } catch (err) {
    console.error("SignalR connection failed:", err);
  }
}

// --- SignalR (Buddy Chat) ---
async function connectBuddyChat(matchId) {
  if (typeof signalR === "undefined") return;

  if (buddyConnection) await buddyConnection.stop();

  buddyConnection = new signalR.HubConnectionBuilder()
    .withUrl(`${API}/hubs/buddy`)
    .withAutomaticReconnect()
    .build();

  buddyConnection.on("ReceiveBuddyMessage", (senderSessionId, text, timestamp) => {
    const container = document.getElementById("buddy-chat-messages");
    const isMe = senderSessionId === getSessionId();
    const msgHtml = `
      <div class="buddy-message ${isMe ? "buddy-message-me" : "buddy-message-them"}">
        <p>${escapeHtml(text)}</p>
        <div class="message-time">${timeAgo(timestamp)}</div>
      </div>
    `;
    container.insertAdjacentHTML("beforeend", msgHtml);
    container.scrollTop = container.scrollHeight;
  });

  buddyConnection.on("MatchEnded", (endedMatchId, partnerSessionId) => {
    if (currentBuddyMatchId === endedMatchId) {
      const status = document.getElementById("buddy-status");
      if (status) status.textContent = "Your buddy has left the match.";
      resetBuddyState();
    }
  });

  try {
    await buddyConnection.start();
    await buddyConnection.invoke("JoinBuddyChat", matchId);
    console.log("Buddy chat connected for match", matchId);
  } catch (err) {
    console.error("Buddy chat connection failed:", err);
  }
}

// --- Check-in Questionnaire ---
async function loadQuestions() {
  const container = document.getElementById("questions-container");
  try {
    const res = await authFetch(`${API}/api/checkin/questions`);
    const questions = await res.json();

    container.innerHTML = questions
      .map((q) => {
        if (q.type === "scale") {
          return `
            <div class="question-block" data-qid="${q.id}">
              <p class="question-text">${escapeHtml(q.text)}</p>
              <div class="scale-buttons">
                <button class="scale-btn" data-value="1">1</button>
                <button class="scale-btn" data-value="2">2</button>
                <button class="scale-btn" data-value="3">3</button>
                <button class="scale-btn" data-value="4">4</button>
                <button class="scale-btn" data-value="5">5</button>
              </div>
              <div class="scale-labels"><span>Not at all</span><span>Extremely</span></div>
            </div>
          `;
        } else {
          return `
            <div class="question-block" data-qid="${q.id}">
              <p class="question-text">${escapeHtml(q.text)}</p>
              <div class="yesno-buttons">
                <button class="yesno-btn" data-value="0">No</button>
                <button class="yesno-btn" data-value="10">Yes</button>
              </div>
            </div>
          `;
        }
      })
      .join("");

    container.querySelectorAll(".scale-btn, .yesno-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const block = btn.closest(".question-block");
        block.querySelectorAll(".scale-btn, .yesno-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        block.dataset.answer = btn.dataset.value;
        checkAllAnswered();
      });
    });
  } catch (err) {
    container.innerHTML = '<p class="subtitle">Could not load questions. Please refresh.</p>';
    console.error("Failed to load questions:", err);
  }
}

function checkAllAnswered() {
  const blocks = document.querySelectorAll(".question-block");
  const allAnswered = Array.from(blocks).every((b) => b.dataset.answer);
  document.getElementById("submit-checkin").disabled = !allAnswered;
}

async function submitCheckIn() {
  const btn = document.getElementById("submit-checkin");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  const blocks = document.querySelectorAll(".question-block");
  const answers = Array.from(blocks).map((b) => ({
    questionId: parseInt(b.dataset.qid),
    value: parseInt(b.dataset.answer),
  }));

  try {
    const res = await authFetch(`${API}/api/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId(), answers }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "Something went wrong");
      btn.disabled = false;
      btn.textContent = "Submit Check-in";
      return;
    }

    document.getElementById("checkin").innerHTML = `
      <div class="success-message">
        <p>Thank you for checking in. Here are some things that might help you right now.</p>
      </div>
    `;

    const resubmitBtn = document.getElementById("resubmit-checkin");
    if (resubmitBtn) resubmitBtn.classList.remove("hidden");

    loadDashboard();
    loadRecommendations();
  } catch (err) {
    console.error("Check-in failed:", err);
    alert("Could not connect to server. Try again.");
    btn.disabled = false;
    btn.textContent = "Submit Check-in";
  }
}

function resetBuddyState() {
  stopBuddyPolling();
  currentBuddyMatchId = null;
  if (buddyConnection) {
    buddyConnection.stop();
    buddyConnection = null;
  }

  const findBtn = document.getElementById("find-buddy-btn");
  const cancelBtn = document.getElementById("cancel-buddy-btn");
  const chat = document.getElementById("buddy-chat");
  const chatMessages = document.getElementById("buddy-chat-messages");
  const status = document.getElementById("buddy-status");

  if (findBtn) { findBtn.classList.remove("hidden"); findBtn.disabled = false; findBtn.textContent = "Find a Buddy"; }
  if (cancelBtn) cancelBtn.classList.add("hidden");
  if (chat) chat.classList.add("hidden");
  if (chatMessages) chatMessages.innerHTML = "";
  if (status) status.textContent = "";
}

async function resubmitCheckIn() {
  try {
    await authFetch(`${API}/api/buddy/match/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId() }),
    });
  } catch (err) {
    console.error("Failed to end match:", err);
  }

  resetBuddyState();

  document.getElementById("dashboard")?.classList.add("hidden");
  document.getElementById("buddy-section")?.classList.add("hidden");

  const resubmitBtn = document.getElementById("resubmit-checkin");
  if (resubmitBtn) resubmitBtn.classList.add("hidden");

  const checkin = document.getElementById("checkin");
  checkin.classList.remove("hidden");
  checkin.innerHTML = `
    <h2>How are you doing right now?</h2>
    <p class="subtitle">Answer a few quick questions. Your response is anonymous.</p>
    <div id="questions-container"></div>
    <button id="submit-checkin" class="primary-btn" disabled>Submit Check-in</button>
    <div id="checkin-success" class="success-message hidden">
      <p>Thank you for checking in. Here are some things that might help you right now.</p>
    </div>
    <button id="resubmit-checkin" class="secondary-btn hidden">Change My Answers</button>
  `;

  document.getElementById("submit-checkin").addEventListener("click", submitCheckIn);
  document.getElementById("resubmit-checkin").addEventListener("click", resubmitCheckIn);
  loadQuestions();
  checkin.scrollIntoView({ behavior: "smooth" });
}

// --- Dashboard ---
async function loadDashboard() {
  const grid = document.getElementById("features-grid");
  const dashboard = document.getElementById("dashboard");

  grid.innerHTML = `
    <div class="feature-card" id="feature-exercises">
      <h3>Breathing & Grounding</h3>
      <p>Exercises to calm your mind right now</p>
      <button class="feature-btn" onclick="showExercisesSection()">Open</button>
    </div>
    <div class="feature-card" id="feature-buddy">
      <h3>Buddy Chat</h3>
      <p>Talk to someone who understands</p>
      <button class="feature-btn" onclick="showBuddySection()">Find someone</button>
    </div>
    <div class="feature-card" id="feature-support">
      <h3>Support Wall</h3>
      <p>Read and send messages of support</p>
      <button class="feature-btn" onclick="scrollToSection('support-wall')">Go there</button>
    </div>
  `;

  dashboard.classList.remove("hidden");
}

async function loadRecommendations() {
  try {
    const res = await authFetch(`${API}/api/checkin/recommendations?sessionId=${getSessionId()}`);
    const data = await res.json();

    const featureMap = {
      breathing: "feature-exercises",
      grounding: "feature-exercises",
      journal: "feature-buddy",
      chat: "feature-support",
      exercises: "feature-exercises",
    };

    data.features.forEach((f) => {
      const id = featureMap[f];
      if (id) {
        const el = document.getElementById(id);
        if (el) el.classList.add("recommended");
      }
    });
  } catch (err) {
    console.error("Failed to load recommendations:", err);
  }
}

function showExercisesSection() {
  const section = document.getElementById("exercise-area");
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth" });
  document.getElementById("exercise-title").textContent = "Pick an exercise";
  document.getElementById("exercise-instructions").textContent = "We will suggest one based on how you feel. Or choose from the list below.";
  loadExercisesList();
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

// --- Exercises ---
async function loadExercisesList() {
  try {
    const res = await authFetch(`${API}/api/checkin/recommendations?sessionId=${getSessionId()}`);
    const data = await res.json();

    const moodMap = {
      breathing: "anxiety",
      grounding: "anxiety",
      exercises: "insomnia",
    };

    let moodType = "any";
    for (const f of data.features) {
      if (moodMap[f]) { moodType = moodMap[f]; break; }
    }

    const moodId = { anxiety: 2, insomnia: 5, loneliness: 4, low: 3 }[moodType] || 3;
    const exRes = await authFetch(`${API}/api/exercises/${moodId}`);
    const exercises = await exRes.json();

    if (exercises.length > 0) {
      showExercise(exercises[0]);
    }
  } catch (err) {
    console.error("Failed to load exercises:", err);
  }
}

function showExercise(exercise) {
  activeExercise = exercise;
  document.getElementById("exercise-title").textContent = exercise.title;
  document.getElementById("exercise-instructions").textContent = exercise.instructions;
  document.getElementById("exercise-timer").classList.add("hidden");
  document.getElementById("start-exercise").textContent = "Start Exercise";
  document.getElementById("start-exercise").classList.remove("hidden");
  document.getElementById("exercise-area").classList.remove("hidden");
  document.getElementById("exercise-area").scrollIntoView({ behavior: "smooth" });
}

document.getElementById("start-exercise").addEventListener("click", () => {
  if (!activeExercise) return;

  let remaining = activeExercise.durationSeconds;
  document.getElementById("exercise-timer").classList.remove("hidden");
  document.getElementById("start-exercise").classList.add("hidden");
  updateTimerDisplay(remaining);

  timerInterval = setInterval(() => {
    remaining--;
    updateTimerDisplay(remaining);
    if (remaining <= 0) {
      clearInterval(timerInterval);
      document.getElementById("timer-text").textContent = "Done";
      document.getElementById("start-exercise").textContent = "Try Again";
      document.getElementById("start-exercise").classList.remove("hidden");
    }
  }, 1000);
});

function updateTimerDisplay(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  document.getElementById("timer-text").textContent = `${m}:${s.toString().padStart(2, "0")}`;
}

document.getElementById("close-exercise").addEventListener("click", () => {
  if (timerInterval) clearInterval(timerInterval);
  document.getElementById("exercise-area").classList.add("hidden");
  activeExercise = null;
});

// --- Buddy System ---
async function showBuddySection() {
  const section = document.getElementById("buddy-section");
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth" });

  try {
    const res = await authFetch(`${API}/api/buddy/match/active?sessionId=${getSessionId()}`);
    const data = await res.json();

    if (data.matched) {
      currentBuddyMatchId = data.matchId;
      document.getElementById("find-buddy-btn").classList.add("hidden");
      document.getElementById("cancel-buddy-btn").classList.add("hidden");
      document.getElementById("buddy-status").textContent = "You're connected with a buddy. Say hello below.";
      document.getElementById("buddy-chat").classList.remove("hidden");
      loadBuddyMessages(data.matchId);
      connectBuddyChat(data.matchId);
    }
  } catch (err) {
    console.error("Failed to check active match:", err);
  }
}

document.getElementById("find-buddy-btn").addEventListener("click", async () => {
  const btn = document.getElementById("find-buddy-btn");
  const cancelBtn = document.getElementById("cancel-buddy-btn");
  const status = document.getElementById("buddy-status");

  btn.disabled = true;
  btn.textContent = "Joining queue...";
  status.textContent = "Looking for someone who feels similar to you...";

  try {
    const res = await authFetch(`${API}/api/buddy/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId() }),
    });

    const data = await res.json();

    if (!res.ok) {
      status.textContent = data.error || "Could not join the queue.";
      btn.disabled = false;
      btn.textContent = "Find a Buddy";
      return;
    }

    btn.classList.add("hidden");
    cancelBtn.classList.remove("hidden");
    status.textContent = "Searching... You'll be matched as soon as someone compatible joins.";

    startBuddyPolling();
  } catch (err) {
    console.error("Failed to join queue:", err);
    status.textContent = "Could not connect to server. Try again.";
    btn.disabled = false;
    btn.textContent = "Find a Buddy";
  }
});

document.getElementById("cancel-buddy-btn").addEventListener("click", async () => {
  stopBuddyPolling();

  const btn = document.getElementById("find-buddy-btn");
  const cancelBtn = document.getElementById("cancel-buddy-btn");
  const status = document.getElementById("buddy-status");

  try {
    await authFetch(`${API}/api/buddy/queue`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId() }),
    });
  } catch (err) {
    console.error("Failed to leave queue:", err);
  }

  cancelBtn.classList.add("hidden");
  btn.classList.remove("hidden");
  btn.disabled = false;
  btn.textContent = "Find a Buddy";
  status.textContent = "Search cancelled.";
});

function startBuddyPolling() {
  stopBuddyPolling();
  buddyQueueInterval = setInterval(checkBuddyMatch, 2000);
}

function stopBuddyPolling() {
  if (buddyQueueInterval) {
    clearInterval(buddyQueueInterval);
    buddyQueueInterval = null;
  }
}

async function checkBuddyMatch() {
  try {
    const res = await authFetch(`${API}/api/buddy/queue/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId() }),
    });

    const data = await res.json();

    if (data.matched) {
      stopBuddyPolling();

      currentBuddyMatchId = data.matchId;
      const status = document.getElementById("buddy-status");
      status.textContent = "You've been matched! Say hello below.";

      document.getElementById("find-buddy-btn").classList.add("hidden");
      document.getElementById("cancel-buddy-btn").classList.add("hidden");
      document.getElementById("buddy-chat").classList.remove("hidden");
      loadBuddyMessages(data.matchId);
      connectBuddyChat(data.matchId);
    } else if (!data.queued) {
      stopBuddyPolling();
      resetBuddyState();
    }
  } catch (err) {
    console.error("Buddy check failed:", err);
  }
}

async function loadBuddyMessages(matchId) {
  try {
    const res = await authFetch(`${API}/api/buddy/messages/${matchId}`);
    const messages = await res.json();
    const container = document.getElementById("buddy-chat-messages");
    container.innerHTML = "";

    messages.forEach((m) => {
      const isMe = m.senderSessionId === getSessionId();
      const msgHtml = `
        <div class="buddy-message ${isMe ? "buddy-message-me" : "buddy-message-them"}">
          <p>${escapeHtml(m.text)}</p>
          <div class="message-time">${timeAgo(m.sentAt)}</div>
        </div>
      `;
      container.insertAdjacentHTML("beforeend", msgHtml);
    });

    container.scrollTop = container.scrollHeight;
  } catch (err) {
    console.error("Failed to load buddy messages:", err);
  }
}

document.getElementById("buddy-send-btn").addEventListener("click", async () => {
  const input = document.getElementById("buddy-chat-input");
  const text = input.value.trim();
  if (!text || !currentBuddyMatchId || !buddyConnection) return;

  try {
    await buddyConnection.invoke("SendBuddyMessage", currentBuddyMatchId, getSessionId(), text);
    input.value = "";
  } catch (err) {
    console.error("Failed to send buddy message:", err);
  }
});

document.getElementById("leave-buddy-btn").addEventListener("click", async () => {
  if (!currentBuddyMatchId) return;

  try {
    await authFetch(`${API}/api/buddy/match/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId() }),
    });
  } catch (err) {
    console.error("Failed to leave chat:", err);
  }

  resetBuddyState();
  document.getElementById("buddy-status").textContent = "You left the chat.";
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
  const container = document.getElementById("messages-container");
  if (messages.length === 0) {
    container.innerHTML =
      '<p style="color:#4a4260;text-align:center;padding:1rem;">No messages yet. Be the first to share support.</p>';
    return;
  }

  container.innerHTML = messages
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
document.getElementById("send-message").addEventListener("click", async () => {
  const input = document.getElementById("message-input");
  const content = input.value.trim();
  if (!content) return;

  const btn = document.getElementById("send-message");
  btn.disabled = true;

  try {
    const res = await authFetch(`${API}/api/support/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (res.ok) {
      input.value = "";
      loadMessages();
    } else {
      const data = await res.json();
      alert(data.error || "Could not send message");
    }
  } catch (err) {
    console.error("Send failed:", err);
    alert("Could not connect to server");
  }

  btn.disabled = false;
});

// --- Crisis Hotlines (from backend) ---
async function loadRegionalCrisis() {
  let region = "DEFAULT";

  try {
    const res = await fetch("https://ipapi.co/json/");
    if (res.ok) {
      const data = await res.json();
      region = data.country_code || "DEFAULT";
    }
  } catch {}

  try {
    const res = await authFetch(`${API}/api/hotlines/${region}`);
    const hotlines = await res.json();
    renderCrisisFromBackend(hotlines, region);
  } catch {
    renderCrisisFallback(region);
  }
}

function renderCrisisFromBackend(hotlines, region) {
  const label = { US: "United States", GB: "United Kingdom", RO: "Romania", DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", JP: "Japan", AU: "Australia", CA: "Canada", BR: "Brazil", IN: "India", PL: "Poland" }[region] || "your region";

  const crisisLabel = document.getElementById("crisis-region-label");
  const crisisList = document.getElementById("crisis-list");
  const helpPanelRegion = document.getElementById("help-panel-region");
  const helpPanelList = document.getElementById("help-panel-list");

  const html = hotlines
    .map((l) => {
      if (l.type === "web") {
        return `<li><strong>${escapeHtml(l.name)}</strong> - <a href="${l.number}" target="_blank" rel="noopener">Find local help</a></li>`;
      }
      const prefix = l.prefix || "";
      return `<li><strong>${escapeHtml(l.name)}</strong> - ${prefix}<a href="tel:${l.number.replace(/\s/g, "")}">${escapeHtml(l.number)}</a></li>`;
    })
    .join("");

  crisisLabel.textContent = `Resources for ${label}:`;
  crisisList.innerHTML = html;
  helpPanelRegion.textContent = `Resources for ${label}:`;
  helpPanelList.innerHTML = html;
}

function renderCrisisFallback(region) {
  const crisisLabel = document.getElementById("crisis-region-label");
  const crisisList = document.getElementById("crisis-list");
  const helpPanelRegion = document.getElementById("help-panel-region");
  const helpPanelList = document.getElementById("help-panel-list");

  const html = `
    <li><strong>International Association for Suicide Prevention</strong> - <a href="https://www.iasp.info/resources/Crisis_Centres/" target="_blank" rel="noopener">Find local help</a></li>
    <li><strong>Emergency (EU)</strong> - <a href="tel:112">112</a></li>
  `;

  crisisLabel.textContent = "Resources for your region:";
  crisisList.innerHTML = html;
  helpPanelRegion.textContent = "Resources for your region:";
  helpPanelList.innerHTML = html;
}

// --- Floating Help Button ---
function initHelpButton() {
  const fab = document.getElementById("help-fab");
  const panel = document.getElementById("help-panel");
  const closeBtn = document.getElementById("close-help-panel");

  fab.addEventListener("click", () => panel.classList.toggle("hidden"));
  closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== fab) panel.classList.add("hidden");
  });
}

// --- Helpers ---
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function timeAgo(dateStr) {
  const date = new Date(dateStr.includes("Z") ? dateStr : dateStr + "Z");
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
document.getElementById("submit-checkin").addEventListener("click", submitCheckIn);
document.getElementById("resubmit-checkin").addEventListener("click", resubmitCheckIn);

initUserStatus();
connectSignalR();
loadQuestions();
loadMessages();
setInterval(loadMessages, 30000);
initHelpButton();
loadRegionalCrisis();
