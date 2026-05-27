const express = require('express');
const router = express.Router();
const markAgent = require('../services/markAgent');
const mariaAgent = require('../services/mariaAgent');
const auth = require('../services/auth');
const db = require('../db');

router.get('/mark/status', async (req, res) => {
  try {
    res.json({
      running: markAgent.isRunning(),
      latest: await markAgent.latestRun(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/mark/run', async (req, res) => {
  if (markAgent.isRunning()) {
    return res.status(409).json({ error: 'Mark agent is already running' });
  }

  res.status(202).json({ success: true, message: 'Mark agent started' });

  markAgent.run()
    .catch(err => console.error('[Mark Agent] error:', err.message));
});

router.get('/maria/status', async (req, res) => {
  try {
    res.json({
      running: mariaAgent.isRunning(),
      latest: await mariaAgent.latestRun(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/maria/analysis', async (req, res) => {
  try {
    res.json(await mariaAgent.getAnalysis());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/maria/run', async (req, res) => {
  if (mariaAgent.isRunning()) {
    return res.status(409).json({ error: 'Maria agent is already running' });
  }

  res.status(202).json({ success: true, message: 'Maria agent started' });

  mariaAgent.run()
    .catch(err => console.error('[Maria Agent] error:', err.message));
});

router.get('/reports', auth.requireAdmin, async (req, res) => {
  try {
    const agent = String(req.query.agent || 'all').toLowerCase();
    const dateFrom = req.query.date_from ? new Date(String(req.query.date_from)) : null;
    const dateTo = req.query.date_to ? new Date(String(req.query.date_to)) : null;
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);

    const where = [];
    const params = [];

    if (agent !== 'all') {
      where.push('ar.agent_id = ?');
      params.push(agent);
    }
    if (dateFrom && !Number.isNaN(dateFrom.getTime())) {
      where.push('ar.created_at >= ?');
      params.push(dateFrom.toISOString());
    }
    if (dateTo && !Number.isNaN(dateTo.getTime())) {
      const inclusiveEnd = new Date(dateTo);
      inclusiveEnd.setHours(23, 59, 59, 999);
      where.push('ar.created_at <= ?');
      params.push(inclusiveEnd.toISOString());
    }

    const reportWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const reports = await db.all(`
      SELECT ar.id, ar.agent_id, ar.report_type, ar.run_id, ar.payload_json, ar.created_at,
             r.status AS run_status, r.message AS run_message, r.started_at, r.finished_at, r.rows_created
      FROM agent_reports ar
      LEFT JOIN agent_runs r ON r.id = ar.run_id
      ${reportWhere}
      ORDER BY ar.created_at DESC
      LIMIT ${limit}
    `, params);

    const runWhere = [];
    const runParams = [];
    if (agent !== 'all') {
      runWhere.push('agent_id = ?');
      runParams.push(agent);
    }
    if (dateFrom && !Number.isNaN(dateFrom.getTime())) {
      runWhere.push('started_at >= ?');
      runParams.push(dateFrom.toISOString());
    }
    if (dateTo && !Number.isNaN(dateTo.getTime())) {
      const inclusiveEnd = new Date(dateTo);
      inclusiveEnd.setHours(23, 59, 59, 999);
      runWhere.push('started_at <= ?');
      runParams.push(inclusiveEnd.toISOString());
    }
    const runWhereSql = runWhere.length ? `WHERE ${runWhere.join(' AND ')}` : '';
    const runs = await db.all(`
      SELECT id, agent_id, status, message, rows_created, started_at, finished_at
      FROM agent_runs
      ${runWhereSql}
      ORDER BY started_at DESC
      LIMIT ${limit}
    `, runParams);

    const parsedReports = reports.map((r) => {
      let payload = null;
      try {
        payload = JSON.parse(r.payload_json);
      } catch {
        payload = null;
      }
      return {
        id: r.id,
        agent_id: r.agent_id,
        report_type: r.report_type,
        run_id: r.run_id,
        created_at: r.created_at,
        run_status: r.run_status,
        run_message: r.run_message,
        started_at: r.started_at,
        finished_at: r.finished_at,
        rows_created: r.rows_created,
        payload,
      };
    });

    const summary = {
      total_reports: parsedReports.length,
      total_runs: runs.length,
      by_agent: ['mark', 'maria', 'steve'].map((id) => ({
        id,
        reports: parsedReports.filter((r) => r.agent_id === id).length,
        runs: runs.filter((r) => r.agent_id === id).length,
        last_run: runs.find((r) => r.agent_id === id) || null,
      })),
    };

    res.json({
      filters: {
        agent,
        date_from: req.query.date_from || '',
        date_to: req.query.date_to || '',
        limit,
      },
      summary,
      runs,
      reports: parsedReports,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
