# Instagram Story Tracker Telegram Bot – Full System Architecture

This architecture is for a Telegram bot that:
- Allows users to subscribe and track Instagram accounts.
- Sends alerts when tracked users post a new story.
- Lets users download those stories as `.mp4` files.
- Uses Next.js for frontend, Supabase for database + authentication.

---

## 🧭 Overview

**Main components:**
1. `Telegram Bot Service` – backend that interacts with Telegram, checks Instagram, sends alerts, provides download links.
2. `Story Monitor & Scraper` – service that checks for new stories and downloads them.
3. `Supabase` – handles user auth, data storage (users, tracked accounts, logs).
4. `Next.js Frontend` – handles account creation, dashboard to manage tracked users.
5. `File Storage` – Supabase Storage or external bucket (for storing story videos).
6. `Queue/Worker` (optional but scalable) – processes story checks and downloads.

---

## 📁 File + Folder Structure

```plaintext
root/
│
├── apps/
│   ├── bot/                   # Telegram bot service
│   │   ├── src/
│   │   │   ├── commands/      # /start, /track, /untrack, /download
│   │   │   ├── handlers/      # Message & callback handling logic
│   │   │   ├── services/      # Telegram API, Instagram scraper, Supabase client
│   │   │   ├── jobs/          # Cron job / loop story checker
│   │   │   ├── utils/         # Logging, error helpers, validation
│   │   │   └── index.ts       # Entry point for bot
│   │   └── package.json
│   │
│   ├── frontend/              # Next.js web dashboard
│   │   ├── components/
│   │   ├── pages/
│   │   ├── lib/               # Supabase client setup, utils
│   │   ├── styles/
│   │   ├── hooks/
│   │   └── next.config.js
│   │
│   └── scraper/               # Instagram story checking service
│       ├── playwright/        # Instagram login/session, scraping
│       ├── jobs/              # Monitor and download stories
│       ├── utils/
│       └── index.ts
│
├── shared/                    # Shared types, constants, interfaces
│   └── types.ts
│
├── supabase/                  # SQL schema and edge functions (optional)
│   └── schema.sql
│
└── .env                       # All service secrets and keys
```

---

## 🧠 What Each Part Does

### Telegram Bot (`apps/bot/`)
- Responds to user messages (`/track`, `/untrack`, `/download`).
- Sends alerts when a tracked user posts a story.
- Links to `.mp4` download hosted on Supabase or external file storage.
- Saves tracking data to Supabase.

### Story Scraper (`apps/scraper/`)
- `index.js` - Main entry point, Instagram login/API functions, and starts the monitoring job.
- `jobs/monitor.js` - Contains the main loop that runs periodically to check for new stories from all tracked accounts. It fetches tracked accounts, checks stories, and triggers downloads and notifications.
- `jobs/downloader.js` - Handles the actual downloading of story media (videos/images) and uploading them to file storage (e.g., Supabase Storage).
- `services/supabase.js` - A dedicated module for initializing the Supabase client and housing all Supabase-related functions for the scraper (e.g., fetching tracked accounts, logging stories).
- `services/telegram.js` - A module responsible for sending notifications to the Telegram bot, likely by making an HTTP request to an endpoint on the bot or directly using the Telegram Bot API if the scraper has its own bot token for this.
- Runs on a schedule (every few minutes).
- Logs into Instagram using Playwright (managed by `index.js` or a dedicated auth module).

### Supabase
- **Auth**: manages Telegram user auth and linking to their tracking data.
- **DB tables**:
  - `users`: Telegram user ID, auth data
  - `tracked_accounts`: IG usernames tracked by each user
  - `story_logs`: recent stories downloaded (filename, IG user, timestamp)

### Next.js Frontend
- Allows users to:
  - Sign in with Telegram (via Supabase magic link or Telegram login widget)
  - View and manage tracked IG accounts
  - See download history

### Storage
- Supabase Storage or S3 bucket stores `.mp4` story files.
- Story download links are shared via Telegram.

---

## 🧬 Where State Lives

| Component          | State                            | Storage Layer         |
|--------------------|----------------------------------|------------------------|
| Telegram Bot       | Incoming chats, subscriptions    | Supabase DB           |
| Story Scraper      | Last seen story state            | `alert_state_<chat>_<username>.json` or Supabase |
| Next.js Frontend   | Auth session, tracked user list  | Supabase + LocalStorage |
| File Downloads     | Story video files                | Supabase Storage or S3 |

---

## 🚀 Service Connections

```text
User → Telegram Bot
     → /track @username
       → Supabase: add tracked IG user
       → Frontend dashboard updates

Bot ← Scraper alert
     ← Finds new story
     ← Uploads to storage
     ← Sends message to Telegram user with story link

Frontend ↔ Supabase
          ↔ Fetch user, track data, file logs
```

---

## 🛠️ Development Notes
- Telegram bot uses polling or webhook
- Scraper must avoid Instagram rate limits (headless + stealth)
- Story detection uses Instagram's internal API (via Playwright's page.evaluate to leverage browser context for authenticated requests) instead of fragile UI element scraping.
- Supabase Row Level Security (RLS) should be enforced by user ID
- All `.env` values (Telegram token, Supabase URL/key, IG credentials) must be secured and injected
- Add logging and alerts for failures in scraping/downloading
