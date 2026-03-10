# 🐠 Aquatic Claw
### Your AI Agents, But They're Fish

Monitor your Claude AI agents as swimming fish in a real-time aquarium dashboard.

---

## 🚀 Quick Start (Windows)

### 1. Install Node.js
Download & install from: https://nodejs.org (version 18+)

### 2. Get Your Anthropic API Key
Go to: https://console.anthropic.com/settings/keys

### 3. Install Aquatic Claw

**Option A — PowerShell (recommended):**
```powershell
# Right-click PowerShell > "Run as Administrator", then:
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\scripts\install.ps1
```

**Option B — Manual:**
```bash
# Clone / download this folder, then:
cd aquaticclaw
npm install
copy .env.example .env
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
│   ├── server.js          # Express + WebSocket server
│   └── agentManager.js    # Claude API + agent lifecycle
├── frontend/
│   ├── dashboard.html     # Real-time dashboard
│   └── landing.html       # Landing page
├── workspace/             # Agent file output goes here
├── scripts/
│   └── install.ps1        # Windows installer
├── .env.example           # Environment template
├── package.json
└── README.md
```

---

## ⚙️ Configuration (.env)

```env
ANTHROPIC_API_KEY=sk-ant-...    # Required
PORT=3333                        # Dashboard port
WORKSPACE_DIR=./workspace        # Where agents save files
MAX_AGENTS=10                    # Max concurrent agents
MAX_TOKENS_PER_AGENT=8192        # Token limit per response
```

---

## 🐠 Fish Status Guide

| Fish Behavior | Meaning |
|---------------|---------|
| Swimming fast | Agent actively working |
| Swimming slow | Agent idle/waiting |
| Shaking/glowing red | Agent hit an error |
| Stopped, dim | Task complete |

---

## 📡 API Endpoints

```
GET  /api/agents              List all agents
POST /api/agents              Create new agent
GET  /api/agents/:id          Get agent details
POST /api/agents/:id/start    Start agent with task
POST /api/agents/:id/stop     Stop running agent
DELETE /api/agents/:id        Remove agent
POST /api/agents/:id/chat     Send message to agent
GET  /api/logs                Get recent logs
GET  /api/workspace           List workspace files
GET  /api/stats               Server statistics
```

---

## 🔒 Privacy & Security

- ✅ 100% local — runs on your machine
- ✅ No telemetry, no tracking
- ✅ API key stored only in your `.env` file
- ✅ Agent code execution is sandboxed
- ✅ File access limited to `workspace/` directory

---

## 📝 Example Tasks for Agents

- `"Research the top 5 AI coding tools in 2025 and write a comparison report"`
- `"Search for recent news about AI agents and summarize the key trends"`
- `"Write a Python script that calculates compound interest and save it to workspace"`
- `"Look up information about Indonesia's tech startup scene and create a summary"`

---

Made with 🐠 — Open Source · MIT License
