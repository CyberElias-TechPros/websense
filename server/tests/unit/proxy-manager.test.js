// ============================================================================
// proxy-manager.test.js — Unit tests for proxy rotation & health checking.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import ProxyManager from '../../core/proxy-manager.js';

const mockProxies = [
  { host: 'proxy1.com', port: 8000, country: 'US', city: 'New York', flag: '🇺🇸', enabled: true, username: 'user', password: 'pass' },
  { host: 'proxy2.com', port: 8000, country: 'GB', city: 'London', flag: '🇬🇧', enabled: true, username: 'user', password: 'pass' },
  { host: 'proxy3.com', port: 8000, country: 'DE', city: 'Berlin', flag: '🇩🇪', enabled: true, username: 'user', password: 'pass' },
];

describe('ProxyManager', () => {
  let pm;

  beforeEach(() => {
    pm = new ProxyManager(mockProxies, { enabled: true, interval: 30000 });
  });

  describe('constructor', () => {
    it('should load all proxies', () => {
      expect(pm.proxies.length).toBe(3);
    });

    it('should track enabled/disabled state', () => {
      expect(pm.proxies.every(p => p.enabled)).toBe(true);
    });
  });

  describe('select()', () => {
    it('should return a random enabled proxy', () => {
      const proxy = pm.select('random');
      expect(proxy).toBeDefined();
      expect(proxy.enabled).toBe(true);
    });

    it('should return null when no proxies available', () => {
      pm.proxies.forEach(p => p.enabled = false);
      expect(pm.select('random')).toBeNull();
    });

    it('should handle geo-spread strategy', () => {
      const proxy = pm.select('geo-spread');
      expect(proxy).toBeDefined();
    });

    it('should handle least-recently-used strategy', () => {
      const proxy = pm.select('least-recently-used');
      expect(proxy).toBeDefined();
    });

    it('should handle round-robin strategy', () => {
      const p1 = pm.select('round-robin');
      const p2 = pm.select('round-robin');
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
    });
  });

  describe('getRandom()', () => {
    it('should return a random proxy', () => {
      const proxy = pm.getRandom();
      expect(proxy).toBeDefined();
    });
  });

  describe('getActiveProxies()', () => {
    it('should return only enabled proxies', () => {
      pm.proxies[1].enabled = false;
      const active = pm.getActiveProxies();
      expect(active.length).toBe(2);
      expect(active.every(p => p.enabled)).toBe(true);
    });
  });

  describe('toggleProxy()', () => {
    it('should toggle proxy enabled state', () => {
      const proxy = pm.toggleProxy('proxy1.com', false);
      expect(proxy.enabled).toBe(false);
      const proxy2 = pm.toggleProxy('proxy1.com', true);
      expect(proxy2.enabled).toBe(true);
    });

    it('should return null for non-existent proxy', () => {
      expect(pm.toggleProxy('nonexistent.com', true)).toBeNull();
    });
  });

  describe('addProxy()', () => {
    it('should add a new proxy', () => {
      const newProxy = { host: 'proxy4.com', port: 8000, country: 'FR', city: 'Paris', flag: '🇫🇷', username: 'user', password: 'pass' };
      const added = pm.addProxy(newProxy);
      expect(added).toBeDefined();
      expect(pm.proxies.length).toBe(4);
    });

    it('should return null for duplicate proxy', () => {
      const dup = pm.addProxy({ host: 'proxy1.com', port: 8000 });
      expect(dup).toBeNull();
    });
  });

  describe('removeProxy()', () => {
    it('should remove a proxy', () => {
      const removed = pm.removeProxy('proxy1.com');
      expect(removed).toBe(true);
      expect(pm.proxies.length).toBe(2);
    });

    it('should return false for non-existent proxy', () => {
      expect(pm.removeProxy('nonexistent.com')).toBe(false);
    });
  });

  describe('recordSuccess()', () => {
    it('should update proxy stats on success', () => {
      const proxy = pm.proxies[0];
      pm.recordSuccess(proxy, 500);
      expect(proxy.successCount).toBeGreaterThan(0);
      expect(proxy.totalLatency).toBeGreaterThan(0);
    });
  });

  describe('recordFailure()', () => {
    it('should update proxy stats on failure', () => {
      const proxy = pm.proxies[0];
      pm.recordFailure(proxy, 'proxy');
      expect(proxy.failCount).toBeGreaterThan(0);
    });
  });

  describe('createAgent()', () => {
    it('should create an agent for http proxy', () => {
      const agent = pm.createAgent(mockProxies[0], false);
      expect(agent).toBeDefined();
    });

    it('should create an agent for https proxy', () => {
      const agent = pm.createAgent(mockProxies[0], true);
      expect(agent).toBeDefined();
    });
  });

  describe('getStats()', () => {
    it('should return proxy statistics', () => {
      const stats = pm.getStats();
      expect(stats).toBeDefined();
      expect(stats.total).toBe(3);
    });
  });

  describe('getGeoSpread()', () => {
    it('should return geo-spread proxy selection', () => {
      const proxy = pm.getGeoSpread();
      expect(proxy).toBeDefined();
    });
  });

  describe('getLeastRecentlyUsed()', () => {
    it('should return least recently used proxy', () => {
      const proxy = pm.getLeastRecentlyUsed();
      expect(proxy).toBeDefined();
    });
  });
});
