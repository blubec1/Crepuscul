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
    localStorage.removeItem("easter_egg_cricket");
    if (signalRConnection) signalRConnection.stop();
    if (buddyConnection) buddyConnection.stop();
    window.location.href = "/login.html";
  });

  document.getElementById("login-link-btn")?.addEventListener("click", () => {
    window.location.href = "/login.html";
  });
}

// --- SignalR (Pen Pal - disabled, using REST polling) ---
async function connectSignalR() {
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
    <div class="feature-card" id="feature-sounds">
      <h3>Sounds</h3>
      <p>Ambient noise to calm your mind</p>
      <button class="feature-btn" onclick="showSoundsSection()">Open</button>
    </div>
    <div class="feature-card" id="feature-games">
      <h3>Games</h3>
      <p>Low-intensity activities to unwind</p>
      <button class="feature-btn" onclick="showGamesSection()">Open</button>
    </div>
    <div class="feature-card" id="feature-buddy">
      <h3>Buddy Chat</h3>
      <p>Talk to someone who understands</p>
      <button class="feature-btn" onclick="showBuddySection()">Find someone</button>
    </div>
    <div class="feature-card" id="feature-support">
      <h3>Pen Pal</h3>
      <p>Send and receive messages from random people</p>
      <button class="feature-btn" onclick="scrollToSection('penpal-section')">Go there</button>
    </div>
  `;

  dashboard.classList.remove("hidden");
}

async function loadRecommendations() {
  try {
    const res = await authFetch(`${API}/api/checkin/recommendations?sessionId=${getSessionId()}`);
    const data = await res.json();

    const featureMap = {
      sounds: "feature-sounds",
      games: "feature-games",
      journal: "feature-buddy",
      chat: "feature-support",
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

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

// --- Sounds ---
let audioCtx = null;
let soundNodes = {};

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function getMasterGain() {
  if (!soundNodes.masterGain) {
    const ctx = getAudioCtx();
    soundNodes.masterGain = ctx.createGain();
    soundNodes.masterGain.connect(ctx.destination);
    soundNodes.masterGain.gain.value = 0.5;
  }
  return soundNodes.masterGain;
}

function createNoiseBuffer(ctx, duration) {
  const len = duration * ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

const audioBufferCache = {};
async function loadAudioBuffer(url) {
  if (audioBufferCache[url]) return audioBufferCache[url];
  const ctx = getAudioCtx();
  const resp = await fetch(url);
  const data = await resp.arrayBuffer();
  const buf = await ctx.decodeAudioData(data);
  audioBufferCache[url] = buf;
  return buf;
}

function startRain() {
  const ctx = getAudioCtx();
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 4);
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2500;
  bp.Q.value = 0.5;

  const gain = ctx.createGain();
  gain.gain.value = 0.4;

  src.connect(bp);
  bp.connect(gain);
  gain.connect(getMasterGain());
  src.start();
  soundNodes.rain = { src, bp, gain };
}

function stopRain() {
  if (soundNodes.rain) { soundNodes.rain.src.stop(); soundNodes.rain = null; }
}

function startWaves() {
  const ctx = getAudioCtx();
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 6);
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 600;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.3;

  const gain = ctx.createGain();
  gain.gain.value = 0.5;

  lfo.connect(lfoGain);
  lfoGain.connect(gain.gain);
  src.connect(lp);
  lp.connect(gain);
  gain.connect(getMasterGain());
  src.start();
  lfo.start();
  soundNodes.waves = { src, lp, lfo, lfoGain, gain };
}

function stopWaves() {
  if (soundNodes.waves) { soundNodes.waves.src.stop(); soundNodes.waves.lfo.stop(); soundNodes.waves = null; }
}

function startWind() {
  const ctx = getAudioCtx();
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 5);
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 800;
  bp.Q.value = 0.3;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.15;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 400;

  const gain = ctx.createGain();
  gain.gain.value = 0.35;

  lfo.connect(lfoGain);
  lfoGain.connect(bp.frequency);
  src.connect(bp);
  bp.connect(gain);
  gain.connect(getMasterGain());
  src.start();
  lfo.start();
  soundNodes.wind = { src, bp, lfo, lfoGain, gain };
}

function stopWind() {
  if (soundNodes.wind) { soundNodes.wind.src.stop(); soundNodes.wind.lfo.stop(); soundNodes.wind = null; }
}

function startWhiteNoise() {
  const ctx = getAudioCtx();
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx, 4);
  src.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = 0.3;

  src.connect(gain);
  gain.connect(getMasterGain());
  src.start();
  soundNodes.whitenoise = { src, gain };
}

function stopWhiteNoise() {
  if (soundNodes.whitenoise) {
    soundNodes.whitenoise.src.stop();
    soundNodes.whitenoise = null;
  }
}

async function startCampfire() {
  const ctx = getAudioCtx();
  const buf = await loadAudioBuffer("sounds/campfire.mp3");
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = 0.35;

  src.connect(gain);
  gain.connect(getMasterGain());
  src.start();
  soundNodes.campfire = { src, gain };
}

function stopCampfire() {
  if (soundNodes.campfire) {
    soundNodes.campfire.src.stop();
    soundNodes.campfire = null;
  }
}

async function startCrickets() {
  const ctx = getAudioCtx();
  if (localStorage.getItem("easter_egg_cricket") === "1" && localStorage.getItem(USER_KEY) === "cricket") {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 7000;

    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 15;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 2;

    const mainGain = ctx.createGain();
    mainGain.gain.value = 0.15;

    lfo.connect(lfoGain);
    lfoGain.connect(mainGain.gain);

    osc.connect(mainGain);
    mainGain.connect(getMasterGain());

    osc.start();
    lfo.start();
    soundNodes.crickets = { src: osc, lfo, gain: mainGain, lfoGain };
    return;
  }
  const buf = await loadAudioBuffer("sounds/crickets.mp3");
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = 0.3;

  src.connect(gain);
  gain.connect(getMasterGain());
  src.start();
  soundNodes.crickets = { src, gain };
}

function stopCrickets() {
  if (soundNodes.crickets) {
    soundNodes.crickets.src.stop();
    if (soundNodes.crickets.lfo) soundNodes.crickets.lfo.stop();
    soundNodes.crickets = null;
  }
}

function startBinaural() {
  const ctx = getAudioCtx();
  const oscL = ctx.createOscillator();
  const oscR = ctx.createOscillator();
  oscL.frequency.value = 200;
  oscR.frequency.value = 210;

  const merger = ctx.createChannelMerger(2);
  const gainL = ctx.createGain();
  const gainR = ctx.createGain();
  gainL.gain.value = 0.3;
  gainR.gain.value = 0.3;

  oscL.connect(gainL);
  oscR.connect(gainR);
  gainL.connect(merger, 0, 0);
  gainR.connect(merger, 0, 1);
  merger.connect(getMasterGain());
  oscL.start();
  oscR.start();
  soundNodes.binaural = { oscL, oscR, gainL, gainR, merger };
}

function stopBinaural() {
  if (soundNodes.binaural) {
    soundNodes.binaural.oscL.stop();
    soundNodes.binaural.oscR.stop();
    soundNodes.binaural = null;
  }
}

const LOFI_TRACKS = [
  "sounds/lofi-01.mp3", "sounds/lofi-02.mp3", "sounds/lofi-03.mp3",
  "sounds/lofi-04.mp3", "sounds/lofi-05.mp3", "sounds/lofi-06.mp3",
  "sounds/lofi-07.mp3", "sounds/lofi-08.mp3", "sounds/lofi-09.mp3",
  "sounds/lofi-10.mp3"
];

async function startLofi() {
  const ctx = getAudioCtx();
  const url = LOFI_TRACKS[Math.floor(Math.random() * LOFI_TRACKS.length)];
  const buf = await loadAudioBuffer(url);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = 0.4;

  src.connect(gain);
  gain.connect(getMasterGain());
  src.start();
  soundNodes.lofi = { src, gain };
}

function stopLofi() {
  if (soundNodes.lofi) {
    soundNodes.lofi.src.stop();
    soundNodes.lofi = null;
  }
}

const CHOPIN_TRACKS = [
  "sounds/chopin-01.mp3", "sounds/chopin-02.mp3", "sounds/chopin-03.mp3",
  "sounds/chopin-04.mp3", "sounds/chopin-05.mp3"
];

async function startClassical() {
  const ctx = getAudioCtx();
  const url = CHOPIN_TRACKS[Math.floor(Math.random() * CHOPIN_TRACKS.length)];
  const buf = await loadAudioBuffer(url);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const gain = ctx.createGain();
  gain.gain.value = 0.4;

  src.connect(gain);
  gain.connect(getMasterGain());
  src.start();
  soundNodes.classical = { src, gain };
}

function stopClassical() {
  if (soundNodes.classical) {
    soundNodes.classical.src.stop();
    soundNodes.classical = null;
  }
}

const soundStarters = {
  rain: startRain, waves: startWaves, wind: startWind,
  whitenoise: startWhiteNoise, campfire: startCampfire, crickets: startCrickets,
  binaural: startBinaural, lofi: startLofi, classical: startClassical
};
const soundStoppers = {
  rain: stopRain, waves: stopWaves, wind: stopWind,
  whitenoise: stopWhiteNoise, campfire: stopCampfire, crickets: stopCrickets,
  binaural: stopBinaural, lofi: stopLofi, classical: stopClassical
};

document.querySelectorAll(".sound-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const sound = btn.dataset.sound;
    if (btn.classList.contains("active")) {
      soundStoppers[sound]();
      btn.classList.remove("active");
      btn.dataset.loading = "";
    } else if (!btn.dataset.loading) {
      btn.dataset.loading = "1";
      btn.disabled = true;
      await soundStarters[sound]();
      btn.disabled = false;
      if (btn.dataset.loading) {
        btn.classList.add("active");
      }
      btn.dataset.loading = "";
    }
  });
});

document.getElementById("master-volume").addEventListener("input", (e) => {
  const gain = getMasterGain();
  gain.gain.setTargetAtTime(e.target.value / 100, audioCtx.currentTime, 0.02);
});

function showSoundsSection() {
  const section = document.getElementById("sounds-area");
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth" });
}

document.getElementById("close-sounds").addEventListener("click", () => {
  document.querySelectorAll(".sound-btn.active").forEach((btn) => {
    const sound = btn.dataset.sound;
    soundStoppers[sound]();
    btn.classList.remove("active");
  });
  document.getElementById("sounds-area").classList.add("hidden");
});

// --- Games ---
function showGamesSection() {
  const section = document.getElementById("games-area");
  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth" });
}

function showGamePicker() {
  document.getElementById("free-draw-area").classList.add("hidden");
  document.getElementById("aim-trainer-area").classList.add("hidden");
  document.getElementById("firefly-area").classList.add("hidden");
  document.getElementById("game-picker").classList.remove("hidden");
  stopFireflyGame();
}

document.getElementById("close-games").addEventListener("click", () => {
  document.getElementById("games-area").classList.add("hidden");
  if (aimAnimFrame) cancelAnimationFrame(aimAnimFrame);
  if (aimGameInterval) clearInterval(aimGameInterval);
  if (aimCountdown) clearInterval(aimCountdown);
  stopFireflyGame();
  showGamePicker();
});

// --- Free Draw ---
const DRAW_COLORS = ["#a78bfa", "#7c5cbf", "#93c5fd", "#60a5fa", "#6ee7b7", "#34d399", "#c4b5fd", "#e2e8f0"];
let drawColor = DRAW_COLORS[0];
let erasing = false;

function initFreeDraw() {
  const palette = document.getElementById("color-palette");
  palette.innerHTML = "";
  DRAW_COLORS.forEach((c) => {
    const swatch = document.createElement("div");
    swatch.className = "color-swatch" + (c === drawColor ? " selected" : "");
    swatch.style.background = c;
    swatch.addEventListener("click", () => {
      palette.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("selected"));
      swatch.classList.add("selected");
      drawColor = c;
      erasing = false;
      document.getElementById("eraser-btn").classList.remove("active");
      ctx.globalCompositeOperation = "source-over";
    });
    palette.appendChild(swatch);
  });

  const canvas = document.getElementById("draw-canvas");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = drawColor;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    ctx.lineWidth = Math.max(1, Math.min(30, ctx.lineWidth + (e.deltaY > 0 ? -1 : 1)));
    updateBrushCursor();
  }, { passive: false });

  const brushCursor = document.getElementById("brush-cursor");
  const wrapper = canvas.closest(".canvas-wrapper");

  function updateBrushCursor() {
    const size = ctx.lineWidth;
    brushCursor.style.width = size + "px";
    brushCursor.style.height = size + "px";
  }
  updateBrushCursor();

  wrapper.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    brushCursor.style.left = x + "px";
    brushCursor.style.top = y + "px";
    brushCursor.style.display = "block";
  });

  wrapper.addEventListener("mouseleave", () => {
    brushCursor.style.display = "none";
  });

  let drawing = false;

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return { x: touch.clientX - r.left, y: touch.clientY - r.top };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing = true;
    ctx.strokeStyle = drawColor;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function endDraw() { drawing = false; }

  canvas.removeEventListener("mousedown", canvas._mouseDown);
  canvas.removeEventListener("mousemove", canvas._mouseMove);
  canvas.removeEventListener("mouseup", canvas._mouseUp);
  canvas.removeEventListener("touchstart", canvas._touchStart);
  canvas.removeEventListener("touchmove", canvas._touchMove);
  canvas.removeEventListener("touchend", canvas._touchEnd);

  canvas._mouseDown = startDraw;
  canvas._mouseMove = draw;
  canvas._mouseUp = endDraw;
  canvas._touchStart = startDraw;
  canvas._touchMove = draw;
  canvas._touchEnd = endDraw;

  canvas.addEventListener("mousedown", startDraw);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", endDraw);
  canvas.addEventListener("mouseleave", endDraw);
  canvas.addEventListener("touchstart", startDraw, { passive: false });
  canvas.addEventListener("touchmove", draw, { passive: false });
  canvas.addEventListener("touchend", endDraw);
}

  document.getElementById("clear-canvas").addEventListener("click", () => {
  const canvas = document.getElementById("draw-canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

document.getElementById("eraser-btn").addEventListener("click", () => {
  const btn = document.getElementById("eraser-btn");
  erasing = !erasing;
  btn.classList.toggle("active", erasing);
  const ctx = document.getElementById("draw-canvas").getContext("2d");
  ctx.globalCompositeOperation = erasing ? "destination-out" : "source-over";
});

function startFreeDraw() {
  document.getElementById("game-picker").classList.add("hidden");
  document.getElementById("free-draw-area").classList.remove("hidden");
  initFreeDraw();
}

// --- Aim Trainer ---
let aimAnimFrame = null;
let aimGameInterval = null;
let aimCountdown = null;
let aimScore = 0;
let aimTargets = [];
let aimRunning = false;

function initAimTrainer() {
  const canvas = document.getElementById("aim-canvas");
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  const ctx = canvas.getContext("2d");
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  return { canvas, ctx, w: rect.width, h: rect.height };
}

function startAimTrainer() {
  document.getElementById("game-picker").classList.add("hidden");
  document.getElementById("aim-trainer-area").classList.remove("hidden");
  document.getElementById("aim-score").textContent = "0";
  document.getElementById("aim-timer").textContent = "0:30";
  document.getElementById("aim-start-btn").classList.remove("hidden");
  aimScore = 0;
  aimTargets = [];
  aimRunning = false;
  if (aimAnimFrame) cancelAnimationFrame(aimAnimFrame);
  if (aimGameInterval) clearInterval(aimGameInterval);
  if (aimCountdown) clearInterval(aimCountdown);
}

document.getElementById("aim-start-btn").addEventListener("click", () => {
  document.getElementById("aim-start-btn").classList.add("hidden");
  const { canvas, ctx, w, h } = initAimTrainer();
  aimScore = 0;
  aimTargets = [];
  aimRunning = true;
  document.getElementById("aim-score").textContent = "0";

  let remaining = 30;
  document.getElementById("aim-timer").textContent = "0:30";

  aimCountdown = setInterval(() => {
    remaining--;
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    document.getElementById("aim-timer").textContent = `${m}:${s.toString().padStart(2, "0")}`;
    if (remaining <= 0) {
      aimRunning = false;
      clearInterval(aimCountdown);
      clearInterval(aimGameInterval);
    }
  }, 1000);

  aimGameInterval = setInterval(() => {
    if (!aimRunning) return;
    const radius = 20 + Math.random() * 15;
    aimTargets.push({
      x: radius + Math.random() * (w - radius * 2),
      y: radius + Math.random() * (h - radius * 2),
      radius,
      opacity: 1,
      born: Date.now(),
    });
  }, 2500);

  canvas.onclick = (e) => {
    if (!aimRunning) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    for (let i = aimTargets.length - 1; i >= 0; i--) {
      const t = aimTargets[i];
      const dist = Math.sqrt((mx - t.x) ** 2 + (my - t.y) ** 2);
      if (dist <= t.radius) {
        aimTargets.splice(i, 1);
        aimScore++;
        document.getElementById("aim-score").textContent = aimScore;
        break;
      }
    }
  };

  function renderAim() {
    ctx.clearRect(0, 0, w, h);
    const now = Date.now();
    aimTargets = aimTargets.filter((t) => now - t.born < 3000);
    aimTargets.forEach((t) => {
      const age = (now - t.born) / 3000;
      const alpha = 1 - age * 0.5;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(124, 92, 191, ${alpha})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(167, 139, 250, ${alpha})`;
      ctx.fill();
    });
    aimAnimFrame = requestAnimationFrame(renderAim);
  }
  renderAim();
});

// --- Fireflies ---
let fireflyAnimFrame = null;
let fireflySpawnTimer = null;
let fireflies = [];
let fireflyQuotes = [];
let fireflyCaught = 0;
let fireflyDrag = null;

const FIREFLY_QUOTES = [
  "You are enough",
  "This too shall pass",
  "Be gentle with yourself",
  "You are not alone",
  "Rest is productive",
  "You deserve peace",
  "Breathe. You're okay.",
  "Small steps count",
  "You are worthy of love",
  "It's okay to not be okay",
  "You're doing your best",
  "Tomorrow is a new day",
  "You matter",
  "Let go and breathe",
  "You are stronger than you think",
  "This moment will pass",
  "You are loved",
  "Be kind to your mind",
  "You're exactly where you need to be",
  "Healing takes time"
];

function startFireflyGame() {
  document.getElementById("game-picker").classList.add("hidden");
  document.getElementById("firefly-area").classList.remove("hidden");

  const canvas = document.getElementById("firefly-canvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;

  const POT_W = 60;
  const POT_H = 45;
  const POT_X = w / 2;
  const POT_Y = h - 15;

  fireflies = [];
  fireflyQuotes = [];
  fireflyCaught = 0;
  fireflyDrag = null;
  document.getElementById("firefly-count").textContent = "0 gathered";

  function spawnFirefly() {
    const side = Math.floor(Math.random() * 4);
    let x, y, vx, vy;
    const speed = 0.15 + Math.random() * 0.25;
    switch (side) {
      case 0: x = -10; y = Math.random() * (h - 80); vx = speed; vy = (Math.random() - 0.5) * speed * 0.6; break;
      case 1: x = w + 10; y = Math.random() * (h - 80); vx = -speed; vy = (Math.random() - 0.5) * speed * 0.6; break;
      case 2: x = Math.random() * w; y = -10; vx = (Math.random() - 0.5) * speed * 0.6; vy = speed; break;
      case 3: x = Math.random() * w; y = h + 10; vx = (Math.random() - 0.5) * speed * 0.6; vy = -speed; break;
    }
    fireflies.push({
      x, y, vx, vy,
      baseAlpha: 0.3 + Math.random() * 0.5,
      alpha: 0,
      alphaDir: 0.005 + Math.random() * 0.01,
      radius: 2 + Math.random() * 2,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.02,
      wobbleAmp: 0.2 + Math.random() * 0.4,
      hue: 50 + Math.random() * 30,
      dragging: false
    });
  }

  for (let i = 0; i < 8; i++) spawnFirefly();
  fireflySpawnTimer = setInterval(() => {
    if (fireflies.length < 25) spawnFirefly();
  }, 900);

  function drawPot() {
    const px = POT_X, py = POT_Y;
    ctx.save();
    ctx.fillStyle = "#5c4a3a";
    ctx.beginPath();
    ctx.moveTo(px - POT_W / 2, py - POT_H);
    ctx.quadraticCurveTo(px - POT_W / 2 - 6, py, px - POT_W / 2 + 5, py);
    ctx.lineTo(px + POT_W / 2 - 5, py);
    ctx.quadraticCurveTo(px + POT_W / 2 + 6, py, px + POT_W / 2, py - POT_H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#7a6652";
    ctx.beginPath();
    ctx.ellipse(px, py - POT_H, POT_W / 2 + 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4a3c2e";
    ctx.beginPath();
    ctx.ellipse(px, py - POT_H, POT_W / 2 - 2, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function renderFireflies() {
    ctx.clearRect(0, 0, w, h);
    drawPot();

    for (let i = fireflies.length - 1; i >= 0; i--) {
      const f = fireflies[i];

      if (!f.dragging) {
        f.wobblePhase += f.wobbleSpeed;
        f.x += f.vx + Math.sin(f.wobblePhase) * f.wobbleAmp;
        f.y += f.vy + Math.cos(f.wobblePhase * 0.7) * f.wobbleAmp * 0.5;
      }

      f.alpha += f.alphaDir;
      if (f.alpha > f.baseAlpha || f.alpha < 0.05) f.alphaDir *= -1;
      f.alpha = Math.max(0.05, Math.min(f.alpha, f.baseAlpha));

      if (!f.dragging && (f.x < -30 || f.x > w + 30 || f.y < -30 || f.y > h + 30)) {
        fireflies.splice(i, 1);
        continue;
      }

      const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * 6);
      glow.addColorStop(0, `hsla(${f.hue}, 100%, 85%, ${f.alpha})`);
      glow.addColorStop(0.4, `hsla(${f.hue}, 90%, 70%, ${f.alpha * 0.3})`);
      glow.addColorStop(1, `hsla(${f.hue}, 80%, 60%, 0)`);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * 6, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${f.hue}, 100%, 90%, ${f.alpha + 0.2})`;
      ctx.fill();
    }

    for (let i = fireflyQuotes.length - 1; i >= 0; i--) {
      const q = fireflyQuotes[i];
      q.y -= 0.3;
      q.alpha -= 0.003;
      if (q.alpha <= 0) { fireflyQuotes.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = q.alpha;
      ctx.fillStyle = "#e8dff5";
      ctx.font = "italic 14px 'Georgia', serif";
      ctx.textAlign = "center";
      ctx.fillText(q.text, q.x, q.y);
      ctx.restore();
    }

    fireflyAnimFrame = requestAnimationFrame(renderFireflies);
  }
  renderFireflies();

  function getCanvasPos(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  function findFireflyAt(mx, my) {
    for (let i = fireflies.length - 1; i >= 0; i--) {
      const f = fireflies[i];
      const dx = f.x - mx, dy = f.y - my;
      if (dx * dx + dy * dy < (f.radius * 10) * (f.radius * 10)) return f;
    }
    return null;
  }

  function isInPot(f) {
    const dx = f.x - POT_X;
    const dy = f.y - (POT_Y - POT_H / 2);
    return Math.abs(dx) < POT_W / 2 + 10 && dy > -POT_H / 2 && dy < POT_H / 2 + 10;
  }

  function catchFirefly(f) {
    fireflyCaught++;
    document.getElementById("firefly-count").textContent = fireflyCaught + " gathered";
    const idx = fireflies.indexOf(f);
    if (idx !== -1) fireflies.splice(idx, 1);
    fireflyQuotes.push({
      text: FIREFLY_QUOTES[Math.floor(Math.random() * FIREFLY_QUOTES.length)],
      x: POT_X + (Math.random() - 0.5) * 30,
      y: POT_Y - POT_H - 10,
      alpha: 1
    });
  }

  canvas.addEventListener("mousedown", (e) => {
    const p = getCanvasPos(e);
    const f = findFireflyAt(p.x, p.y);
    if (f) { f.dragging = true; fireflyDrag = f; }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!fireflyDrag) return;
    const p = getCanvasPos(e);
    fireflyDrag.x = p.x;
    fireflyDrag.y = p.y;
  });

  canvas.addEventListener("mouseup", () => {
    if (!fireflyDrag) return;
    if (isInPot(fireflyDrag)) catchFirefly(fireflyDrag);
    fireflyDrag.dragging = false;
    fireflyDrag = null;
  });

  canvas.addEventListener("mouseleave", () => {
    if (fireflyDrag) { fireflyDrag.dragging = false; fireflyDrag = null; }
  });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const p = getCanvasPos(e);
    const f = findFireflyAt(p.x, p.y);
    if (f) { f.dragging = true; fireflyDrag = f; }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!fireflyDrag) return;
    const p = getCanvasPos(e);
    fireflyDrag.x = p.x;
    fireflyDrag.y = p.y;
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    if (!fireflyDrag) return;
    if (isInPot(fireflyDrag)) catchFirefly(fireflyDrag);
    fireflyDrag.dragging = false;
    fireflyDrag = null;
  }, { passive: false });
}

function stopFireflyGame() {
  if (fireflyAnimFrame) { cancelAnimationFrame(fireflyAnimFrame); fireflyAnimFrame = null; }
  if (fireflySpawnTimer) { clearInterval(fireflySpawnTimer); fireflySpawnTimer = null; }
  fireflies = [];
  fireflyQuotes = [];
  fireflyDrag = null;
}

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

    if (data.matched) {
      currentBuddyMatchId = data.matchId;
      btn.classList.add("hidden");
      cancelBtn.classList.add("hidden");
      status.textContent = "You've been matched! Say hello below.";
      document.getElementById("buddy-chat").classList.remove("hidden");
      loadBuddyMessages(data.matchId);
      connectBuddyChat(data.matchId);
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

// --- Pen Pal System ---
let penpalCurrentView = "inbox";
let penpalCurrentThreadId = null;
let penpalPollInterval = null;

function initPenPal() {
  document.getElementById("penpal-section").classList.remove("hidden");
  if (!isLoggedIn()) {
    document.getElementById("penpal-alias-setup").classList.remove("hidden");
    document.getElementById("penpal-alias-setup").innerHTML = `
      <h2>Pen Pal</h2>
      <p class="subtitle">Send and receive anonymous messages from random people</p>
      <p style="color:#6b5f82;margin-bottom:1rem;">You need an account to use the pen pal feature.</p>
      <button class="primary-btn" onclick="window.location.href='/login.html'">Sign In</button>
    `;
    return;
  }
  showPenPalInbox();
}

async function checkPenPalAlias() {
  try {
    const res = await authFetch(`${API}/api/penpal/profile`);
    const data = await res.json();
    if (data.alias) {
      showPenPalInbox();
    } else {
      showPenPalAliasSetup();
    }
  } catch (err) {
    console.error("Failed to check alias:", err);
  }
}

function showPenPalAliasSetup() {
  document.getElementById("penpal-alias-setup").classList.remove("hidden");
  document.getElementById("penpal-inbox").classList.add("hidden");
  document.getElementById("penpal-thread").classList.add("hidden");
  document.getElementById("penpal-compose").classList.add("hidden");
  document.getElementById("penpal-alias-input").value = "";
  document.getElementById("penpal-alias-error").classList.add("hidden");
}

function showPenPalInbox() {
  document.getElementById("penpal-alias-setup").classList.add("hidden");
  document.getElementById("penpal-inbox").classList.remove("hidden");
  document.getElementById("penpal-thread").classList.add("hidden");
  document.getElementById("penpal-compose").classList.add("hidden");
  penpalCurrentView = "inbox";
  loadPenPalInbox();
  startPenPalPolling();
}

function showPenPalThread(threadId) {
  document.getElementById("penpal-alias-setup").classList.add("hidden");
  document.getElementById("penpal-inbox").classList.add("hidden");
  document.getElementById("penpal-thread").classList.remove("hidden");
  document.getElementById("penpal-compose").classList.add("hidden");
  penpalCurrentView = "thread";
  penpalCurrentThreadId = threadId;
  loadPenPalThread(threadId);
}

function showPenPalCompose() {
  document.getElementById("penpal-alias-setup").classList.add("hidden");
  document.getElementById("penpal-inbox").classList.add("hidden");
  document.getElementById("penpal-thread").classList.add("hidden");
  document.getElementById("penpal-compose").classList.remove("hidden");
  document.getElementById("penpal-compose-input").value = "";
  document.getElementById("penpal-compose-error").classList.add("hidden");
  penpalCurrentView = "compose";
}

document.getElementById("penpal-alias-btn").addEventListener("click", async () => {
  const input = document.getElementById("penpal-alias-input");
  const error = document.getElementById("penpal-alias-error");
  const alias = input.value.trim();
  if (!alias || alias.length < 2) {
    error.textContent = "Alias must be at least 2 characters";
    error.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("penpal-alias-btn");
  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    const res = await authFetch(`${API}/api/penpal/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias }),
    });

    if (res.ok) {
      showPenPalInbox();
    } else {
      const data = await res.json();
      error.textContent = data.error || "Could not create alias";
      error.classList.remove("hidden");
    }
  } catch (err) {
    error.textContent = "Could not connect to server";
    error.classList.remove("hidden");
  }

  btn.disabled = false;
  btn.textContent = "Create Alias";
});

async function loadPenPalInbox() {
  try {
    const res = await authFetch(`${API}/api/penpal/inbox`);
    const data = await res.json();
    renderPenPalInbox(data.threads);
  } catch (err) {
    console.error("Failed to load inbox:", err);
  }
}

function renderPenPalInbox(threads) {
  const container = document.getElementById("penpal-inbox-list");
  if (!threads || threads.length === 0) {
    container.innerHTML = '<p style="color:#6b5f82;text-align:center;padding:1.5rem;">No conversations yet. Send a message to a random person!</p>';
    return;
  }

  container.innerHTML = threads.map((t) => {
    const preview = t.lastMessage ? escapeHtml(t.lastMessage) : "No messages yet";
    const time = t.lastMessageAt ? timeAgo(t.lastMessageAt) : "";
    const unread = t.unreadCount > 0 ? `<span class="penpal-unread-badge">${t.unreadCount}</span>` : "";
    const closedClass = t.isClosed ? " penpal-thread-closed-item" : "";
    const myMsgCount = Math.min(t.messageCount, 4);
    return `
      <div class="penpal-inbox-item${closedClass}" data-thread-id="${t.threadId}">
        <div class="penpal-inbox-header">
          <span class="penpal-inbox-peer">with ${escapeHtml(t.peerAlias)}</span>
          ${unread}
        </div>
        <p class="penpal-inbox-preview">${preview}</p>
        <div class="penpal-inbox-footer">
          <span class="penpal-inbox-time">${time}</span>
          <span class="penpal-inbox-count">${myMsgCount}/4 messages</span>
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".penpal-inbox-item").forEach((item) => {
    item.addEventListener("click", () => {
      showPenPalThread(parseInt(item.dataset.threadId));
    });
  });
}

async function loadPenPalThread(threadId) {
  try {
    const res = await authFetch(`${API}/api/penpal/thread/${threadId}`);
    const data = await res.json();
    renderPenPalThread(data);
  } catch (err) {
    console.error("Failed to load thread:", err);
  }
}

function renderPenPalThread(data) {
  document.getElementById("penpal-thread-peer").textContent = `with ${data.peerAlias}`;
  const container = document.getElementById("penpal-thread-messages");

  if (!data.messages || data.messages.length === 0) {
    container.innerHTML = '<p style="color:#6b5f82;text-align:center;padding:1.5rem;">No messages yet.</p>';
    return;
  }

  container.innerHTML = data.messages.map((m) => {
    const isMe = m.senderAlias === data.peerAlias ? false : true;
    return `
      <div class="penpal-message penpal-message-${isMe ? 'me' : 'them'}">
        <p>${escapeHtml(m.content)}</p>
        <div class="message-time">${escapeHtml(m.senderAlias)} &middot; ${timeAgo(m.createdAt)}</div>
      </div>
    `;
  }).join("");

  container.scrollTop = container.scrollHeight;

  if (data.isClosed) {
    document.getElementById("penpal-thread-form").classList.add("hidden");
    document.getElementById("penpal-thread-closed").classList.remove("hidden");
  } else {
    document.getElementById("penpal-thread-form").classList.remove("hidden");
    document.getElementById("penpal-thread-closed").classList.add("hidden");
  }
}

document.getElementById("penpal-back-btn").addEventListener("click", () => {
  showPenPalInbox();
});

document.getElementById("penpal-new-msg-btn").addEventListener("click", () => {
  showPenPalCompose();
});

document.getElementById("penpal-compose-back-btn").addEventListener("click", () => {
  showPenPalInbox();
});

document.getElementById("penpal-send-btn").addEventListener("click", async () => {
  const input = document.getElementById("penpal-compose-input");
  const error = document.getElementById("penpal-compose-error");
  const content = input.value.trim();
  if (!content) {
    error.textContent = "Message cannot be empty";
    error.classList.remove("hidden");
    return;
  }

  const btn = document.getElementById("penpal-send-btn");
  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    const res = await authFetch(`${API}/api/penpal/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (res.ok) {
      const data = await res.json();
      showPenPalThread(data.threadId);
    } else {
      const data = await res.json();
      error.textContent = data.error || "Could not send message";
      error.classList.remove("hidden");
    }
  } catch (err) {
    error.textContent = "Could not connect to server";
    error.classList.remove("hidden");
  }

  btn.disabled = false;
  btn.textContent = "Send to Random Person";
});

document.getElementById("penpal-reply-btn").addEventListener("click", async () => {
  if (!penpalCurrentThreadId) return;

  const input = document.getElementById("penpal-thread-input");
  const content = input.value.trim();
  if (!content) return;

  const btn = document.getElementById("penpal-reply-btn");
  btn.disabled = true;
  btn.textContent = "Sending...";

  try {
    const res = await authFetch(`${API}/api/penpal/reply/${penpalCurrentThreadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (res.ok) {
      input.value = "";
      loadPenPalThread(penpalCurrentThreadId);
    } else {
      const data = await res.json();
      alert(data.error || "Could not send reply");
    }
  } catch (err) {
    alert("Could not connect to server");
  }

  btn.disabled = false;
  btn.textContent = "Send Reply";
});

function startPenPalPolling() {
  stopPenPalPolling();
  penpalPollInterval = setInterval(() => {
    if (penpalCurrentView === "inbox") loadPenPalInbox();
    else if (penpalCurrentView === "thread" && penpalCurrentThreadId) loadPenPalThread(penpalCurrentThreadId);
  }, 5000);
}

function stopPenPalPolling() {
  if (penpalPollInterval) {
    clearInterval(penpalPollInterval);
    penpalPollInterval = null;
  }
}

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
initPenPal();
initHelpButton();
loadRegionalCrisis();
