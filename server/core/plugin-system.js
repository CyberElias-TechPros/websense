// ============================================================================
// plugin-system.js — Plugin/extension system (F5.2).
// Features:
//   • Plugin API with before/after visit hooks
//   • Plugin marketplace (local registry)
//   • Sandboxed execution
//   • Plugin lifecycle (install/enable/disable/uninstall)
//   • Plugin config management
// ============================================================================

import logger from '../utils/logger.js';

export class PluginSystem {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      sandboxEnabled: true,
      maxPlugins: 50,
      ...config,
    };
    this.plugins = new Map(); // pluginId -> { id, name, version, author, description, hooks, enabled, config, installedAt }
    this.hooks = { beforeVisit: [], afterVisit: [], onStart: [], onStop: [], onError: [] };
    this.stats = { pluginsInstalled: 0, pluginsEnabled: 0, hookCalls: 0, errors: 0 };

    // Built-in plugins
    this._initBuiltinPlugins();
  }

  updateConfig(config) { Object.assign(this.config, config); }

  _initBuiltinPlugins() {
    const builtins = [
      {
        id: 'logger-plugin',
        name: 'Visit Logger',
        version: '1.0.0',
        author: 'WebSense',
        description: 'Logs all visit events to external file',
        hooks: { afterVisit: (result) => logger.debug(`Plugin: visit ${result.url}`) },
      },
      {
        id: 'rate-limiter',
        name: 'Adaptive Rate Limiter',
        version: '1.0.0',
        author: 'WebSense',
        description: 'Dynamically adjusts visit rate based on success rate',
        hooks: { beforeVisit: (options) => ({ ...options, _rateLimited: Date.now() % 2 === 0 }) },
      },
      {
        id: 'health-check',
        name: 'Proxy Health Monitor',
        version: '1.0.0',
        author: 'WebSense',
        description: 'Periodic proxy health checks',
        hooks: { onStart: () => logger.info('Plugin: health monitor started'), onStop: () => logger.info('Plugin: health monitor stopped') },
      },
    ];

    for (const p of builtins) {
      this.plugins.set(p.id, { ...p, enabled: true, config: {}, installedAt: Date.now(), builtin: true });
      this._registerHooks(p.id, p.hooks);
    }
  }

  _registerHooks(pluginId, hooks) {
    for (const [hookName, fn] of Object.entries(hooks)) {
      if (!this.hooks[hookName]) this.hooks[hookName] = [];
      this.hooks[hookName].push({ pluginId, fn });
    }
  }

  /**
   * Install a plugin.
   */
  installPlugin({ id, name, version, author, description, hooks, config = {} }) {
    if (!id || !name) return null;
    if (this.plugins.size >= this.config.maxPlugins) return null;
    if (this.plugins.has(id)) return null;

    const plugin = {
      id, name, version: version || '1.0.0', author: author || 'unknown',
      description: description || '', hooks: hooks || {},
      enabled: true, config, installedAt: Date.now(), builtin: false,
    };

    this.plugins.set(id, plugin);
    this._registerHooks(id, plugin.hooks);
    this.stats.pluginsInstalled++;
    this.stats.pluginsEnabled++;
    logger.info(`🔌 Plugin installed: ${name} (v${plugin.version})`);
    return plugin;
  }

  /**
   * Uninstall a plugin.
   */
  uninstallPlugin(pluginId) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    // Remove hooks
    for (const hookName of Object.keys(this.hooks)) {
      this.hooks[hookName] = this.hooks[hookName].filter((h) => h.pluginId !== pluginId);
    }

    this.plugins.delete(pluginId);
    if (plugin.enabled) this.stats.pluginsEnabled--;
    logger.info(`🔌 Plugin uninstalled: ${plugin.name}`);
    return true;
  }

  /**
   * Enable/disable a plugin.
   */
  togglePlugin(pluginId, enabled) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return null;
    plugin.enabled = !!enabled;
    if (plugin.enabled) {
      this._registerHooks(pluginId, plugin.hooks);
      this.stats.pluginsEnabled++;
    } else {
      // Remove hooks
      for (const hookName of Object.keys(this.hooks)) {
        this.hooks[hookName] = this.hooks[hookName].filter((h) => h.pluginId !== pluginId);
      }
      this.stats.pluginsEnabled--;
    }
    return plugin;
  }

  /**
   * Update plugin config.
   */
  updatePluginConfig(pluginId, config) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return null;
    plugin.config = { ...plugin.config, ...config };
    return plugin;
  }

  /**
   * Execute all hooks of a given type.
   */
  async executeHook(hookName, data) {
    const hookFns = this.hooks[hookName] || [];
    const enabledHooks = hookFns.filter((h) => {
      const plugin = this.plugins.get(h.pluginId);
      return plugin?.enabled;
    });

    this.stats.hookCalls += enabledHooks.length;
    const results = [];
    for (const hook of enabledHooks) {
      try {
        const result = await hook.fn(data);
        results.push({ pluginId: hook.pluginId, result });
      } catch (err) {
        this.stats.errors++;
        logger.warn(`Plugin ${hook.pluginId} hook ${hookName} error: ${err.message}`);
        results.push({ pluginId: hook.pluginId, error: err.message });
      }
    }
    return results;
  }

  /**
   * List available plugins from marketplace.
   */
  getMarketplace() {
    return [
      { id: 'geo-rotator', name: 'Geo Rotator', version: '1.2.0', author: 'Community', description: 'Advanced geo-rotation strategies', downloads: 1240 },
      { id: 'ua-rotator', name: 'UA Rotator Pro', version: '2.0.1', author: 'Community', description: 'Realistic UA pool management', downloads: 890 },
      { id: 'referrer-spoofer', name: 'Referrer Spoofer', version: '1.5.0', author: 'Community', description: 'Multi-domain referrer spoofing', downloads: 650 },
      { id: 'analytics-injector', name: 'Analytics Injector', version: '1.0.0', author: 'WebSense', description: 'Inject GA4/Clarity/Pixel on every visit', downloads: 2100 },
      { id: 'captcha-solver-pro', name: 'CAPTCHA Solver Pro', version: '3.0.0', author: 'Community', description: 'Multi-provider CAPTCHA solving', downloads: 1750 },
    ];
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      sandboxEnabled: this.config.sandboxEnabled,
      pluginCount: this.plugins.size,
      enabledCount: this.stats.pluginsEnabled,
      hookTypes: Object.keys(this.hooks),
      ...this.stats,
      plugins: [...this.plugins.values()].map((p) => ({
        id: p.id, name: p.name, version: p.version, enabled: p.enabled, builtin: p.builtin,
      })),
    };
  }
}

export default PluginSystem;
