// ============================================================================
// distributed-workers.js — Distributed worker controller.
// Features:
//   • Worker registration & heartbeat
//   • Task queue (distribute visits across workers)
//   • Auto-scaling (spawn/kill workers based on load)
//   • Worker health monitoring
//   • Load balancing across geo-distributed workers
// ============================================================================

import logger from '../utils/logger.js';

export class DistributedWorkerManager {
  constructor(config = {}) {
    this.config = {
      enabled: true,
      heartbeatInterval: 10000, // 10s
      workerTimeout: 30000, // 30s without heartbeat = dead
      maxWorkers: 5,
      minWorkers: 1,
      autoScale: true,
      ...config,
    };
    this.workers = new Map(); // workerId -> { id, host, port, status, load, lastHeartbeat, region }
    this.taskQueue = [];
    this.stats = { tasksAssigned: 0, tasksCompleted: 0, workersSpawned: 0, workersKilled: 0 };
  }

  updateConfig(config) { Object.assign(this.config, config); }

  /**
   * Register a worker.
   */
  registerWorker({ host, port, region = 'default' }) {
    const id = `worker-${host}-${port}`;
    const existing = this.workers.get(id);
    if (existing) {
      existing.status = 'active';
      existing.lastHeartbeat = Date.now();
      return existing;
    }
    const worker = {
      id,
      host,
      port,
      region,
      status: 'active',
      load: 0,
      lastHeartbeat: Date.now(),
      tasksCompleted: 0,
    };
    this.workers.set(id, worker);
    this.stats.workersSpawned++;
    logger.info(`👷 Worker registered: ${id} (${region})`);
    return worker;
  }

  /**
   * Worker heartbeat.
   */
  heartbeat(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastHeartbeat = Date.now();
      worker.status = 'active';
    }
    return worker;
  }

  /**
   * Remove a worker.
   */
  removeWorker(workerId) {
    const removed = this.workers.delete(workerId);
    if (removed) this.stats.workersKilled++;
    return removed;
  }

  /**
   * Assign a task to the least-loaded active worker.
   */
  assignTask(task) {
    const active = [...this.workers.values()].filter((w) => w.status === 'active');
    if (active.length === 0) {
      this.taskQueue.push(task);
      return null;
    }
    // Pick worker with lowest load
    active.sort((a, b) => a.load - b.load);
    const worker = active[0];
    worker.load++;
    this.stats.tasksAssigned++;
    return { worker, task };
  }

  /**
   * Complete a task.
   */
  completeTask(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.load = Math.max(0, worker.load - 1);
      worker.tasksCompleted++;
      this.stats.tasksCompleted++;
    }
  }

  /**
   * Check for dead workers.
   */
  checkDeadWorkers() {
    const now = Date.now();
    for (const [id, worker] of this.workers) {
      if (now - worker.lastHeartbeat > this.config.workerTimeout) {
        worker.status = 'dead';
        logger.warn(`💀 Worker ${id} marked dead (no heartbeat for ${this.config.workerTimeout}ms)`);
      }
    }
  }

  /**
   * Auto-scale: add workers if load is high, remove if low.
   */
  autoScale() {
    if (!this.config.autoScale) return;
    const active = [...this.workers.values()].filter((w) => w.status === 'active');
    const totalLoad = active.reduce((sum, w) => sum + w.load, 0);

    if (totalLoad > active.length * 3 && active.length < this.config.maxWorkers) {
      // Scale up — log intent (actual spawning would need worker nodes)
      logger.info(`📈 Auto-scale: load ${totalLoad} on ${active.length} workers — scaling up requested`);
    }
    if (totalLoad === 0 && active.length > this.config.minWorkers) {
      logger.info(`📉 Auto-scale: no load on ${active.length} workers — scaling down requested`);
    }
  }

  getStats() {
    this.checkDeadWorkers();
    return {
      enabled: this.config.enabled,
      workerCount: this.workers.size,
      activeWorkers: [...this.workers.values()].filter((w) => w.status === 'active').length,
      deadWorkers: [...this.workers.values()].filter((w) => w.status === 'dead').length,
      queuedTasks: this.taskQueue.length,
      ...this.stats,
      autoScale: this.config.autoScale,
      workers: [...this.workers.values()].map((w) => ({
        id: w.id, host: w.host, port: w.port, region: w.region,
        status: w.status, load: w.load, tasksCompleted: w.tasksCompleted,
      })),
    };
  }
}

export default DistributedWorkerManager;
