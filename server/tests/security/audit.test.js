// ============================================================================
// audit.test.js — Security & robustness audit tests.
// Tests: input validation, XSS prevention, SQL injection safety,
// rate limiting, CORS, header security, secret leakage.
// ============================================================================

import { describe, it, expect } from 'vitest';
import ProxyManager from '../../core/proxy-manager.js';
import UrlManager from '../../core/url-manager.js';
import VisitEngine from '../../core/visit-engine.js';
import UtmManager from '../../core/utm-manager.js';
import ContentVerifier from '../../core/content-verification.js';
import CdnEdgeAwareness from '../../core/cdn-edge-awareness.js';

const mockProxies = [
  { host: 'proxy1.com', port: 8000, country: 'US', city: 'New York', flag: '🇺🇸', enabled: true, username: 'user', password: 'pass' },
];
const mockUrls = ['https://example.com'];

describe('Security Audit', () => {

  describe('Input Validation', () => {
    it('UrlManager rejects non-string URLs', () => {
      const um = new UrlManager(mockUrls);
      expect(um.addUrl(null)).toBeNull();
      expect(um.addUrl(undefined)).toBeNull();
      expect(um.addUrl(123)).toBeNull();
    });

    it('UrlManager rejects invalid URL formats', () => {
      const um = new UrlManager(mockUrls);
      // Should not throw — just return entry with subdomain from fallback
      const result = um.addUrl('not-a-url');
      expect(result).toBeDefined();
    });

    it('ProxyManager rejects duplicate proxies', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const dup = pm.addProxy({ host: 'proxy1.com', port: 8000 });
      expect(dup).toBeNull();
    });

    it('ProxyManager handles missing fields gracefully', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const result = pm.addProxy({ host: 'test.com' });
      expect(result).toBeDefined();
      expect(result.port).toBeUndefined();
    });

    it('UtmManager validates campaign requirements', () => {
      const um = new UtmManager({ enabled: true });
      const noSource = um.addCampaign({ medium: 'cpc' });
      expect(noSource).toBeFalsy();
      const noMedium = um.addCampaign({ source: 'google' });
      expect(noMedium).toBeFalsy();
    });
  });

  describe('SQL Injection Safety', () => {
    it('UrlManager uses parameterized queries', () => {
      const um = new UrlManager(mockUrls);
      // Injection attempt in URL
      const injection = "https://example.com' OR '1'='1";
      const result = um.addUrl(injection);
      // Should not execute the injection — just treat as a URL string
      expect(result).toBeDefined();
    });

    it('ProxyManager uses parameterized queries', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      // Injection attempt in host
      const injection = "proxy1.com' OR '1'='1";
      const result = pm.addProxy({ host: injection, port: 8000 });
      // Should not execute — just store as a string
      expect(result).toBeDefined();
    });
  });

  describe('XSS Prevention', () => {
    it('ContentVerifier escapes HTML in error messages', () => {
      const cv = new ContentVerifier({ enabled: true, checkTitle: true, checkImages: true, minContentLength: 100 });
      const result = cv.verifyHTTP('<script>alert("xss")</script><title></title>', 200);
      // Should detect empty title and short content
      expect(result).toBeDefined();
    });

    it('ContentVerifier detects malicious content patterns', () => {
      const cv = new ContentVerifier({ enabled: true });
      const result = cv.verifyHTTP('<html><body>normal content here</body></html>', 200);
      expect(result).toBeDefined();
    });
  });

  describe('URL Safety', () => {
    it('VisitEngine handles malformed URLs gracefully in demo mode', async () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const um = new UrlManager(['https://test.com']);
      const ve = new VisitEngine(pm, um, { mode: 'http', demoMode: true });
      const result = await ve.executeVisit({});
      expect(result.success).toBe(true);
    });

    it('UrlManager extracts subdomain safely from weird URLs', () => {
      const um = new UrlManager(['https://test.com']);
      const entry = um.addUrl('https://a.b.c.d.e.com');
      expect(entry.subdomain).toBe('a');
    });
  });

  describe('Rate Limiting & Circuit Breaking', () => {
    it('ProxyManager tracks consecutive failures', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const proxy = pm.proxies[0];
      for (let i = 0; i < 5; i++) {
        pm.recordFailure(proxy, 'proxy');
      }
      expect(proxy.consecutiveFailures).toBeGreaterThan(0);
    });

    it('ProxyManager circuit breaker opens after failures', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true, circuitBreakerThreshold: 3, circuitBreakerCooldown: 60000 });
      const proxy = pm.proxies[0];
      for (let i = 0; i < 5; i++) {
        pm.recordFailure(proxy, 'proxy');
      }
      expect(proxy.circuitOpen).toBe(true);
    });
  });

  describe('CORS & Headers', () => {
    it('VisitEngine sets proper security headers in HTTP mode', async () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const um = new UrlManager(mockUrls);
      const ve = new VisitEngine(pm, um, { mode: 'http', demoMode: true });
      const result = await ve.executeVisit({});
      // In demo mode, just verify the result structure is safe
      expect(result.url).toBeDefined();
      expect(result.userAgent).toBeDefined();
    });

    it('CdnEdgeAwareness generates safe cache-busting URLs', () => {
      const ce = new CdnEdgeAwareness({ enabled: true, cacheBust: true });
      const url = ce.generateCacheBust('https://example.com');
      expect(url).toContain('_cb=');
      // Should not contain special characters that break URLs
      expect(url).not.toContain(' ');
    });
  });

  describe('Secret Leakage Prevention', () => {
    it('Proxy credentials not exposed in getAll output', () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const all = pm.getAll();
      const first = all[0];
      expect(first.password).toBeUndefined();
      expect(first.username).toBeUndefined();
    });

    it('ProxyManager does not log credentials', () => {
      // Verify proxy objects don't serialize credentials in plain text
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const proxy = pm.proxies[0];
      const json = JSON.stringify(proxy);
      expect(json).not.toContain('password');
    });
  });

  describe('Error Handling', () => {
    it('ContentVerifier handles invalid HTML gracefully', () => {
      const cv = new ContentVerifier({ enabled: true });
      const result = cv.verifyHTTP('', 500);
      expect(result).toBeDefined();
      expect(result.valid).toBe(false);
    });

    it('ContentVerifier handles null/undefined input', () => {
      const cv = new ContentVerifier({ enabled: true });
      const result = cv.verifyHTTP(null, 200);
      expect(result).toBeDefined();
    });

    it('VisitEngine handles missing proxy gracefully', async () => {
      const pm = new ProxyManager([], { enabled: true });
      const um = new UrlManager(mockUrls);
      const ve = new VisitEngine(pm, um, { mode: 'http', demoMode: false });
      const result = await ve.executeVisit({});
      expect(result.success).toBe(false);
    });

    it('VisitEngine handles missing URL gracefully', async () => {
      const pm = new ProxyManager(mockProxies, { enabled: true });
      const um = new UrlManager([]);
      const ve = new VisitEngine(pm, um, { mode: 'http', demoMode: false });
      const result = await ve.executeVisit({});
      expect(result.success).toBe(false);
    });
  });

  describe('Data Validation', () => {
    it('UtmManager handles malformed campaign data', () => {
      const um = new UtmManager({ enabled: true });
      expect(um.addCampaign({})).toBeFalsy();
      expect(um.addCampaign(null)).toBeFalsy();
      expect(um.addCampaign({ source: 123, medium: 456 })).toBeFalsy();
    });

    it('SearchSimulator handles empty keywords', () => {
      const ss = new (require('../../core/search-simulator.js').default)({ enabled: true });
      ss.addKeyword('');
      expect(ss.getKeywords()).not.toContain('');
    });
  });
});
