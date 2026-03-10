// ============================================================
// Aquatic Claw — Backend Server
// Express + WebSocket for real-time agent monitoring
// ============================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const AgentManager = require('./agentManager');
const OpenClawConnector = require('./openclawConnector');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3333;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Simple session ID via header (X-Session-ID)
function getSessionId(req) {
  return req.headers['x-session-id'] || req.ip || 'anonymous';
}

// Ensure workspace exists
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || './workspace');
if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

// ============================================================
// WebSocket — broadcast to all clients
// ============================================================
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected. Total: ${clients.size}`);

  // Send current state immediately
  ws.send(JSON.stringify({
    type: 'INIT',
    agents: agentManager.getAllAgents(),
    logs: agentManager.getRecentLogs(50),
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });

  ws.on('error', (err) => console.error('[WS] Error:', err.message));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

// ============================================================
// Agent Manager
// ============================================================
const agentManager = new AgentManager(broadcast, WORKSPACE_DIR);
const openclawConnector = new OpenClawConnector(agentManager, broadcast);
openclawConnector.startScanning();
console.log("[OpenClaw] Auto-scanner active — watching ports 8000-8020");

// ============================================================
// REST API Routes
// ============================================================

// POST validate & save API key for session
app.post('/api/auth/apikey', async (req, res) => {
  const { apiKey } = req.body;
  const sessionId = getSessionId(req);
  if (!apiKey) return res.status(400).json({ error: 'apiKey required' });
  try {
    await agentManager.validateApiKey(apiKey);
    agentManager.setApiKey(sessionId, apiKey);
    res.json({ ok: true, message: 'API key validated and saved' });
  } catch (err) {
    res.status(401).json({ error: 'Invalid API key: ' + err.message });
  }
});

// DELETE remove API key for session
app.delete('/api/auth/apikey', (req, res) => {
  const sessionId = getSessionId(req);
  agentManager.removeApiKey(sessionId);
  res.json({ ok: true });
});

// GET check if session has API key
app.get('/api/auth/status', (req, res) => {
  const sessionId = getSessionId(req);
  const hasKey = agentManager.apiKeys.has(sessionId) || !!agentManager.devApiKey;
  res.json({ authenticated: hasKey, isDevMode: !!agentManager.devApiKey });
});

// GET all agents
app.get('/api/agents', (req, res) => {
  res.json(agentManager.getAllAgents());
});

// GET single agent
app.get('/api/agents/:id', (req, res) => {
  const agent = agentManager.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// POST create new agent
app.post('/api/agents', async (req, res) => {
  const { name, task, emoji } = req.body;
  if (!name || !task) return res.status(400).json({ error: 'name and task are required' });

  try {
    const sessionId = getSessionId(req);
    const agent = await agentManager.createAgent({ name, task, emoji, sessionId });
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST start agent task
app.post('/api/agents/:id/start', async (req, res) => {
  const { task } = req.body;
  try {
    await agentManager.startAgent(req.params.id, task);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST stop agent
app.post('/api/agents/:id/stop', (req, res) => {
  agentManager.stopAgent(req.params.id);
  res.json({ ok: true });
});

// DELETE agent
app.delete('/api/agents/:id', (req, res) => {
  agentManager.deleteAgent(req.params.id);
  res.json({ ok: true });
});

// POST chat with agent
app.post('/api/agents/:id/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    const reply = await agentManager.chatWithAgent(req.params.id, message);
    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json(agentManager.getRecentLogs(limit));
});

// GET logs for specific agent
app.get('/api/agents/:id/logs', (req, res) => {
  res.json(agentManager.getAgentLogs(req.params.id));
});

// GET workspace files
app.get('/api/workspace', (req, res) => {
  try {
    const files = fs.readdirSync(WORKSPACE_DIR).map(f => {
      const stat = fs.statSync(path.join(WORKSPACE_DIR, f));
      return { name: f, size: stat.size, modified: stat.mtime };
    });
    res.json(files);
  } catch (err) {
    res.json([]);
  }
});

// GET workspace file content
app.get('/api/workspace/:filename', (req, res) => {
  try {
    const filePath = path.join(WORKSPACE_DIR, path.basename(req.params.filename));
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

// GET server stats
app.get('/api/stats', (req, res) => {
  res.json(agentManager.getStats());
});

// Serve setup page
app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/setup.html'));
});

// Serve dashboard (protected — redirect to setup if no API key and no dev key)
app.get('/', (req, res) => {
  const sessionId = getSessionId(req);
  const hasKey = agentManager.apiKeys.has(sessionId) || !!agentManager.devApiKey;
  if (!hasKey) {
    return res.redirect('/setup');
  }
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/landing.html'));
});

// ============================================================
// Start server
// ============================================================
server.listen(PORT, () => {
  console.log('\n🐠 ==========================================');
  console.log(`🌊  Aquatic Claw is running!`);
  console.log(`🐠  Dashboard: http://localhost:${PORT}`);
  console.log(`🌊  Landing:   http://localhost:${PORT}/landing`);
  console.log(`🐠  API:       http://localhost:${PORT}/api`);
  console.log('🌊 ==========================================\n');
});

module.exports = { app, server };

// ============================================================
// OpenClaw Routes
// ============================================================

// GET all discovered OpenClaw agents
app.get('/api/openclaw/agents', (req, res) => {
  res.json(openclawConnector.getDiscoveredPorts());
});

// POST manually connect to a port
app.post('/api/openclaw/connect', async (req, res) => {
  const { port } = req.body;
  if (!port) return res.status(400).json({ error: 'port required' });
  try {
    await openclawConnector.connectToPort(parseInt(port));
    res.json({ ok: true, message: `Connected to port ${port}` });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// POST send command to OpenClaw agent
app.post('/api/openclaw/agents/:id/command', async (req, res) => {
  const { command, params } = req.body;
  try {
    const result = await openclawConnector.sendCommand(req.params.id, command, params);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET scan status
app.get('/api/openclaw/scan', async (req, res) => {
  await openclawConnector.scanAll();
  res.json({ scanned: true, discovered: openclawConnector.getDiscoveredPorts().length });
});
