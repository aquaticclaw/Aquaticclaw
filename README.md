# 🐠 Aquatic Claw
### Your AI Agents, But They're Fish

Monitor your Claude AI agents as swimming fish in a real-time aquarium dashboard. Fast fish = hard work. Red fish = error. Slow fish = idle.

---

## 🚀 Quick Start

### 1. Install Node.js
Download & install from: https://nodejs.org (version 18+)

### 2. Get Your Anthropic API Key
Go to: https://console.anthropic.com/settings/keys

### 3. Clone & Install

```bash
git clone https://github.com/aquaticclaw/Aquaticclaw.git
cd Aquaticclaw
npm install
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
node backend/server.js
```

### 4. Open Dashboard
Go to: **http://localhost:3333**

---

## 🐟 How It Works

1. **Open dashboard** at localhost:3333
2. **Click + New Agent** — give it a name and a task
3. **Watch it swim** — the faster it swims, the harder it's working
4. **Hover any fish** — see real-time stats (tokens, API calls, progress)
5. **Click to chat** — DM your agent directly from the dashboard
6. **Check the feed** — live log of every tool call and thought

---

## 🛠 What Agents Can Do

| Tool | Description |
|------|-------------|
| `web_search` | Search the web via DuckDuckGo |
| `read_file` | Read files from the workspace folder |
| `write_file` | Save output files to workspace |
| `list_files` | See what's in the workspace |
| `execute_code` | Run JavaScript code safely |
| `report_progress` | Update progress bar on dashboard |

---

## 📁 Project Structure

```
aquaticclaw/
├── backend/
│   ├── server.js              # Express + WebSocket server
│   ├── agentManager.js        # Claude API + agent lifecycle
│   ├── openclawConnector.js   # Auto-discover external agents
│   └── telegramNotifier.js    # Telegram notifications
├── frontend/
│   ├── dashboard.html         # Real-time aquarium dashboard
│   ├── landing.html           # Landing page
│   ├── setup.html             # API key setup
│   └── index.html             # Redirect to landing
├── workspace/                 # Agent file output goes here
├── .env.example               # Environment template
├── package.json
└── README.md
```

---

## ⚙️ Configuration (.env)

```env
ANTHROPIC_API_KEY=sk-ant-...        # Your Anthropic API key
PORT=3333                            # Dashboard port (default: 3333)
WORKSPACE_DIR=./workspace            # Where agents save files
MAX_TOKENS_PER_AGENT=4096            # Token limit per agent response
TELEGRAM_BOT_TOKEN=your_bot_token    # Optional: Telegram notifications
TELEGRAM_CHAT_ID=your_chat_id        # Optional: Telegram chat ID
```

---

## 🐠 Fish Status Guide

| Fish Behavior | Meaning |
|---------------|---------|
| Swimming fast | Agent actively working |
| Swimming slow | Agent idle / waiting |
| Shaking / glowing red | Agent hit an error |
| Stopped, dim | Task complete |

---

## 📡 API Endpoints

```
GET    /api/agents              List all agents
POST   /api/agents              Create + auto-start new agent
GET    /api/agents/:id          Get agent details
POST   /api/agents/:id/start    Start agent with a task
POST   /api/agents/:id/stop     Stop a running agent
DELETE /api/agents/:id          Remove agent
POST   /api/agents/:id/chat     Send a message to an agent
GET    /api/logs                Get recent logs
GET    /api/workspace           List workspace files
GET    /api/stats               Server statistics
```

---

## 📝 Example Tasks

```
"Research the top 5 AI agent frameworks and write a comparison report"
"Search for recent AI news and summarize the top 3 stories"
"Write a JavaScript function that sorts an array of objects by date"
"Analyze the pros and cons of microservices vs monolithic architecture"
"Create a markdown file with a weekly productivity tracker template"
```

---

## 🔌 OpenClaw Support

Aquatic Claw auto-discovers external OpenClaw agents running on ports **8000–8020**. Any compatible agent that exposes a `/status` endpoint will automatically appear as a fish in your aquarium.

---

## 🔒 Privacy & Security

- ✅ 100% local — runs on your machine
- ✅ No telemetry, no tracking
- ✅ API key never stored on any server
- ✅ Agent code execution is sandboxed
- ✅ File access limited to `workspace/` directory

---

## 🌊 Links

- **Website:** https://aquaticclaw.xyz
- **Twitter:** https://x.com/Claw_Aquatic
- **Telegram:** https://t.me/aquaticclaw

---

Made with 🐠 — Open Source · MIT License
