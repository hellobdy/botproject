# DL Service Automation Bot & Admin Portal

A complete automated solution featuring a Telegram Bot, Playwright browser automation, Tampermonkey scripts, and an Admin Web Dashboard.

---

## 🚀 Features

- **Telegram Bot Automation**: Handles automated form interactions and processes requests via Telegram.
- **Admin Dashboard**: Express-based web interface to manage submissions, view logs, and configure tasks.
- **Playwright Automation**: Fast, reliable browser interactions with custom profiles.
- **Tampermonkey Scripts**: Helper scripts for form autofill and portal interactions.

---

## 🛠️ System Requirements

1. **Node.js** (v18 or higher recommended)
2. **Git**
3. **Google Chrome** or Chromium

---

## 📦 Local Installation & Setup

Follow these steps to run this project on any new PC or laptop:

### 1. Clone the Repository
```bash
git clone https://github.com/hellobdy/botproject.git
cd botproject
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Install Playwright Browsers
```bash
npx playwright install chromium
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env` (or create a `.env` file) and add your keys:
```env
BOT_TOKEN=your_telegram_bot_token_here
GEMINI_API_KEY=your_gemini_api_key_here
ADMIN_PORT=3000
ADMIN_USER=admin
ADMIN_PASS=admin123
```

### 5. Run the Project
Start the main bot process:
```bash
node bot.js
```

Or start the admin server independently:
```bash
node adminServer.js
```
Then visit `http://localhost:3000/login` to access the admin portal.
