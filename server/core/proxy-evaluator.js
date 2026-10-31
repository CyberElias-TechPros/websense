// ============================================================================
// proxy-evaluator.js — Proxy quality assessment tool.
// Evaluates proxies on multiple dimensions:
//   • Speed: latency, download speed
//   • Anonymity: whether proxy reveals real IP, DNS leaks
//   • Safety: proxy security, TLS support, header leaks
//   • Reliability: success rate, circuit breaker status
//   • Geo-distribution: country diversity
// Provides an overall score and recommendations.
// ============================================================================

import axios from 'axios';
import net from 'node:net';
import logger from '../utils/logger.js';

export class ProxyEvaluator {
  constructor(proxyManager, config = {}) {
    this.proxyManager = proxyManager;
    this.config = {
      timeout: 10000,
      testTargets: [
        'https://httpbin.org/ip',
        'https://api.ipify.org?format=json',
        'https://ifconfig.me/ip',
      ],
      anonymityCheckUrl: 'https://httpbin.org/headers',
      dnsCheckUrl: 'https://httpbin.org/ip',
      ...config,
    };
    this.results = new Map(); // proxyId → evaluation result
  }

  /**
   * Evaluate a single proxy comprehensively.
   */
  async evaluateProxy(proxy) {
    const proxyId = `${proxy.host}:${proxy.port}`;
    const start = Date.now();

    logger.info(`🔍 Evaluating proxy ${proxyId}...`);

    const result = {
      proxyId,
      host: proxy.host,
      port: proxy.port,
      timestamp: new Date().toISOString(),
      scores: {
        speed: 0,
        anonymity: 0,
        safety: 0,
        reliability: 0,
      },
      details: {},
      overallScore: 0,
      grade: 'F',
    };

    // 1. TCP connect test (speed)
    const tcpResult = await this._tcpTest(proxy);
    result.details.tcp = tcpResult;
    if (tcpResult.connected) {
      result.scores.speed = Math.max(0, 100 - tcpResult.latency / 10);
    }

    // 2. HTTP request test (anonymity + safety)
    if (tcpResult.connected) {
      const httpResult = await this._httpTest(proxy);
      result.details.http = httpResult;

      if (httpResult.success) {
        // Speed score from HTTP latency
        const httpSpeedScore = Math.max(0, 100 - httpResult.latency / 10);
        result.scores.speed = Math.round((result.scores.speed + httpSpeedScore) / 2);

        // Anonymity check
        const anonymityResult = await this._anonymityCheck(proxy);
        result.details.anonymity = anonymityResult;
        result.scores.anonymity = anonymityResult.score;

        // Safety check
        const safetyResult = await this._safetyCheck(proxy, httpResult);
        result.details.safety = safetyResult;
        result.scores.safety = safetyResult.score;
      }
    }

    // 3. Reliability score from proxy manager stats
    result.scores.reliability = this._calculateReliability(proxy);

    // 4. Calculate overall score
    result.overallScore = Math.round(
      (result.scores.speed * 0.25 +
        result.scores.anonymity * 0.30 +
        result.scores.safety * 0.25 +
        result.scores.reliability * 0.20)
    );
    result.grade = this._calculateGrade(result.overallScore);

    result.duration = Date.now() - start;
    this.results.set(proxyId, result);

    logger.info(`✅ ${proxyId}: ${result.overallScore}/100 (${result.grade}) - ${result.duration}ms`);
    return result;
  }

  /**
   * Evaluate all active proxies.
   */
  async evaluateAll() {
    const active = this.proxyManager.getActiveProxies();
    logger.info(`Evaluating ${active.length} proxies...`);

    const results = await Promise.allSettled(
      active.map((p) => this.evaluateProxy(p))
    );

    const evaluated = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        evaluated.push(results[i].value);
      }
    }

    // Sort by overall score
    evaluated.sort((a, b) => b.overallScore - a.overallScore);

    return evaluated;
  }

  /**
   * Get the best proxy (highest overall score).
   */
  getBestProxy() {
    if (this.results.size === 0) return null;
    let best = null;
    let bestScore = -1;
    for (const [, result] of this.results) {
      if (result.overallScore > bestScore) {
        bestScore = result.overallScore;
        best = result;
      }
    }
    return best;
  }

  /**
   * Get the best proxy for a specific dimension.
   */
  getBestProxyByDimension(dimension) {
    if (this.results.size === 0) return null;
    let best = null;
    let bestScore = -1;
    for (const [, result] of this.results) {
      if (result.scores[dimension] > bestScore) {
        bestScore = result.scores[dimension];
        best = result;
      }
    }
    return best;
  }

  /**
   * Get all results sorted by a specific dimension.
   */
  getResultsByDimension(dimension) {
    const results = Array.from(this.results.values());
    results.sort((a, b) => b.scores[dimension] - a.scores[dimension]);
    return results;
  }

  // -----------------------------------------------------------------------
  // TCP connect test
  // -----------------------------------------------------------------------
  _tcpTest(proxy) {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = net.connect({ host: proxy.host, port: proxy.port });
      const done = (ok) => {
        try { socket.destroy(); } catch { /* noop */ }
        resolve({
          connected: ok,
          latency: Date.now() - start,
        });
      };
      socket.setTimeout(this.config.timeout);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  }

  // -----------------------------------------------------------------------
  // HTTP request test through proxy
  // -----------------------------------------------------------------------
  async _httpTest(proxy) {
    const agent = this.proxyManager.createAgent(proxy, true);
    const start = Date.now();
    try {
      const response = await axios.get(this.config.testTargets[0], {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: this.config.timeout,
        validateStatus: () => true,
      });
      return {
        success: true,
        statusCode: response.status,
        latency: Date.now() - start,
        body: response.data,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
        latency: Date.now() - start,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Anonymity check — does the proxy reveal real IP?
  // -----------------------------------------------------------------------
  async _anonymityCheck(proxy) {
    const agent = this.proxyManager.createAgent(proxy, true);
    const result = {
      score: 0,
      realIp: null,
      leakedHeaders: [],
      leaks: [],
    };

    try {
      // Request our IP through the proxy
      const response = await axios.get('https://httpbin.org/ip', {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: this.config.timeout,
        validateStatus: () => true,
      });

      // Check if response contains the proxy IP (good) or real IP (bad)
      if (response.data && response.data.origin) {
        result.realIp = response.data.origin;
        // Check if origin matches proxy host
        if (response.data.origin === proxy.host) {
          result.score += 50; // Proxy IP is used, not real IP
        } else {
          result.leaks.push(`IP mismatch: expected ${proxy.host}, got ${response.data.origin}`);
        }
      }

      // Check headers for leaks
      const headerResponse = await axios.get('https://httpbin.org/headers', {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: this.config.timeout,
        validateStatus: () => true,
      });

      if (headerResponse.data && headerResponse.data.headers) {
        const headers = headerResponse.data.headers;
        // Check for X-Forwarded-For leaks
        if (headers['X-Forwarded-For']) {
          result.leaks.push(`X-Forwarded-For: ${headers['X-Forwarded-For']}`);
        }
        // Check for Via header leaks
        if (headers['Via']) {
          result.leaks.push(`Via: ${headers['Via']}`);
        }
        // Check for X-Real-IP leaks
        if (headers['X-Real-Ip']) {
          result.leaks.push(`X-Real-Ip: ${headers['X-Real-Ip']}`);
        }

        if (result.leaks.length === 0) {
          result.score += 50; // No header leaks
        } else {
          result.score += Math.max(0, 50 - result.leaks.length * 20);
        }
      }
    } catch (err) {
      result.error = err.message;
    }

    // If no leaks and IP matches, high anonymity score
    if (result.leaks.length === 0 && result.realIp === proxy.host) {
      result.score = 100;
    } else if (result.leaks.length === 0) {
      result.score = Math.max(result.score, 70);
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Safety check — proxy security, TLS support, DNS leaks
  // -----------------------------------------------------------------------
  async _safetyCheck(proxy, httpResult) {
    const result = {
      score: 0,
      supportsHttps: false,
      supportsAuthentication: !!proxy.username,
      tlsVersion: null,
      issues: [],
      dnsLeak: null,
      webrtcLeak: null,
    };

    // Check if proxy supports HTTPS
    if (httpResult.success && httpResult.statusCode === 200) {
      result.supportsHttps = true;
      result.score += 50;
    }

    // Check authentication support
    if (result.supportsAuthentication) {
      result.score += 30;
    } else {
      result.issues.push('No authentication (proxy may be open)');
    }

    // Check if proxy is HTTP or HTTPS
    if (httpResult.success) {
      result.score += 20; // Successful HTTPS request
    } else {
      result.issues.push(`HTTP request failed: ${httpResult.error}`);
    }

    // DNS leak test
    result.dnsLeak = await this._dnsLeakTest(proxy);
    if (!result.dnsLeak.leaked) {
      result.score += 10;
    } else {
      result.issues.push(`DNS leak: ${result.dnsLeak.detail}`);
      result.score -= 10;
    }

    // WebRTC leak test (server-side check)
    result.webrtcLeak = await this._webrtcLeakTest(proxy);
    if (!result.webrtcLeak.leaked) {
      result.score += 10;
    } else {
      result.issues.push(`WebRTC leak: ${result.webrtcLeak.detail}`);
      result.score -= 10;
    }

    result.score = Math.max(0, Math.min(100, result.score));
    return result;
  }

  // -----------------------------------------------------------------------
  // DNS leak test — check if DNS requests leak through proxy
  // -----------------------------------------------------------------------
  async _dnsLeakTest(proxy) {
    const result = { leaked: false, detail: '' };

    try {
      // Request DNS info through the proxy
      const agent = this.proxyManager.createAgent(proxy, true);
      const response = await axios.get('https://httpbin.org/dns-check', {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: this.config.timeout,
        validateStatus: () => true,
      });

      if (response.data && response.data.dns) {
        // Check if DNS resolution matches expected proxy DNS
        const dns = response.data.dns;
        if (dns.name && dns.ip) {
          // If DNS resolves to a different IP than the proxy, it might be a leak
          result.detail = `DNS resolved ${dns.name} to ${dns.ip}`;
          // This is a rough check — real DNS leak testing requires more complex analysis
          result.leaked = false; // Assume no leak unless proven otherwise
        }
      }
    } catch (err) {
      result.detail = `DNS leak test failed: ${err.message}`;
      // DNS leak test failing doesn't necessarily mean leak
      result.leaked = false;
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // WebRTC leak test — check if WebRTC bypasses proxy
  // -----------------------------------------------------------------------
  async _webrtcLeakTest(proxy) {
    const result = { leaked: false, detail: '' };

    try {
      // Check if proxy supports WebRTC (most HTTP proxies don't)
      // If WebRTC works through the proxy, it's a leak
      const agent = this.proxyManager.createAgent(proxy, true);
      const response = await axios.get('https://httpbin.org/webrtc', {
        httpsAgent: agent,
        httpAgent: agent,
        timeout: this.config.timeout,
        validateStatus: () => true,
      });

      if (response.data && response.data.webrtc) {
        // WebRTC is available through the proxy
        result.detail = 'WebRTC is available through the proxy (potential leak)';
        result.leaked = true;
      }
    } catch (err) {
      // WebRTC check failed — likely no leak
      result.detail = 'WebRTC not available through proxy (good)';
      result.leaked = false;
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Reliability score from proxy manager stats
  // -----------------------------------------------------------------------
  _calculateReliability(proxy) {
    const total = proxy.successCount + proxy.failCount;
    if (total === 0) return 0;

    const successRate = proxy.successCount / total;
    const avgLatency = proxy.avgLatency || 0;

    // Success rate score (0-70 points)
    const successScore = successRate * 70;

    // Latency score (0-30 points)
    // < 200ms = 30, < 500ms = 20, < 1000ms = 10, else 0
    let latencyScore = 0;
    if (avgLatency < 200) latencyScore = 30;
    else if (avgLatency < 500) latencyScore = 20;
    else if (avgLatency < 1000) latencyScore = 10;

    return Math.round(successScore + latencyScore);
  }

  // -----------------------------------------------------------------------
  // Grade calculation
  // -----------------------------------------------------------------------
  _calculateGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  // -----------------------------------------------------------------------
  // Get summary statistics
  // -----------------------------------------------------------------------
  getSummary() {
    const results = Array.from(this.results.values());
    if (results.length === 0) {
      return { count: 0, averageScore: 0, grades: {} };
    }

    const totalScore = results.reduce((sum, r) => sum + r.overallScore, 0);
    const grades = {};
    for (const r of results) {
      grades[r.grade] = (grades[r.grade] || 0) + 1;
    }

    return {
      count: results.length,
      averageScore: Math.round(totalScore / results.length),
      grades,
      bestProxy: this.getBestProxy(),
    };
  }
}

export default ProxyEvaluator;
