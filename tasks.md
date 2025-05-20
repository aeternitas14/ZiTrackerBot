Using that architecture, write a granular step-by-step plan to build the MVP.
Each task should:
- Be incredibly small + testable
- Have a clear start + end
- Focus on one concern

I'll be passing this off to an engineering LLM that will be told to complete one task at a time, allowing me to test in between.

---

# MVP Task Plan – Instagram Story Tracker Telegram Bot

## ⚙️ Setup

### 1. Initialize mono repo structure
- Create `apps/`, `shared/`, `supabase/`, `.env`
- Add README with architecture link

### 2. Initialize Git repo + Node.js
- Run `npm init` in each app folder (`bot`, `scraper`, `frontend`)
- Add basic `.gitignore` files

---

## 🧠 Supabase Setup

### 3. Create Supabase project
- Name it
- Enable email auth (or magic link)

### 4. Create DB schema
- Create `users`, `tracked_accounts`, `story_logs`
- Enable Row Level Security (RLS)

### 5. Test Supabase connection
- Connect with PostgREST or Supabase client lib from Node.js
- Verify CRUD operations for each table

---

## 🤖 Telegram Bot MVP

### 6. Set up basic bot with polling
- Use `node-telegram-bot-api`
- Start polling loop
- Reply to `/start` with a welcome message

### 7. Parse Telegram user ID
- Extract from chat
- Log to console

### 8. Store user in Supabase
- On `/start`, insert user if not in `users`

### 9. Add `/track <username>` command
- Parse IG username
- Add entry to `tracked_accounts`
- Return confirmation message

### 10. Add `/untrack <username>` command
- Remove user's tracked entry
- Confirm removal

### 11. Add `/list` command
- Return all tracked usernames for user

---

## 🔍 Scraper MVP

### 12. Set up Playwright script
- Load Instagram login page
- Log in using env credentials
- Navigate to a target user

### 13. Detect story ring (new story)
- Identify HTML element for active story ring
- Implemented using Instagram's internal API for reliability (fetches user ID, then story feed)

### 14. Download story media (video only)
- Save `.mp4` locally
- Log filename

### 15. Upload to Supabase Storage
- Use Supabase SDK
- Get public URL

### 16. Add story log entry
- Log IG user, file, timestamp to `story_logs`

### 17. Notify Telegram user
- Call `sendMessage` with video link

---

## 🖥️ Next.js Dashboard MVP

### 18. Scaffold Next.js project
- `npx create-next-app@latest`
- Add Supabase client

### 19. Set up Supabase auth
- Sign in with magic link or Telegram

### 20. Display user's tracked accounts
- Read from `tracked_accounts`

### 21. Add track/untrack form
- POST to Supabase

### 22. Show story history
- Read from `story_logs`

---

## 🧪 QA & Iteration

### 23. Add logs to bot and scraper
- Log all incoming commands and results

### 24. Test story detection on multiple IG users
- Check reliability of Playwright

### 25. Simulate multiple Telegram users
- Ensure each one only sees their data

### 26. Trigger alerts for test stories
- Send dummy `.mp4` as test run

### 27. Secure all services
- Protect `.env`
- Validate Telegram user IDs on each request

### 28. Deploy MVP on Replit / Railway
- Run bot and scraper as services
- Host frontend (Vercel or Netlify)

---

Ready to assign one task at a time.
