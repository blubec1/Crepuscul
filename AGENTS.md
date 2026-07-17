# AGENTS.md

## Project: Crepuscul — Mental Wellbeing App for Insomniacs

A web app for people experiencing insomnia, low mood, or depression who need a safe space when they can't sleep.

## Tech Stack (fixed — do not change without asking)

- **Frontend:** Vanilla JS (ES6+), HTML5, CSS3 — in `public/`
- **Backend:** ASP.NET Core 10, C# — in `Backend/`
- **Real-time:** SignalR for live chat/support wall
- **Database:** SQLite via EF Core (file: `Backend/crepuscul.db`)
- **Auth:** JWT (ASP.NET Identity + `UserManager<User>`)

## Repo Structure

```
/
├── Backend/                     # ASP.NET Core API
│   ├── Crepuscul.Api.csproj    # ⚠️ Project file is "Crepuscul.Api", NOT "Backend"
│   ├── Program.cs              # App entrypoint — middleware, DI, routing
│   ├── Controllers/
│   │   ├── AuthController.cs       # POST /api/auth/register, /api/auth/login
│   │   ├── CheckinsController.cs   # GET/POST /api/checkins
│   │   ├── ExercisesController.cs  # GET /api/exercises/{mood}
│   │   └── SupportController.cs    # GET/POST /api/support/messages
│   ├── Models/                  # EF Core entities (User, CheckIn, Exercise, Message)
│   ├── Data/AppDbContext.cs     # DbContext + seed data for exercises
│   └── Hubs/SupportHub.cs      # SignalR hub at /hubs/support
├── public/                      # Static frontend (served by .NET)
│   ├── index.html               # Main app page
│   ├── login.html / register.html
│   ├── app.js                   # All frontend logic
│   └── styles.css
├── package.json                 # Node (better-sqlite3, express) — legacy, not used by backend
└── .gitignore
```

## How to Run

### Backend (primary — this is the active server)
```powershell
cd Backend
dotnet run
```
- Serves on `http://localhost:5042` (configured in `Properties/launchSettings.json`)
- Serves the frontend from `../public/` via static file middleware
- Health check: `GET /api/health`
- Root `/` redirects to `/login.html`

### Frontend
No separate build step. Plain HTML/JS/CSS served by the .NET backend. Just open `http://localhost:5042`.

### Node (legacy — NOT the active server)
`package.json` references a `server.js` that no longer exists. Ignore it.

## Key Architecture Notes

### Auth flow
- Uses ASP.NET `IdentityCore<User>` + `UserManager<User>` (not raw password hashing)
- JWT tokens stored in `localStorage` under key `crepuscul_token`
- Frontend attaches token via `Authorization: Bearer <token>` header
- `User` model extends `IdentityUser` — inherits username/password hashing from Identity

### Guest vs Authenticated
- Guests can use check-in and support wall without login
- `authFetch()` in `app.js` attaches the token only if present — endpoints don't enforce auth for most routes
- SignalR connects with `accessTokenFactory` but falls back gracefully for anonymous users

### SignalR
- Hub: `/hubs/support` — broadcasts messages to all connected clients
- JWT token passed via query string `?access_token=` for WebSocket auth (configured in `Program.cs`)
- Frontend loads SignalR from CDN: `https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.7/signalr.min.js`

### Database
- SQLite at `Backend/crepuscul.db` — auto-created on startup via `EnsureCreated()`
- Seed data: 11 exercises (breathing, grounding, visualization, etc.) seeded in `AppDbContext.OnModelCreating()`
- Exercises tagged by `MoodType`: anxiety, insomnia, loneliness, low, any
- Mood-to-type mapping: 1,2→anxiety | 3→low | 4→loneliness | 5→insomnia

### CORS
- Configured for `localhost:3000` and `localhost:5173` only — not `localhost:5042`
- The backend serves the frontend directly, so CORS is only needed for separate dev servers

### Crisis/SOS Feature
- Region detected via `https://ipapi.co/json/` (IP geolocation)
- Crisis data hardcoded in `app.js` (CRISIS_DATA object) — 12 countries + international fallback
- Floating help button (`#help-fab`) with slide-out panel — uses `position: fixed`

## C# Namespace Convention

All backend code uses `Crepuscul.Api.*`:
- `Crepuscul.Api.Models`
- `Crepuscul.Api.Controllers`
- `Crepuscul.Api.Data`
- `Crepuscul.Api.Hubs`

## Existing API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/register` | No | Register user |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/checkins` | No | Last 50 check-ins |
| POST | `/api/checkins` | No | Submit check-in (mood 1-5 + optional note) |
| GET | `/api/exercises/{mood}` | No | Random exercises for mood |
| GET | `/api/support/messages` | No | Last 50 support messages |
| POST | `/api/support/messages` | No | Send support message |
| WS | `/hubs/support` | Optional | SignalR real-time support wall |

## Known Gotchas

- **`package.json` is misleading** — it references `server.js` which doesn't exist. The app runs via `dotnet run`, not Node.
- **No `global.json`** — .NET SDK version is not pinned. Currently targeting `net10.0`.
- **JWT secret** in `appsettings.json` is a dev placeholder — never use in production.
- **Database resets** — `EnsureCreated()` won't apply schema changes to existing DBs. Delete `crepuscul.db` to reset.
- **CORS origins** — only `localhost:3000` and `localhost:5173`. Add new ports explicitly in `Program.cs`.

## Core Application Features (planned/in-progress)

### 1. Check-In System
- Flexible questionnaire: questions are either **1-5 scale** or **Yes/No**
- Recorded on every user login or guest entry
- No account needed — uses session IDs for guests
- Drives downstream features: game recommendations, buddy matchmaking

### 2. Dashboard / Games & Features
- Navigation hub with buttons that redirect to game/feature modules
- Features are recommended or hidden based on latest check-in scores
- Scope: navigation UI only — do not write game logic unless instructed

### 3. Buddy System (Matchmaking)
- Matches users with **similar** check-in answers (not complementary)
- Compares check-in answer differences to find best match
- Private 1-on-1 SignalR chat between matched buddies (separate from public support wall)
- Does **not require authorization** — works for guests via session IDs
- Anonymous by design

### 4. Persistent SOS Feature
- Crisis intervention/helpline button pinned to corner on **every page**
- Must use `position: fixed` in CSS — stays visible on scroll
- Shows crisis hotlines based on user's region
- Data served dynamically from backend (updatable without code changes)
