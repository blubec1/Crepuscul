# API Contract — Frontend ↔ Backend

**Base URL:** `http://localhost:5000` (or whatever port the backend runs on)

---

## Authentication

All protected endpoints require this header:
```
Authorization: Bearer <token>
```

---

## Auth Endpoints

### POST `/api/auth/register`

**Request:**
```json
{
  "username": "alice",
  "password": "mypassword123"
}
```

**Response (200):**
```json
{
  "userId": 1,
  "username": "alice",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:**
- 400 — missing fields, password < 6 chars
- 409 — username already taken

---

### POST `/api/auth/login`

**Request:**
```json
{
  "username": "alice",
  "password": "mypassword123"
}
```

**Response (200):**
```json
{
  "userId": 1,
  "username": "alice",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:**
- 401 — invalid username or password

---

## Games Endpoints

### GET `/api/games/leaderboard`

**Response (200):** (no auth required)
```json
[
  {
    "userId": 1,
    "username": "alice",
    "totalPoints": 2500,
    "gamesPlayed": 12
  },
  {
    "userId": 2,
    "username": "bob",
    "totalPoints": 1800,
    "gamesPlayed": 8
  }
]
```

---

### GET `/api/games/leaderboard/{gameName}`

Same format, but filtered to one game (e.g. `/api/games/leaderboard/memory`).

---

### POST `/api/games/scores` (auth required)

**Request:**
```json
{
  "gameName": "memory",
  "points": 500
}
```

**Response (200):**
```json
{
  "id": 42,
  "gameName": "memory",
  "points": 500,
  "createdAt": "2026-07-15T14:30:00Z"
}
```

---

### GET `/api/games/my-scores` (auth required)

**Response (200):**
```json
[
  {
    "id": 42,
    "gameName": "memory",
    "points": 500,
    "createdAt": "2026-07-15T14:30:00Z"
  }
]
```

---

## Breathing Endpoints

All breathing endpoints require auth.

### POST `/api/breathing/log`

**Request:**
```json
{
  "durationSeconds": 180
}
```

**Response (200):**
```json
{
  "id": 1,
  "durationSeconds": 180,
  "completedAt": "2026-07-15T14:30:00Z"
}
```

---

### GET `/api/breathing/sessions`

**Response (200):**
```json
[
  {
    "id": 1,
    "durationSeconds": 180,
    "completedAt": "2026-07-15T14:30:00Z"
  }
]
```

---

### GET `/api/breathing/stats`

**Response (200):**
```json
{
  "totalSessions": 15,
  "totalMinutes": 45,
  "currentStreak": 3,
  "longestStreak": 7
}
```

---

## Live Chat — SignalR WebSocket

**Connection URL:** `http://localhost:5000/hubs/chat`

### JavaScript Setup

```javascript
// Install: npm install @microsoft/signalr

import * as signalR from "@microsoft/signalr";

const connection = new signalR.HubConnectionBuilder()
    .withUrl("http://localhost:5000/hubs/chat")
    .build();

// Start connection
await connection.start();

// Send a message
await connection.invoke("SendMessage", "alice", "Hello everyone!");

// Listen for incoming messages
connection.on("ReceiveMessage", (username, text, sentAt) => {
    console.log(`${username}: ${text}`);
});

// Get recent messages on connect
await connection.invoke("GetRecentMessages", 50);

// Listen for recent messages response
connection.on("RecentMessages", (messages) => {
    messages.forEach(m => console.log(`${m.username}: ${m.text}`));
});

// Listen for system messages
connection.on("SystemMessage", (message) => {
    console.log(`System: ${message}`);
});
```

### SignalR Methods (frontend calls these)

| Method | Parameters | Description |
|--------|-----------|-------------|
| `SendMessage` | `(username, text)` | Send a chat message |
| `GetRecentMessages` | `(count)` | Request recent messages (default 50) |

### SignalR Events (frontend listens to these)

| Event | Data | Description |
|-------|------|-------------|
| `ReceiveMessage` | `(username, text, sentAt)` | New message from anyone |
| `RecentMessages` | `[{username, text, sentAt}]` | Batch of recent messages |
| `SystemMessage` | `(text)` | Server status messages |

---

## Frontend Storage

After login/register, store the token:
```javascript
localStorage.setItem("token", response.token);
localStorage.setItem("userId", response.userId);
localStorage.setItem("username", response.username);
```

Use it on every protected request:
```javascript
const response = await fetch("http://localhost:5000/api/games/scores", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
    },
    body: JSON.stringify({ gameName: "memory", points: 500 })
});
```
