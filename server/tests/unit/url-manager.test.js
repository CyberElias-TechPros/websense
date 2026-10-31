// ============================================================================
// url-manager.test.js — Unit tests for URL management & weighting.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import UrlManager from '../../core/url-manager.js';

const mockUrls = [
  'https://example1.com',
  'https://example2.com',
  'https://example3.com',
];

describe('UrlManager', () => {
  let um;

  beforeEach(() => {
    um = new UrlManager(mockUrls);
  });

  describe('constructor', () => {
    it('should load all URLs', () => {
      expect(um.urls.length).toBe(3);
    });

    it('should extract subdomains', () => {
      expect(um.urls[0].subdomain).toBe('example1');
    });
  });

  describe('getRandom()', () => {
    it('should return a random URL', () => {
      const entry = um.getRandom();
      expect(entry).toBeDefined();
      expect(entry.url).toBeDefined();
    });

    it('should skip disabled URLs', () => {
      um.urls[0].enabled = false;
      const entry = um.getRandom();
      expect(entry.enabled).toBe(true);
    });
  });

  describe('addUrl()', () => {
    it('should add a new URL', () => {
      const entry = um.addUrl('https://newsite.com');
      expect(entry).toBeDefined();
      expect(um.urls.length).toBe(4);
    });

    it('should return null for duplicate URL', () => {
      const entry = um.addUrl('https://example1.com');
      expect(entry).toBeNull();
    });

    it('should extract subdomain correctly', () => {
      const entry = um.addUrl('https://sub.domain.com');
      expect(entry.subdomain).toBe('sub');
    });
  });

  describe('removeUrl()', () => {
    it('should remove a URL', () => {
      const removed = um.removeUrl('https://example1.com');
      expect(removed).toBe(true);
      expect(um.urls.length).toBe(2);
    });

    it('should return false for non-existent URL', () => {
      expect(um.removeUrl('https://nonexistent.com')).toBe(false);
    });
  });

  describe('setPriority()', () => {
    it('should set priority for URL', () => {
      um.setPriority('https://example1.com', 9);
      const url = um.urls.find(u => u.url === 'https://example1.com');
      expect(url.priority).toBe(9);
    });

    it('should clamp priority to 1-10', () => {
      um.setPriority('https://example1.com', 99);
      const url = um.urls.find(u => u.url === 'https://example1.com');
      expect(url.priority).toBe(10);
      um.setPriority('https://example1.com', -5);
      expect(url.priority).toBe(1);
    });
  });

  describe('toggleUrl()', () => {
    it('should toggle URL enabled state', () => {
      um.toggleUrl('https://example1.com', false);
      const url = um.urls.find(u => u.url === 'https://example1.com');
      expect(url.enabled).toBe(false);
    });
  });

  describe('recordVisit()', () => {
    it('should record visit for URL', () => {
      um.recordVisit('https://example1.com', true);
      const url = um.urls.find(u => u.url === 'https://example1.com');
      expect(url.visitCount).toBeGreaterThan(0);
    });
  });

  describe('getAll()', () => {
    it('should return all URLs', () => {
      const all = um.getAll();
      expect(all.length).toBe(3);
    });
  });

  describe('getStats()', () => {
    it('should return URL statistics', () => {
      const stats = um.getStats();
      expect(stats).toBeDefined();
      expect(stats.total).toBe(3);
    });
  });
});
