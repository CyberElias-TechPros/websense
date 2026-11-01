// ============================================================================
// multi-project.js — Multi-project/campaign support.
// Features:
//   • Multiple campaigns with separate URL sets
//   • Per-project proxy allocation
//   • Per-project scheduling & analytics
//   • Budget tracking
//   • Project isolation
// ============================================================================

import logger from '../utils/logger.js';

export class MultiProjectManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      maxProjects: 10,
      ...config,
    };
    this.projects = new Map(); // projectId -> { id, name, urls, proxyCount, enabled, budget, spent, stats }
  }

  updateConfig(config) { Object.assign(this.config, config); }

  createProject({ name, urls, proxyCount = 0, budget = 0 }) {
    if (this.projects.size >= this.config.maxProjects) return null;
    if (!name) return null;
    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const project = {
      id,
      name,
      urls: Array.isArray(urls) ? urls : [urls],
      proxyCount,
      enabled: true,
      budget,
      spent: 0,
      stats: { visits: 0, successes: 0, failures: 0 },
      createdAt: Date.now(),
    };
    this.projects.set(id, project);
    return project;
  }

  removeProject(id) {
    return this.projects.delete(id);
  }

  toggleProject(id, enabled) {
    const project = this.projects.get(id);
    if (project) project.enabled = !!enabled;
    return project;
  }

  updateProject(id, updates) {
    const project = this.projects.get(id);
    if (!project) return null;
    Object.assign(project, updates);
    return project;
  }

  /**
   * Get active projects (for scheduler to pick from).
   */
  getActiveProjects() {
    return [...this.projects.values()].filter((p) => p.enabled);
  }

  /**
   * Pick a random active project.
   */
  pickProject() {
    const active = this.getActiveProjects();
    if (active.length === 0) return null;
    return active[Math.floor(Math.random() * active.length)];
  }

  /**
   * Record a visit for a project.
   */
  recordVisit(projectId, { success, cost = 0 }) {
    const project = this.projects.get(projectId);
    if (!project) return;
    project.stats.visits++;
    if (success) project.stats.successes++;
    else project.stats.failures++;
    project.spent += cost;
  }

  /**
   * Get project stats.
   */
  getProjectStats(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return null;
    return {
      ...project,
      successRate: project.stats.visits > 0 ? Math.round((project.stats.successes / project.stats.visits) * 100) : 0,
      budgetRemaining: Math.max(0, project.budget - project.spent),
    };
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      projectCount: this.projects.size,
      activeProjects: this.getActiveProjects().length,
      projects: [...this.projects.values()].map((p) => ({
        id: p.id, name: p.name, enabled: p.enabled,
        urls: p.urls.length, stats: p.stats, spent: p.spent, budget: p.budget,
      })),
    };
  }
}

export default MultiProjectManager;
