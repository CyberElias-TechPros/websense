/**
 * Notification Manager — System alerts and user notifications
 * Channels: Webhooks, console, email (via webhook), dashboard events
 */

export class NotificationManager {
  constructor(options = {}) {
    this.config = {
      enabled: true,
      minInterval: 60000, // 1 minute between repeat notifications
      maxNotifications: 500,
      ...options,
    };

    this.notifications = [];
    this.subscribers = new Map(); // event -> [callbacks]
    this.lastNotified = new Map(); // event:key -> timestamp
    this.webhookManager = null;
  }

  // -----------------------------------------------------------------------
  // Set webhook manager for delivery
  // -----------------------------------------------------------------------
  setWebhookManager(manager) {
    this.webhookManager = manager;
  }

  // -----------------------------------------------------------------------
  // Subscribe to events
  // -----------------------------------------------------------------------
  subscribe(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }
    this.subscribers.get(event).push(callback);
    return () => this.unsubscribe(event, callback);
  }

  // -----------------------------------------------------------------------
  // Unsubscribe
  // -----------------------------------------------------------------------
  unsubscribe(event, callback) {
    const callbacks = this.subscribers.get(event);
    if (callbacks) {
      const idx = callbacks.indexOf(callback);
      if (idx >= 0) callbacks.splice(idx, 1);
    }
  }

  // -----------------------------------------------------------------------
  // Send a notification
  // -----------------------------------------------------------------------
  send(event, message, options = {}) {
    const notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      event,
      message,
      level: options.level || 'info', // info, warning, error, success
      source: options.source || 'system',
      metadata: options.metadata || {},
    };

    // Check if we should suppress duplicate notifications
    const suppressKey = `${event}:${options.suppressKey || ''}`;
    const now = Date.now();
    const lastTime = this.lastNotified.get(suppressKey);
    if (lastTime && now - lastTime < this.config.minInterval && !options.force) {
      return null;
    }
    this.lastNotified.set(suppressKey, now);

    // Store notification
    this.notifications.push(notification);
    if (this.notifications.length > this.config.maxNotifications) {
      this.notifications.shift();
    }

    // Notify subscribers
    const callbacks = this.subscribers.get(event) || [];
    for (const cb of callbacks) {
      try { cb(notification); } catch (err) { /* ignore */ }
    }

    // Notify all subscribers
    const allCallbacks = this.subscribers.get('*') || [];
    for (const cb of allCallbacks) {
      try { cb(notification); } catch (err) { /* ignore */ }
    }

    // Deliver via webhooks
    if (this.webhookManager) {
      try {
        this.webhookManager.send({
          event,
          message,
          level: notification.level,
          timestamp: notification.timestamp,
        });
      } catch (err) { /* ignore */ }
    }

    return notification;
  }

  // -----------------------------------------------------------------------
  // Pre-defined notification types
  // -----------------------------------------------------------------------

  // Proxy failure notification
  notifyProxyFailure(proxy, error) {
    return this.send('proxy_failure',
      `Proxy ${proxy.host}:${proxy.port} failed: ${error}`,
      { level: 'warning', source: 'proxy-health', suppressKey: `proxy-fail:${proxy.host}:${proxy.port}` }
    );
  }

  // Proxy cooldown notification
  notifyProxyCooldown(proxy, minutes) {
    return this.send('proxy_cooldown',
      `Proxy ${proxy.host}:${proxy.port} entered cooldown for ${minutes} minutes`,
      { level: 'warning', source: 'proxy-health', suppressKey: `proxy-cooldown:${proxy.host}:${proxy.port}` }
    );
  }

  // Proxy recovery notification
  notifyProxyRecovery(proxy) {
    return this.send('proxy_recovery',
      `Proxy ${proxy.host}:${proxy.port} recovered from cooldown`,
      { level: 'success', source: 'proxy-health' }
    );
  }

  // Low proxy count notification
  notifyLowProxyCount(count) {
    return this.send('low_proxy_count',
      `Only ${count} proxies available. Consider fetching more proxies.`,
      { level: 'warning', source: 'system', suppressKey: 'low-proxy-count' }
    );
  }

  // Anomaly notification
  notifyAnomaly(anomaly) {
    return this.send('anomaly_detected',
      `Anomaly detected: ${anomaly.type} on ${anomaly.proxy}`,
      { level: 'warning', source: 'proxy-intel', metadata: anomaly }
    );
  }

  // Visit milestone notification
  notifyMilestone(milestone) {
    return this.send('milestone',
      `Milestone reached: ${milestone}`,
      { level: 'success', source: 'system' }
    );
  }

  // System error notification
  notifyError(error, context = '') {
    return this.send('system_error',
      `Error in ${context}: ${error}`,
      { level: 'error', source: 'system' }
    );
  }

  // Engine started/stopped
  notifyEngineState(state) {
    return this.send('engine_state',
      `Engine ${state}`,
      { level: 'info', source: 'engine' }
    );
  }

  // -----------------------------------------------------------------------
  // Get recent notifications
  // -----------------------------------------------------------------------
  getRecent(limit = 50, event = null) {
    let notifications = [...this.notifications].reverse();
    if (event) notifications = notifications.filter(n => n.event === event);
    return notifications.slice(0, limit);
  }

  // -----------------------------------------------------------------------
  // Get unread notifications
  // -----------------------------------------------------------------------
  getUnread(since = 0) {
    return this.notifications.filter(n => n.timestamp > since);
  }

  // -----------------------------------------------------------------------
  // Clear notifications
  // -----------------------------------------------------------------------
  clear(event = null) {
    if (event) {
      this.notifications = this.notifications.filter(n => n.event !== event);
    } else {
      this.notifications = [];
    }
  }

  // -----------------------------------------------------------------------
  // Get stats
  // -----------------------------------------------------------------------
  getStats() {
    const byLevel = {};
    const byEvent = {};
    for (const n of this.notifications) {
      byLevel[n.level] = (byLevel[n.level] || 0) + 1;
      byEvent[n.event] = (byEvent[n.event] || 0) + 1;
    }

    return {
      enabled: this.config.enabled,
      totalNotifications: this.notifications.length,
      byLevel,
      byEvent,
      subscribers: Array.from(this.subscribers.keys()).length,
    };
  }

  // -----------------------------------------------------------------------
  // Get available events
  // -----------------------------------------------------------------------
  getEvents() {
    return Array.from(this.subscribers.keys());
  }
}

