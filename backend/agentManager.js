// ============================================================
// Aquatic Claw — Agent Manager
// Manages agent lifecycle, Claude API, tools execution
// ============================================================

const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const FISH_EMOJIS = ['🐠', '🐡', '🐬', '🦈', '🐙', '🦐', '🐟', '🦑', '🐳', '🦀'];

const TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for current information. Use when you need to find facts, news, or data.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    }
  },
  {
    name: 'read_file',
    description: 'Read a file from the workspace directory.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'The filename to read (no path, just name)' }
      },
      required: ['filename']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file in the workspace directory.',
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'The filename to write' },
        content: { type: 'string', description: 'The content to write' }
      },
      required: ['filename', 'content']
    }
  },
  {
    name: 'list_files',
    description: 'List all files in the workspace directory.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'execute_code',
    description: 'Execute JavaScript code and return the result. Use for calculations, data processing, etc.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute' },
        description: { type: 'string', description: 'What this code does' }
      },
      required: ['code', 'description']
    }
  },
  {
    name: 'report_progress',
    description: 'Report your current progress on the task. Call this periodically so the dashboard stays updated.',
    input_schema: {
      type: 'object',
      properties: {
        progress: { type: 'number', description: 'Progress percentage 0-100' },
        status: { type: 'string', description: 'What you are currently doing' }
      },
      required: ['progress', 'status']
    }
  }
];

class AgentManager {
  constructor(broadcast, workspaceDir) {
    this.broadcast = broadcast;
    this.workspaceDir = workspaceDir;
    this.agents = new Map();
    this.logs = [];
    this.stats = {
      totalTasksCompleted: 0,
      totalTokensUsed: 0,
      totalApiCalls: 0,
      startTime: Date.now()
    };

    // API keys per session (user provides their own key)
    this.apiKeys = new Map(); // sessionId -> apiKey
    // Fallback to env key if set (for local dev)
    this.devApiKey = (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here')
      ? process.env.ANTHROPIC_API_KEY : null;
    if (this.devApiKey) console.log('[AgentManager] Dev API key loaded from .env');
  }

  // Get Claude client for a session
  getClaudeClient(sessionId) {
    const key = this.apiKeys.get(sessionId) || this.devApiKey;
    if (!key) throw new Error('NO_API_KEY');
    return new Anthropic({ apiKey: key });
  }

  // Register API key for a session
  setApiKey(sessionId, apiKey) {
    if (!apiKey || !apiKey.startsWith('sk-ant-')) throw new Error('Invalid API key format');
    this.apiKeys.set(sessionId, apiKey);
    console.log(`[AgentManager] API key registered for session ${sessionId.slice(0,8)}...`);
  }

  // Remove API key for a session
  removeApiKey(sessionId) {
    this.apiKeys.delete(sessionId);
  }

  // Validate API key by making a minimal test call
  async validateApiKey(apiKey) {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'hi' }]
    });
    return res.content[0]?.text ? true : false;
  }

  // ============================================================
  // Agent CRUD
  // ============================================================

  createAgent({ name, task, emoji, sessionId }) {
    const id = uuidv4();
    const agent = {
      id,
      name: name || `Agent-${id.slice(0, 6)}`,
      emoji: emoji || FISH_EMOJIS[this.agents.size % FISH_EMOJIS.length],
      status: 'idle',
      task: task || '',
      currentAction: 'Standing by...',
      progress: 0,
      speed: 0,
      color: this.randomColor(),
      sessionId: sessionId || 'local',
      stats: { calls: 0, tokens: 0, errors: 0, tasksCompleted: 0 },
      logs: [],
      messages: [], // conversation history
      abortController: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.agents.set(id, agent);
    this.addLog({ agentId: id, agentName: agent.name, agentEmoji: agent.emoji, type: 'info', message: `Agent ${agent.name} created` });
    this.broadcastAgentUpdate(agent);
    return agent;
  }

  getAgent(id) {
    return this.agents.get(id) || null;
  }

  getAllAgents() {
    return Array.from(this.agents.values()).map(a => this.sanitizeAgent(a));
  }

  deleteAgent(id) {
    this.stopAgent(id);
    this.agents.delete(id);
    this.broadcast({ type: 'AGENT_DELETED', agentId: id });
  }

  sanitizeAgent(agent) {
    const { abortController, messages, ...safe } = agent;
    return safe;
  }

  // ============================================================
  // Agent Task Execution
  // ============================================================

  async startAgent(id, task) {
    const agent = this.agents.get(id);
    if (!agent) throw new Error('Agent not found');
    if (agent.status === 'active') throw new Error('Agent already running');

    agent.task = task || agent.task;
    agent.status = 'active';
    agent.progress = 0;
    agent.speed = 0.5 + Math.random() * 0.5;
    agent.currentAction = 'Starting up...';
    agent.messages = []; // fresh conversation
    agent.abortController = new AbortController();

    this.broadcastAgentUpdate(agent);
    this.addLog({ agentId: id, agentName: agent.name, agentEmoji: agent.emoji, type: 'info', message: `Starting task: ${agent.task}` });

    // Run agent asynchronously
    this.runAgent(agent).catch(err => {
      if (err.name !== 'AbortError') {
        this.setAgentError(agent, err.message);
      }
    });
  }

  stopAgent(id) {
    const agent = this.agents.get(id);
    if (!agent) return;
    if (agent.abortController) agent.abortController.abort();
    agent.status = 'idle';
    agent.speed = 0;
    agent.currentAction = 'Stopped by user.';
    agent.abortController = null;
    this.broadcastAgentUpdate(agent);
    this.addLog({ agentId: id, agentName: agent.name, agentEmoji: agent.emoji, type: 'warn', message: 'Agent stopped by user' });
  }

  async runAgent(agent) {
    const systemPrompt = `You are ${agent.name}, an AI agent displayed as a fish in the Aquatic Claw monitoring dashboard.

Your current task: ${agent.task}

You have access to tools: web_search, read_file, write_file, list_files, execute_code, and report_progress.

IMPORTANT RULES:
1. Call report_progress regularly (every 1-2 steps) so the dashboard shows your current status.
2. Break your task into clear steps. Think out loud briefly before using tools.
3. When you use web_search, analyze the results and continue working.
4. Save important outputs to files using write_file.
5. When you are fully done, call report_progress with progress=100 and a completion summary.
6. Be thorough but efficient. Complete the task fully.

Start working on your task now.`;

    agent.messages = [{ role: 'user', content: agent.task }];

    let iterationCount = 0;
    const MAX_ITERATIONS = 20;

    while (iterationCount < MAX_ITERATIONS) {
      if (agent.abortController?.signal.aborted) break;
      iterationCount++;

      try {
        agent.stats.calls++;
        this.stats.totalApiCalls++;
        this.broadcastAgentUpdate(agent);

        const claudeClient = this.getClaudeClient(agent.sessionId || 'local');
        const response = await claudeClient.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: parseInt(process.env.MAX_TOKENS_PER_AGENT) || 4096,
          system: systemPrompt,
          messages: agent.messages,
          tools: TOOLS
        });

        // Track token usage
        agent.stats.tokens += (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
        this.stats.totalTokensUsed += agent.stats.tokens;

        // Add assistant response to history
        agent.messages.push({ role: 'assistant', content: response.content });

        // Process response content
        let hasToolUse = false;
        const toolResults = [];

        for (const block of response.content) {
          if (block.type === 'text' && block.text.trim()) {
            this.addLog({
              agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji,
              type: 'think', message: block.text.slice(0, 200) + (block.text.length > 200 ? '...' : '')
            });
            agent.currentAction = block.text.slice(0, 80);
            this.broadcastAgentUpdate(agent);
          }

          if (block.type === 'tool_use') {
            hasToolUse = true;
            const result = await this.executeTool(agent, block.name, block.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: typeof result === 'string' ? result : JSON.stringify(result)
            });
          }
        }

        // If tools were used, add results and continue
        if (hasToolUse && toolResults.length > 0) {
          agent.messages.push({ role: 'user', content: toolResults });
          continue;
        }

        // No tool use = agent is done or waiting
        if (response.stop_reason === 'end_turn') {
          this.setAgentDone(agent);
          break;
        }

        if (response.stop_reason === 'max_tokens') {
          // Continue if max tokens hit
          agent.messages.push({ role: 'user', content: 'Continue from where you left off.' });
          continue;
        }

        break;

      } catch (err) {
        if (err.name === 'AbortError') break;
        throw err;
      }
    }

    if (iterationCount >= MAX_ITERATIONS) {
      this.setAgentDone(agent, 'Max iterations reached.');
    }
  }

  // ============================================================
  // Tool Execution
  // ============================================================

  async executeTool(agent, toolName, input) {
    this.addLog({
      agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji,
      type: 'tool', message: `→ ${toolName}(${JSON.stringify(input).slice(0, 100)})`
    });

    agent.currentAction = `Using ${toolName}...`;
    agent.speed = Math.min(1.0, agent.speed + 0.1);
    this.broadcastAgentUpdate(agent);

    try {
      switch (toolName) {
        case 'web_search':
          return await this.toolWebSearch(input.query);

        case 'read_file':
          return this.toolReadFile(input.filename);

        case 'write_file':
          return this.toolWriteFile(input.filename, input.content, agent);

        case 'list_files':
          return this.toolListFiles();

        case 'execute_code':
          return this.toolExecuteCode(input.code, input.description, agent);

        case 'report_progress':
          agent.progress = Math.max(0, Math.min(100, input.progress));
          agent.currentAction = input.status;
          agent.speed = input.progress === 100 ? 0.1 : 0.5 + (input.progress / 100) * 0.5;
          this.broadcastAgentUpdate(agent);
          this.addLog({
            agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji,
            type: 'progress', message: `Progress: ${input.progress}% — ${input.status}`
          });
          return `Progress updated to ${input.progress}%`;

        default:
          return `Unknown tool: ${toolName}`;
      }
    } catch (err) {
      this.addLog({
        agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji,
        type: 'error', message: `Tool error in ${toolName}: ${err.message}`
      });
      return `Error: ${err.message}`;
    }
  }

  async toolWebSearch(query) {
    // Use DuckDuckGo instant answer API (free, no key needed)
    try {
      const fetch = (await import('node-fetch')).default;
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url, { headers: { 'User-Agent': 'AquaticClaw/1.0' } });
      const data = await res.json();

      let result = '';
      if (data.AbstractText) result += `Summary: ${data.AbstractText}\n`;
      if (data.Answer) result += `Answer: ${data.Answer}\n`;
      if (data.RelatedTopics?.length > 0) {
        result += 'Related:\n';
        data.RelatedTopics.slice(0, 5).forEach(t => {
          if (t.Text) result += `- ${t.Text.slice(0, 150)}\n`;
        });
      }

      return result || `Search completed for "${query}". No instant answer found — try a more specific query.`;
    } catch (err) {
      return `Search failed: ${err.message}. Please try rephrasing your query.`;
    }
  }

  toolReadFile(filename) {
    const safeName = path.basename(filename);
    const filePath = path.join(this.workspaceDir, safeName);
    if (!fs.existsSync(filePath)) return `File "${safeName}" not found in workspace.`;
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.slice(0, 5000); // limit output
  }

  toolWriteFile(filename, content, agent) {
    const safeName = path.basename(filename);
    const filePath = path.join(this.workspaceDir, safeName);
    fs.writeFileSync(filePath, content, 'utf-8');
    this.broadcast({ type: 'WORKSPACE_UPDATE', filename: safeName, agentId: agent.id });
    this.addLog({
      agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji,
      type: 'done', message: `Wrote file: ${safeName} (${content.length} chars)`
    });
    return `File "${safeName}" written successfully (${content.length} characters).`;
  }

  toolListFiles() {
    try {
      const files = fs.readdirSync(this.workspaceDir);
      if (files.length === 0) return 'Workspace is empty.';
      return 'Files in workspace:\n' + files.map(f => {
        const stat = fs.statSync(path.join(this.workspaceDir, f));
        return `- ${f} (${stat.size} bytes)`;
      }).join('\n');
    } catch (err) {
      return `Error listing files: ${err.message}`;
    }
  }

  toolExecuteCode(code, description, agent) {
    this.addLog({
      agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji,
      type: 'tool', message: `Executing: ${description}`
    });

    try {
      // Safe execution using Function constructor with timeout
      const logs = [];
      const mockConsole = { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push('ERR: ' + args.join(' ')) };

      const fn = new Function('console', 'Math', 'JSON', 'Date', `
        "use strict";
        try {
          ${code}
        } catch(e) {
          return 'Error: ' + e.message;
        }
      `);

      const result = fn(mockConsole, Math, JSON, Date);
      const output = [
        logs.length > 0 ? 'Console output:\n' + logs.join('\n') : '',
        result !== undefined ? `Return value: ${JSON.stringify(result)}` : ''
      ].filter(Boolean).join('\n');

      return output || 'Code executed successfully (no output).';
    } catch (err) {
      return `Execution error: ${err.message}`;
    }
  }

  // ============================================================
  // Chat with agent
  // ============================================================

  async chatWithAgent(id, userMessage) {
    const agent = this.agents.get(id);
    if (!agent) throw new Error('Agent not found');

    this.addLog({
      agentId: id, agentName: agent.name, agentEmoji: agent.emoji,
      type: 'chat', message: `User: ${userMessage}`
    });

    // Use a separate quick conversation for chat (doesn't interrupt running task)
    const chatMessages = [
      {
        role: 'user',
        content: `You are ${agent.name}, an AI agent in the Aquatic Claw dashboard. 
Current status: ${agent.status}
Current task: ${agent.task || 'None'}
Progress: ${agent.progress}%
Current action: ${agent.currentAction}

The user is sending you a direct message. Reply conversationally and briefly (1-3 sentences).
If they ask you to change tasks, confirm and say you'll start the new task.

User message: ${userMessage}`
      }
    ];

    const claudeClient = this.getClaudeClient(agent.sessionId || 'local');
    const response = await claudeClient.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 256,
      messages: chatMessages
    });

    const reply = response.content[0]?.text || 'Unable to respond right now.';

    this.addLog({
      agentId: id, agentName: agent.name, agentEmoji: agent.emoji,
      type: 'chat', message: `${agent.name}: ${reply}`
    });

    this.broadcast({
      type: 'CHAT_MESSAGE',
      agentId: id,
      from: agent.name,
      emoji: agent.emoji,
      message: reply
    });

    return reply;
  }

  // ============================================================
  // Helpers
  // ============================================================

  setAgentDone(agent, note = '') {
    agent.status = 'done';
    agent.progress = 100;
    agent.speed = 0.1;
    agent.currentAction = note || 'Task completed successfully!';
    agent.stats.tasksCompleted++;
    this.stats.totalTasksCompleted++;
    agent.abortController = null;
    agent.updatedAt = Date.now();
    this.broadcastAgentUpdate(agent);
    this.addLog({
      agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji,
      type: 'done', message: `✓ Task complete: ${agent.task}`
    });
  }

  setAgentError(agent, errorMsg) {
    agent.status = 'error';
    agent.speed = 0.05;
    agent.currentAction = `ERROR: ${errorMsg}`;
    agent.stats.errors++;
    agent.abortController = null;
    agent.updatedAt = Date.now();
    this.broadcastAgentUpdate(agent);
    this.addLog({
      agentId: agent.id, agentName: agent.name, agentEmoji: agent.emoji,
      type: 'error', message: `Error: ${errorMsg}`
    });
  }

  addLog({ agentId, agentName, agentEmoji, type, message }) {
    const log = {
      id: uuidv4(),
      agentId,
      agentName,
      agentEmoji,
      type,
      message,
      time: new Date().toISOString()
    };
    this.logs.push(log);
    if (this.logs.length > 500) this.logs.shift();

    // Also add to agent's own logs
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.logs.push(log);
      if (agent.logs.length > 100) agent.logs.shift();
    }

    this.broadcast({ type: 'LOG', log });
  }

  broadcastAgentUpdate(agent) {
    agent.updatedAt = Date.now();
    this.broadcast({ type: 'AGENT_UPDATE', agent: this.sanitizeAgent(agent) });
  }

  getRecentLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  getAgentLogs(id) {
    const agent = this.agents.get(id);
    return agent ? agent.logs : [];
  }

  getStats() {
    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    return {
      ...this.stats,
      uptime,
      activeAgents: Array.from(this.agents.values()).filter(a => a.status === 'active').length,
      totalAgents: this.agents.size,
    };
  }

  randomColor() {
    const colors = ['#00D4FF', '#00FFD1', '#FF7B54', '#FFB347', '#C084FC', '#7FFF00', '#FF6B9D', '#4ECDC4'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

module.exports = AgentManager;
