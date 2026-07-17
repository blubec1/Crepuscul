const API = window.location.origin;

let selectedMood = null;
let activeExercise = null;
let timerInterval = null;

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
    const res = await fetch(`${API}/api/checkins`, {
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
    const res = await fetch(`${API}/api/exercises/${mood}`);
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

  let remaining = activeExercise.duration_seconds;
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
    const res = await fetch(`${API}/api/support/messages`);
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
    const res = await fetch(`${API}/api/support/messages`, {
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
loadMessages();
setInterval(loadMessages, 30000);
