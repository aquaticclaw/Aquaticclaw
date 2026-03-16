// ============================================================
// Aquatic Claw — OpenClaw Connector
// Auto-discovers and monitors OpenClaw agents on localhost
// ============================================================

const { v4: uuidv4 } = require('uuid');

// OpenClaw typically runs agents on these ports
const SCAN_PORTS = Array.from({ length: 21 }, (_, i) => 8000 + i); // 8000-8020
const SCAN_INTERVAL = 10000; // scan every 10 seconds
const REQUEST_TIMEOUT = 2000; // 2 second timeout per port

// OpenClaw agent fish emojis (different from internal agents)
const OPENCLAW_EMOJIS = ['🦞', '🦀', '🐡', '🦑', '🐙', '🦐'];

class OpenClawConnector {
  constructor(agentManager, broadcast) {
    this.agentManager = agentManager;
    this.broadcast = broadcast;
    this.discoveredPorts = new Map(); // port -> agentId
    this.scanning = false;
    this.scanInterval = null;
  }

  // ============================================================
  // Start auto-scanning
  // ============================================================
  startScanning() {
    if (this.scanInterval) return;
    console.log('[OpenClaw] Auto-scanner started, watching ports 8000-8020...');
    this.scanAll();
    this.scanInterval = setInterval(() => this.scanAll(), SCAN_INTERVAL);
  }

  stopScanning() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  // ============================================================
  // Scan all ports
  // ============================================================
  async scanAll() {
    if (this.scanning) return;
    this.scanning = true;

    const results = await Promise.allSettled(
      SCAN_PORTS.map(port => this.checkPort(port))
    );

    // Check for agents that disappeared
    for (const [port, agentId] of this.discoveredPorts.entries()) {
      const portIndex = SCAN_PORTS.indexOf(port);
      if (results[portIndex]?.status === 'rejected' || !results[portIndex]?.value) {
        this.handleAgentDisconnected(port, agentId);
      }
    }

    this.scanning = false;
  }

  // ============================================================
  // Check single port for OpenClaw agent
  // ============================================================
  async checkPort(port) {
    try {
      const fetch = (await import('node-fetch')).default;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      // Try OpenClaw standard endpoints
      const endpoints = ['/status', '/agent/status', '/api/status', '/health'];
      
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(`http://localhost:${port}${endpoint}`, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
          });
          
          clearTimeout(timeout);

          if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const data = await res.json();
              await this.handleAgentFound(port, data, endpoint);
              return true;
            }
          }
        } catch (e) {
          // Try next endpoint
        }
      }

      clearTimeout(timeout);
      return false;
    } catch (e) {
      return false;
    }
  }

  // ============================================================
  // Handle discovered OpenClaw agent
  // ============================================================
  async handleAgentFound(port, data, endpoint) {
    const existingAgentId = this.discoveredPorts.get(port);

    // Parse OpenClaw agent data (handles different response formats)
    const agentInfo = this.parseOpenClawResponse(data, port);

    if (existingAgentId) {
      // Update existing agent
      const agent = this.agentManager.getAgent(existingAgentId);
      if (agent) {
        agent.status = agentInfo.status;
        agent.currentAction = agentInfo.currentAction;
        agent.progress = agentInfo.progress;
        agent.speed = agentInfo.speed;
        agent.task = agentInfo.task || agent.task;
        agent.updatedAt = Date.now();
        agent.openclawData = data; // store raw data
        this.agentManager.broadcastAgentUpdate(agent);
      }
    } else {
      // New agent discovered!
      console.log(`[OpenClaw] 🐠 Agent discovered on port ${port}!`);
      
      const newAgent = {
        id: uuidv4(),
        name: agentInfo.name || `OpenClaw-${port}`,
        emoji: OPENCLAW_EMOJIS[this.discoveredPorts.size % OPENCLAW_EMOJIS.length],
        status: agentInfo.status,
        task: agentInfo.task || 'OpenClaw Agent',
        currentAction: agentInfo.currentAction,
        progress: agentInfo.progress,
        speed: agentInfo.speed,
        color: '#FF6B35', // orange for OpenClaw agents
        isExternal: true,
        externalPort: port,
        externalEndpoint: endpoint,
        stats: { calls: agentInfo.calls || 0, tokens: agentInfo.tokens || 0, errors: 0, tasksCompleted: 0 },
        logs: [],
        messages: [],
        abortController: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        openclawData: data
      };

      this.agentManager.agents.set(newAgent.id, newAgent);
      this.discoveredPorts.set(port, newAgent.id);

      this.agentManager.addLog({
        agentId: newAgent.id,
        agentName: newAgent.name,
        agentEmoji: newAgent.emoji,
        type: 'info',
        message: `🔌 OpenClaw agent discovered on port ${port}`
      });

      this.broadcast({
        type: 'OPENCLAW_DISCOVERED',
        agent: this.agentManager.sanitizeAgent(newAgent),
        port
      });

      // Start polling this agent
      this.startPolling(port, newAgent.id, endpoint);
    }
  }

  // ============================================================
  // Parse different OpenClaw response formats
  // ============================================================
  parseOpenClawResponse(data, port) {
    // Handle various OpenClaw/agent status response formats
    return {
      name: data.name || data.agent_name || data.agentName || `Agent-${port}`,
      status: this.normalizeStatus(data.status || data.state || data.agent_status),
      task: data.task || data.current_task || data.description || '',
      currentAction: data.action || data.current_action || data.activity || data.message || 'Running...',
      progress: parseFloat(data.progress || data.completion || 0),
      speed: this.calculateSpeed(data),
      calls: parseInt(data.api_calls || data.calls || data.requests || 0),
      tokens: parseInt(data.tokens || data.token_count || data.total_tokens || 0),
    };
  }

  normalizeStatus(status) {
    if (!status) return 'active';
    const s = String(status).toLowerCase();
    if (s.includes('run') || s.includes('active') || s.includes('work') || s.includes('busy')) return 'active';
    if (s.includes('idle') || s.includes('wait') || s.includes('ready') || s.includes('stand')) return 'idle';
    if (s.includes('error') || s.includes('fail') || s.includes('crash')) return 'error';
    if (s.includes('done') || s.includes('complete') || s.includes('finish')) return 'done';
    return 'active';
  }

  calculateSpeed(data) {
    const status = this.normalizeStatus(data.status || data.state);
    if (status === 'idle' || status === 'done') return 0.1;
    if (status === 'error') return 0.05;
    // Try to calculate from progress/activity
    const progress = parseFloat(data.progress || 0);
    return 0.4 + (Math.random() * 0.4); // OpenClaw agents default to medium-high speed
  }

  // ============================================================
  // Poll a specific agent regularly
  // ============================================================
  startPolling(port, agentId, endpoint) {
    const pollInterval = setInterval(async () => {
      const agent = this.agentManager.getAgent(agentId);
      if (!agent) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const fetch = (await import('node-fetch')).default;
        const res = await fetch(`http://localhost:${port}${endpoint}`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT)
        });

        if (res.ok) {
          const data = await res.json();
          const info = this.parseOpenClawResponse(data, port);
          agent.status = info.status;
          agent.currentAction = info.currentAction;
          agent.progress = info.progress;
          agent.speed = info.speed;
          agent.openclawData = data;
          agent.updatedAt = Date.now();
          this.agentManager.broadcastAgentUpdate(agent);
        }
      } catch (e) {
        // Agent might have stopped
        this.handleAgentDisconnected(port, agentId);
        clearInterval(pollInterval);
      }
    }, 3000); // poll every 3 seconds
  }

  // ============================================================
  // Handle agent disconnected
  // ============================================================
  handleAgentDisconnected(port, agentId) {
    const agent = this.agentManager.getAgent(agentId);
    if (agent && agent.isExternal) {
      console.log(`[OpenClaw] Agent on port ${port} disconnected`);
      agent.status = 'idle';
      agent.speed = 0;
      agent.currentAction = 'Disconnected from OpenClaw agent';
      this.agentManager.broadcastAgentUpdate(agent);
      this.agentManager.addLog({
        agentId,
        agentName: agent.name,
        agentEmoji: agent.emoji,
        type: 'warn',
        message: `🔌 OpenClaw agent on port ${port} disconnected`
      });
      this.discoveredPorts.delete(port);
    }
  }

  // ============================================================
  // Manual connect to specific port
  // ============================================================
  async connectToPort(port) {
    const found = await this.checkPort(port);
    if (!found) {
      throw new Error(`No OpenClaw agent found on port ${port}`);
    }
    return true;
  }

  // ============================================================
  // Send command to OpenClaw agent
  // ============================================================
  async sendCommand(agentId, command, params = {}) {
    const agent = this.agentManager.getAgent(agentId);
    if (!agent || !agent.isExternal) throw new Error('Not an external agent');

    const fetch = (await import('node-fetch')).default;
    const res = await fetch(`http://localhost:${agent.externalPort}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, ...params }),
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) throw new Error(`Command failed: ${res.statusText}`);
    return await res.json();
  }

  getDiscoveredPorts() {
    return Array.from(this.discoveredPorts.entries()).map(([port, agentId]) => ({
      port, agentId, agent: this.agentManager.sanitizeAgent(this.agentManager.getAgent(agentId))
    }));
  }
}

module.exports = OpenClawConnector;
