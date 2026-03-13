// ============================================================
// Aquatic Claw — Telegram Notifier
// Sends notifications to Telegram channel
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
  } catch (err) {
    console.error('[Telegram] Failed to send:', err.message);
  }
}

async function notifyAgentSpawned(agent) {
  await sendTelegram(`🐠 <b>Agent Spawned</b>\n\n<b>${agent.emoji} ${agent.name}</b>\nTask: ${agent.task}`);
}

async function notifyAgentDone(agent) {
  await sendTelegram(`✅ <b>Agent Done</b>\n\n<b>${agent.emoji} ${agent.name}</b>\nTask completed!\nTokens used: ${agent.stats?.tokens || 0}`);
}

async function notifyAgentError(agent, error) {
  await sendTelegram(`❌ <b>Agent Error</b>\n\n<b>${agent.emoji} ${agent.name}</b>\nError: ${error}`);
}

module.exports = { sendTelegram, notifyAgentSpawned, notifyAgentDone, notifyAgentError };
