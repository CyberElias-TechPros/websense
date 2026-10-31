// ============================================================================
// webhooks.js — Outgoing webhooks & notification channels.
// Features:
//   • Outgoing HTTP POST webhooks on events (visit, error, milestone)
//   • Notification channels: Telegram, Discord, Slack
//   • Webhook management (add, remove, test, list)
//   • Retry with exponential backoff
// ============================================================================

import logger from '../utils/logger.js';

export class WebhookManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      retryAttempts: 3,
      retryBackoffBase: 1000,
      ...config,
    };
    this.hooks = [];
    this.notificationChannels = [];
    this.stats = { sent: 0, failed: 0, retried: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  addWebhook({ url, events, headers = {}, secret = '' }) {
    if (!url) return null;
    const id = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const hook = { id, url, events: Array.isArray(events) ? events : [events], headers, secret, enabled: true, createdAt: Date.now() };
    this.hooks.push(hook);
    return hook;
  }

  removeWebhook(id) {
    const idx = this.hooks.findIndex((h) => h.id === id);
    if (idx >= 0) return this.hooks.splice(idx, 1)[0];
    return null;
  }

  toggleWebhook(id, enabled) {
    const hook = this.hooks.find((h) => h.id === id);
    if (hook) hook.enabled = !!enabled;
    return hook;
  }

  getWebhooks() { return [...this.hooks]; }

  addNotificationChannel({ type, config, events }) {
    const id = `nc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = { id, type, config, events: Array.isArray(events) ? events : [events], enabled: true, createdAt: Date.now() };
    this.notificationChannels.push(channel);
    return channel;
  }

  removeNotificationChannel(id) {
    const idx = this.notificationChannels.findIndex((c) => c.id === id);
    if (idx >= 0) return this.notificationChannels.splice(idx, 1)[0];
    return null;
  }

  getNotificationChannels() { return [...this.notificationChannels]; }

  async dispatch(eventType, payload) {
    const matchedHooks = this.hooks.filter((h) => h.enabled && h.events.includes(eventType));
    const tasks = matchedHooks.map((hook) => this._sendWebhook(hook, eventType, payload));
    await Promise.allSettled(tasks);

    const matchedChannels = this.notificationChannels.filter((c) => c.enabled && c.events.includes(eventType));
    for (const channel of matchedChannels) {
      await this._sendNotification(channel, eventType, payload).catch((err) =>
        logger.warn(`Notification channel ${channel.id} error: ${err.message}`)
      );
    }
  }

  async _sendWebhook(hook, eventType, payload) {
    const body = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), ...payload });
    const headers = { 'Content-Type': 'application/json', ...hook.headers };
    if (hook.secret) headers['X-Webhook-Secret'] = hook.secret;

    let lastError = null;
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(hook.url, { method: 'POST', headers, body });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.stats.sent++;
        return;
      } catch (err) {
        lastError = err;
        if (attempt < this.config.retryAttempts) {
          this.stats.retried++;
          const backoff = this.config.retryBackoffBase * Math.pow(2, attempt);
          logger.warn(`Webhook ${hook.id} retry ${attempt + 1} (${backoff}ms): ${err.message}`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }
    this.stats.failed++;
    logger.error(`Webhook ${hook.id} failed after ${this.config.retryAttempts} retries: ${lastError.message}`);
  }

  async _sendNotification(channel, eventType, payload) {
    switch (channel.type) {
      case 'telegram': return this._sendTelegram(channel.config, eventType, payload);
      case 'discord': return this._sendDiscord(channel.config, eventType, payload);
      case 'slack': return this._sendSlack(channel.config, eventType, payload);
      default: logger.warn(`Unknown notification channel type: ${channel.type}`);
    }
  }

  async _sendTelegram(config, eventType, payload) {
    const text = this._formatMessage(eventType, payload);
    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: 'HTML' }),
    });
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  }

  async _sendDiscord(config, eventType, payload) {
    const text = this._formatMessage(eventType, payload);
    const response = await fetch(config.webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
    });
    if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);
  }

  async _sendSlack(config, eventType, payload) {
    const text = this._formatMessage(eventType, payload);
    const response = await fetch(config.webhookUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`Slack HTTP ${response.status}`);
  }

  _formatMessage(eventType, payload) {
    const subdomain = payload?.subdomain || payload?.url || 'N/A';
    const proxy = payload?.proxy?.flag ? `${payload.proxy.flag}${payload.proxy.city}` : payload?.proxy?.host || 'N/A';
    const status = payload?.success ? '✅' : '❌';
    const device = payload?.deviceType || 'N/A';
    switch (eventType) {
      case 'visit:complete': return `${status} Visit: <b>${subdomain}</b> via ${proxy} (${payload?.latency}ms) [${device}]`;
      case 'visit:error': return `❌ Error: ${subdomain} via ${proxy} — ${payload?.error || 'unknown'}`;
      case 'session:complete': return `🌐 Session: ${subdomain} → ${payload?.pagesVisited} pages [${payload?.willBounce ? 'bounce' : 'engaged'}]`;
      case 'engine:started': return `🚀 Engine started — ${payload?.concurrency || '?'} slots`;
      case 'engine:stopped': return `⏹️ Engine stopped`;
      default: return `${eventType}: ${JSON.stringify(payload).slice(0, 200)}`;
    }
  }

  async testWebhook(hook) {
    const testPayload = { event: 'test', timestamp: new Date().toISOString(), message: 'Webhook test from WebSense' };
    try {
      const response = await fetch(hook.url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...hook.headers }, body: JSON.stringify(testPayload) });
      return { success: response.ok, status: response.status };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      webhookCount: this.hooks.length,
      activeWebhooks: this.hooks.filter((h) => h.enabled).length,
      channelCount: this.notificationChannels.length,
      ...this.stats,
    };
  }
}

export default WebhookManager;
