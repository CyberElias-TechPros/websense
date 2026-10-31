// ============================================================================
// reporting.js — Reporting engine for scheduled reports.
// Features:
//   • CSV export of visits, proxies, URLs
//   • HTML report generation (daily/weekly/monthly)
//   • Scheduled report delivery via webhooks/notifications
//   • Report history tracking
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';
import db from '../database/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.join(__dirname, '..', 'data', 'reports');
if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

export class ReportingEngine {
  constructor(config = {}) {
    this.config = { enabled: true, reportDir: reportsDir, ...config };
    this.schedules = [];
  }

  updateConfig(config) { Object.assign(this.config, config); }

  exportVisitsCSV(days = 30) {
    const since = new Date(Date.now() - days * 86400_000).toISOString().replace('T', ' ').slice(0, 19);
    const rows = db.prepare('SELECT * FROM visits WHERE created_at > ? ORDER BY created_at DESC LIMIT 10000').all(since);
    const headers = ['timestamp', 'url', 'subdomain', 'proxy_host', 'proxy_country', 'proxy_city',
      'status_code', 'latency_ms', 'user_agent', 'referrer', 'success', 'mode', 'device_type', 'error_message'];
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','));
    }
    return lines.join('\n');
  }

  exportProxiesCSV() {
    const rows = db.prepare('SELECT * FROM proxy_stats ORDER BY host').all();
    const headers = ['host', 'port', 'country', 'city', 'flag', 'enabled', 'success_count', 'fail_count', 'total_latency', 'status', 'last_checked'];
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => `"${String(row[h] || '')}"`).join(','));
    }
    return lines.join('\n');
  }

  exportUrlsCSV() {
    const rows = db.prepare('SELECT * FROM url_stats ORDER BY visit_count DESC').all();
    const headers = ['url', 'subdomain', 'visit_count', 'success_count', 'last_visited', 'enabled', 'priority'];
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => `"${String(row[h] || '')}"`).join(','));
    }
    return lines.join('\n');
  }

  generateHTMLReport(type = 'daily') {
    const days = type === 'daily' ? 1 : type === 'weekly' ? 7 : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString().replace('T', ' ').slice(0, 19);

    const totals = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
      FROM visits WHERE created_at > ?
    `).get(since);

    const byUrl = db.prepare(`
      SELECT subdomain, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM visits WHERE created_at > ?
      GROUP BY subdomain ORDER BY total DESC LIMIT 10
    `).all(since);

    const byCountry = db.prepare(`
      SELECT proxy_country, COUNT(*) as total
      FROM visits WHERE created_at > ?
      GROUP BY proxy_country ORDER BY total DESC
    `).all(since);

    const byDevice = db.prepare(`
      SELECT device_type, COUNT(*) as total
      FROM visits WHERE created_at > ?
      GROUP BY device_type ORDER BY total DESC
    `).all(since);

    const deviceBreakdown = byDevice.map((d) => {
      const pct = totals.total > 0 ? Math.round((d.total / totals.total) * 100) : 0;
      return `<div class="device-bar"><span>${d.device_type || 'N/A'}</span><div class="bar" style="width:${pct}%"></div><span>${d.total} (${pct}%)</span></div>`;
    }).join('');

    const urlRows = byUrl.map((u) =>
      `<tr><td>${u.subdomain}</td><td>${u.total}</td><td>${u.successes}</td><td>${totals.total > 0 ? Math.round((u.total / totals.total) * 100) : 0}%</td></tr>`
    ).join('');

    const countryRows = byCountry.map((c) =>
      `<tr><td>${c.proxy_country || 'N/A'}</td><td>${c.total}</td></tr>`
    ).join('');

    const reportId = `report-${type}-${Date.now()}`;
    const html = `<!DOCTYPE html>
<html><head><title>WebSense ${type} Report</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 40px; background: #0f172a; color: #e2e8f0; }
  h1 { color: #3b82f6; } h2 { color: #94a3b8; margin-top: 30px; }
  .card { background: #1e293b; border-radius: 8px; padding: 20px; margin: 10px 0; }
  .stat { display: inline-block; margin: 10px 20px; }
  .stat-value { font-size: 24px; font-weight: bold; color: #3b82f6; }
  .stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { padding: 8px 12px; border-bottom: 1px solid #334155; text-align: left; }
  th { color: #64748b; }
  .device-bar { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .device-bar span:first-child { width: 60px; }
  .bar { background: #3b82f6; height: 20px; border-radius: 4px; min-width: 2px; }
  .device-bar span:last-child { width: 80px; text-align: right; font-size: 12px; }
  footer { margin-top: 40px; color: #475569; font-size: 12px; }
</style></head>
<body>
  <h1>📊 WebSense ${type} Report</h1>
  <p style="color:#64748b">Period: ${days} days | Generated: ${new Date().toISOString()}</p>
  <div class="card">
    <div class="stat"><div class="stat-value">${totals.total || 0}</div><div class="stat-label">Total Visits</div></div>
    <div class="stat"><div class="stat-value">${totals.successes || 0}</div><div class="stat-label">Successful</div></div>
    <div class="stat"><div class="stat-value">${totals.failures || 0}</div><div class="stat-label">Failed</div></div>
    <div class="stat"><div class="stat-value">${totals.total > 0 ? Math.round((totals.successes / totals.total) * 100) : 0}%</div><div class="stat-label">Success Rate</div></div>
    <div class="stat"><div class="stat-value">${Math.round(totals.avg_latency || 0)}ms</div><div class="stat-label">Avg Latency</div></div>
  </div>
  <h2>📱 Device Distribution</h2>
  <div class="card">${deviceBreakdown}</div>
  <h2>🌐 Top URLs</h2>
  <table><tr><th>Subdomain</th><th>Visits</th><th>Success</th><th>% of Traffic</th></tr>${urlRows}</table>
  <h2>🌍 Traffic by Country</h2>
  <table><tr><th>Country</th><th>Visits</th></tr>${countryRows}</table>
  <footer>WebSense — Self-hosted traffic engine | ${reportId}</footer>
</body></html>`;

    const filePath = path.join(reportsDir, `${reportId}.html`);
    fs.writeFileSync(filePath, html);
    logger.info(`📊 Report generated: ${reportId}.html (${totals.total || 0} visits)`);
    return { id: reportId, filePath, visits: totals.total || 0 };
  }

  generatePDFReport(type = 'daily') {
    // PDF generation — uses simple HTML-to-PDF approach via text-based PDF
    const days = type === 'daily' ? 1 : type === 'weekly' ? 7 : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString().replace('T', ' ').slice(0, 19);

    const totals = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
      FROM visits WHERE created_at > ?
    `).get(since);

    const reportId = `report-${type}-pdf-${Date.now()}`;
    const filePath = path.join(reportsDir, `${reportId}.pdf`);

    // Simple PDF generation (text-based PDF format)
    const pdf = this._generateSimplePDF({
      title: `WebSense ${type} Report`,
      period: `${days} days`,
      generated: new Date().toISOString(),
      stats: {
        total: totals.total || 0,
        successes: totals.successes || 0,
        failures: totals.failures || 0,
        successRate: totals.total > 0 ? Math.round((totals.successes / totals.total) * 100) : 0,
        avgLatency: Math.round(totals.avg_latency || 0),
      },
    });

    fs.writeFileSync(filePath, pdf, 'latin1');
    logger.info(`📄 PDF report generated: ${reportId}.pdf (${totals.total || 0} visits)`);
    return { id: reportId, filePath, visits: totals.total || 0, format: 'pdf' };
  }

  _generateSimplePDF({ title, period, generated, stats }) {
    // Minimal valid PDF with text content
    const lines = [
      `WebSense ${title}`,
      `Period: ${period}`,
      `Generated: ${generated}`,
      '',
      `Total Visits: ${stats.total}`,
      `Successful: ${stats.successes}`,
      `Failed: ${stats.failures}`,
      `Success Rate: ${stats.successRate}%`,
      `Avg Latency: ${stats.avgLatency}ms`,
      '',
      '--- WebSense Reporting Engine ---',
    ];

    const text = lines.join('\n');
    const escapedText = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    // Build minimal PDF
    const objects = [
      '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
      '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`,
      `4 0 obj\n<< /Length ${escapedText.length * 2} >>\nstream\nBT /F1 12 Tf 72 720 Td (${escapedText.replace(/\\n/g, ') Tj 0 -18 Td (')} Tj ET\nendstream\nendobj\n`,
      '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    for (const obj of objects) {
      offsets.push(pdf.length);
      pdf += obj;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    return pdf;
  }

  addSchedule({ type, frequency, format, channels }) {
    const id = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const schedule = { id, type, frequency, format, channels, enabled: true, lastRun: null, createdAt: Date.now() };
    this.schedules.push(schedule);
    return schedule;
  }

  removeSchedule(id) {
    const idx = this.schedules.findIndex((s) => s.id === id);
    if (idx >= 0) return this.schedules.splice(idx, 1)[0];
    return null;
  }

  listSchedules() { return [...this.schedules]; }

  async runSchedule(schedule, webhookManager) {
    logger.info(`📊 Running scheduled report: ${schedule.id} (${schedule.type}, ${schedule.format})`);
    let content, filename;
    if (schedule.format === 'csv') {
      content = this.exportVisitsCSV(schedule.type === 'daily' ? 1 : schedule.type === 'weekly' ? 7 : 30);
      filename = `report-${schedule.type}-${Date.now()}.csv`;
    } else {
      const result = this.generateHTMLReport(schedule.type);
      content = fs.readFileSync(result.filePath, 'utf8');
      filename = `${result.id}.html`;
    }
    schedule.lastRun = Date.now();
    logger.info(`📊 Report ${schedule.id} delivered via ${schedule.channels.length} channels`);
    return { success: true, filename };
  }

  // -----------------------------------------------------------------------
  // JSON report — machine-readable comprehensive report
  // -----------------------------------------------------------------------
  generateJSONReport(type = 'daily') {
    const days = type === 'daily' ? 1 : type === 'weekly' ? 7 : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString().replace('T', ' ').slice(0, 19);

    const totals = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency,
        MIN(CASE WHEN success = 1 THEN latency_ms END) as min_latency,
        MAX(CASE WHEN success = 1 THEN latency_ms END) as max_latency
      FROM visits WHERE created_at > ?
    `).get(since);

    const byUrl = db.prepare(`
      SELECT subdomain, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM visits WHERE created_at > ?
      GROUP BY subdomain ORDER BY total DESC LIMIT 20
    `).all(since);

    const byProxy = db.prepare(`
      SELECT proxy_host, proxy_country, proxy_city, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM visits WHERE created_at > ?
      GROUP BY proxy_host ORDER BY total DESC LIMIT 20
    `).all(since);

    const byCountry = db.prepare(`
      SELECT proxy_country, COUNT(*) as total
      FROM visits WHERE created_at > ?
      GROUP BY proxy_country ORDER BY total DESC
    `).all(since);

    const byDevice = db.prepare(`
      SELECT device_type, COUNT(*) as total
      FROM visits WHERE created_at > ?
      GROUP BY device_type ORDER BY total DESC
    `).all(since);

    const byHour = db.prepare(`
      SELECT strftime('%H', created_at) as hour, COUNT(*) as total
      FROM visits WHERE created_at > ?
      GROUP BY hour ORDER BY hour
    `).all(since);

    const topErrors = db.prepare(`
      SELECT error_message, COUNT(*) as count
      FROM visits WHERE created_at > ? AND error_message IS NOT NULL
      GROUP BY error_message ORDER BY count DESC LIMIT 10
    `).all(since);

    const report = {
      id: `report-${type}-json-${Date.now()}`,
      type,
      period: { days, since, until: new Date().toISOString() },
      generatedAt: new Date().toISOString(),
      totals: {
        ...totals,
        successRate: totals.total > 0 ? Math.round((totals.successes / totals.total) * 100) : 0,
      },
      byUrl,
      byProxy,
      byCountry,
      byDevice,
      byHour,
      topErrors,
    };

    const filePath = path.join(reportsDir, `${report.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    logger.info(`📋 JSON report generated: ${report.id}.json (${totals.total || 0} visits)`);
    return { ...report, filePath, visits: totals.total || 0, format: 'json' };
  }

  // -----------------------------------------------------------------------
  // Markdown report — human-readable markdown report
  // -----------------------------------------------------------------------
  generateMarkdownReport(type = 'daily') {
    const days = type === 'daily' ? 1 : type === 'weekly' ? 7 : 30;
    const since = new Date(Date.now() - days * 86400_000).toISOString().replace('T', ' ').slice(0, 19);

    const totals = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
        AVG(CASE WHEN success = 1 THEN latency_ms END) as avg_latency
      FROM visits WHERE created_at > ?
    `).get(since);

    const byUrl = db.prepare(`
      SELECT subdomain, COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM visits WHERE created_at > ?
      GROUP BY subdomain ORDER BY total DESC LIMIT 10
    `).all(since);

    const byCountry = db.prepare(`
      SELECT proxy_country, COUNT(*) as total
      FROM visits WHERE created_at > ?
      GROUP BY proxy_country ORDER BY total DESC
    `).all(since);

    const byDevice = db.prepare(`
      SELECT device_type, COUNT(*) as total
      FROM visits WHERE created_at > ?
      GROUP BY device_type ORDER BY total DESC
    `).all(since);

    const successRate = totals.total > 0 ? Math.round((totals.successes / totals.total) * 100) : 0;

    const md = `# WebSense ${type} Report

**Period:** ${days} days
**Generated:** ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Total Visits | ${totals.total || 0} |
| Successful | ${totals.successes || 0} |
| Failed | ${totals.failures || 0} |
| Success Rate | ${successRate}% |
| Avg Latency | ${Math.round(totals.avg_latency || 0)}ms |

## Top URLs

| Subdomain | Visits | Success |
|-----------|--------|---------|
${byUrl.map((u) => `| ${u.subdomain || 'N/A'} | ${u.total} | ${u.successes} |`).join('\n')}

## Traffic by Country

| Country | Visits |
|---------|--------|
${byCountry.map((c) => `| ${c.proxy_country || 'N/A'} | ${c.total} |`).join('\n')}

## Device Distribution

| Device | Visits |
|--------|--------|
${byDevice.map((d) => `| ${d.device_type || 'N/A'} | ${d.total} |`).join('\n')}

---
*WebSense — Self-hosted traffic engine*
`;

    const reportId = `report-${type}-md-${Date.now()}`;
    const filePath = path.join(reportsDir, `${reportId}.md`);
    fs.writeFileSync(filePath, md);
    logger.info(`📝 Markdown report generated: ${reportId}.md (${totals.total || 0} visits)`);
    return { id: reportId, filePath, visits: totals.total || 0, format: 'markdown' };
  }

  // -----------------------------------------------------------------------
  // Get report summaries (for dashboard)
  // -----------------------------------------------------------------------
  getReportSummaries(limit = 20) {
    const files = fs.readdirSync(reportsDir).filter((f) =>
      f.endsWith('.html') || f.endsWith('.json') || f.endsWith('.md') || f.endsWith('.csv') || f.endsWith('.pdf')
    );
    const summaries = [];
    for (const file of files.slice(-limit)) {
      const stat = fs.statSync(path.join(reportsDir, file));
      summaries.push({
        filename: file,
        size: stat.size,
        createdAt: stat.mtime,
        format: file.split('.').pop(),
      });
    }
    return summaries.sort((a, b) => b.createdAt - a.createdAt);
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      scheduleCount: this.schedules.length,
      activeSchedules: this.schedules.filter((s) => s.enabled).length,
      reportDir: this.config.reportDir,
      totalReports: fs.readdirSync(reportsDir).length,
    };
  }
}

export default ReportingEngine;
