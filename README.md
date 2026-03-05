# 🎬 Movie Bot

A Telegram bot system built with **NestJS**, **Telegraf**, and **MongoDB** that lets users search for and receive movie & anime files directly in Telegram — no link shorteners, no ads.

The system is made up of **three bots** that work together, all running in a single NestJS application deployed on **Vercel**.

---

## 🤖 Bots Overview

| Bot | Purpose |
|-----|---------|
| **Movie Bot** | Users search by name and receive movie files |
| **Anime Bot** | Users search by name and receive anime episode files |
| **Upload Bot** | Admin-only bot for uploading movies and anime to the database |

---

## ✨ Features

- 🔍 **Smart search** — regex + fuzzy matching (fuzzball) finds the right movie even with typos
- 📄 **Paginated file list** — browse all available movies or anime with inline keyboard navigation
- 📥 **Send All / Single file** — users can get one episode or the entire season at once
- 🖼️ **Poster support** — movie poster is sent before the file selection menu
- 🔒 **Channel subscription gate** — users must join required channels before accessing files
- ⏳ **Auto-delete messages** — files and bot messages are deleted after 5 minutes for copyright compliance
- 📣 **Broadcast** — owner can send a message to all registered users at once
- 🎭 **Reaction on /start** — bot reacts with a random emoji to every /start message
- 🚀 **Deployed on Vercel** — webhook-based, no always-on server needed

---

## 🗂️ Project Structure

```
src/
├── main.ts                          ← NestJS bootstrap + Express setup
├── app.module.ts                    ← Root module (DB, schedule, all feature modules)
├── app.controller.ts / service.ts  ← Root health-check endpoint
│
├── movie-bot/                       ← 🎬 Movie Bot
│   ├── movie-bot.module.ts
│   ├── movie-bot.service.ts         ← All movie bot logic
│   ├── movie.schema.ts              ← Movie MongoDB schema
│   ├── user.schema.ts               ← User tracking
│   ├── temp.schema.ts               ← Temp messages (for auto-delete)
│   ├── requestMovies.schema.ts      ← User movie requests
│   └── settings.schema.ts           ← Bot URL settings (boturl, animeboturl)
│
├── anime/                           ← 🎌 Anime Bot
│   ├── anime.module.ts
│   ├── anime.service.ts             ← All anime bot logic
│   ├── anime.schema.ts              ← Anime MongoDB schema
│   └── anime.user.schema.ts        ← Anime bot user tracking
│
├── upload-bot/                      ← 📤 Upload Bot (admin only)
│   ├── upload-bot.module.ts
│   └── upload-bot.service.ts        ← Multi-step upload session logic
│
└── common/                          ← 🧹 Shared utilities
    ├── common.module.ts
    ├── common.service.ts            ← Expired message cleanup job
    └── common.controller.ts         ← GET /common → triggers cleanup (called by Vercel cron)
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
# MongoDB
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/moviebot

# Bot tokens (get from @BotFather)
MOVIE_BOT_TOKEN=your_movie_bot_token
ANIME_BOT_TOKEN=your_anime_bot_token
UPLOAD_BOT_TOKEN=your_upload_bot_token
```

---

## 🚀 Setup & Running

### Local development

```bash
# Install dependencies
npm install

# Start in watch mode
npm run start:dev
```

### Production build

```bash
npm run build
npm run start:prod
```

### Set webhooks (after deploying to Vercel)

```bash
# Movie Bot
curl -F "url=https://<your-vercel-url>/movie-bot" \
  https://api.telegram.org/bot<MOVIE_BOT_TOKEN>/setWebhook

# Anime Bot
curl -F "url=https://<your-vercel-url>/anime-bot" \
  https://api.telegram.org/bot<ANIME_BOT_TOKEN>/setWebhook

# Upload Bot
curl -F "url=https://<your-vercel-url>/upload-bot" \
  https://api.telegram.org/bot<UPLOAD_BOT_TOKEN>/setWebhook
```

---

## 🗄️ Database Schemas

### Movie / Anime
```
name       String   — movie or anime title
caption    String   — multi-line info (Title, Year, Audio, Quality)
year       Number   — release year
poster     Object   — { chatId, messageId } pointer to poster image in channel
files      Array    — list of file entries:
  └─ fileName  String   — display name
  └─ size      String   — e.g. "496.0 MB"
  └─ chatId    String   — source Telegram channel ID
  └─ messageId Number   — message ID in that channel
  └─ fileId    String   — Telegram file_id
```

### TempMessage
```
chatId     Number   — chat to delete from
messageId  Number   — message to delete
userId     Number   — (optional) who triggered it
expireAt   Date     — when to delete
```

### RequestMovies
```
name       String   — what the user searched for (not found)
userId     String
userName   String
```

### Settings
```
boturl       String  — username of the Movie Bot (for deep-links)
animeboturl  String  — username of the Anime Bot (for deep-links)
```

---

## 📤 Upload Bot — How to Upload

The Upload Bot is a **step-by-step session bot** for admins only. All commands require the sender's Telegram ID to be in the `ownerId` list inside `upload-bot.service.ts`.

### Add a new Movie
```
/movie
→ Send movie name
→ Send caption (multiline, e.g. "🎬 Title : ...\n📅 Year : ...\n🔈 Audio : ...\n🎥 Quality : ...")
→ Send poster image
→ "yes/no" to broadcast to main channel
→ Send how many files (e.g. 2)
→ Send the files one by one
✅ Saved to DB
```

### Add episodes to an existing Movie
```
/mepisode
→ Send existing movie name (must match exactly)
→ Send episode number/label (e.g. "S02E01-E05")
→ "yes/no" to broadcast
→ Send how many files
→ Send the files one by one
✅ Episodes appended to existing movie
```

### Add a new Anime
```
/anime  (same flow as /movie)
```

### Add episodes to an existing Anime
```
/aepisode  (same flow as /mepisode)
```

### Broadcast main channel post

When you answer **yes** to the broadcast prompt, the Upload Bot automatically posts to the main channel with a deep-link for users to click and get the file directly.

---

## 🧹 Message Auto-Delete

Files and bot messages are stored in the `TempMessage` collection with an `expireAt` timestamp (5 minutes for files, 2 minutes for bot UI messages).

A cleanup endpoint is exposed at `GET /common`. On Vercel, call it with a cron job or manually:

```
https://<your-vercel-url>/common
```

This deletes all expired messages from Telegram and removes them from the DB.

---

## 🎬 Movie Bot — User Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome screen |
| `/list` | Browse all available movies (paginated) |
| `/help` | Usage instructions |

**Just type a movie name** to search. The bot uses regex + fuzzy matching to find the best result.

### Admin-only commands (owner ID required)

| Command | Description |
|---------|-------------|
| `/broadcast <message>` | Send a message to all users |
| `/rm` | List all pending movie requests |
| `/drm <name>` | Delete a movie request |
| `/sm <name>` | Search for a movie in DB (debug) |
| `/dm <name>` | Delete a movie from DB |

---

## 🎌 Anime Bot — User Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome screen |
| `/list` | Browse all available anime (paginated) |
| `/help` | Usage instructions |
| `/broadcast <message>` | (Admin) Send broadcast |

---

## 🔒 Channel Subscription Gate

Before any user can receive files, the bot checks that they have joined all required channels. If they haven't, a prompt is shown with Join buttons and a "Try Again" button.

Channels are configured as a constant array at the top of each bot's service file:

```ts
// movie-bot.service.ts  &  anime.service.ts
const REQUIRED_CHANNELS = [
  { id: '-100xxxxxxxxx', text: '📢 Channel 1', url: 'https://t.me/...' },
  // add/remove channels here
];
```

The bot must be an **admin or member** of each channel to check membership status.

---

## 🛠️ Tech Stack

| Technology | Usage |
|------------|-------|
| [NestJS](https://nestjs.com) | Server framework |
| [Telegraf](https://telegraf.js.org) | Telegram Bot API client |
| [Mongoose](https://mongoosejs.com) | MongoDB ODM |
| [MongoDB Atlas](https://www.mongodb.com/atlas) | Database |
| [fuzzball](https://github.com/nol13/fuzzball.js) | Fuzzy string matching |
| [Vercel](https://vercel.com) | Deployment (serverless) |
| [@nestjs/schedule](https://docs.nestjs.com/techniques/task-scheduling) | Cron / scheduled tasks |

---

## 📝 Notes

- Files are **never stored** in the bot — they live in private Telegram channels and are forwarded using `copyMessage` (no "forwarded" tag shown to users).
- The Upload Bot renames files automatically, replacing `@OriginalChannelName` prefixes with `@LordFourthMovieTamil` or `@LordFourthAnimeTamil`.
- Movie/anime deep-links encode the title in **base64** and pass it as the `/start` payload so users clicking a channel post go straight to the file list.
- The `Settings` collection stores the bot usernames used in deep-links. On first run, defaults are created automatically.
