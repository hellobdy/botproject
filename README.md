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

## 📦 Quick 1-Click Setup (Recommended)

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/hellobdy/botproject.git
   cd botproject
   ```

2. **Double-click `START_BOT.bat`**:
   - Automatically installs npm dependencies if missing.
   - Automatically installs Playwright Chromium browser.
   - Automatically configures `.env` with default settings.
   - Starts both the **Telegram Bot** and **Admin Dashboard** (`http://localhost:3000/login`)!

---

## 🛠️ Manual Installation (Optional)

If running manually via terminal:

```bash
git clone https://github.com/hellobdy/botproject.git
cd botproject
npm install
npx playwright install chromium
node bot.js
```
