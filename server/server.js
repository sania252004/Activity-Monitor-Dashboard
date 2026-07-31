// server.js — receives events from the Chrome extension and stores them in SQLite.
// Swap `better-sqlite3` for a `pg` connection later if you want Postgres instead —
// the insert/query shape stays the same.

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = 3000;
const db = new Database(path.join(__dirname, 'activity.db'));

app.use(cors());
app.use(express.json({ limit: '10mb' })); // screenshots are base64, need a larger limit
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Schema ----------

db.exec(`
  CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    type TEXT NOT NULL,
    url TEXT,
    tab_id INTEGER,
    title TEXT,
    duration_ms INTEGER,
    meta TEXT,
    created_at TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    url TEXT,
    image BLOB,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_events_type ON activity_events(type);
  CREATE INDEX IF NOT EXISTS idx_events_session ON activity_events(session_id);
`);

const insertEvent = db.prepare(`
  INSERT INTO activity_events (session_id, type, url, tab_id, title, duration_ms, meta, created_at)
  VALUES (@sessionId, @type, @url, @tabId, @title, @durationMs, @meta, @timestamp)
`);

const insertScreenshot = db.prepare(`
  INSERT INTO screenshots (session_id, url, image) VALUES (?, ?, ?)
`);

// ---------- Routes ----------

// Batched event ingestion (page visits, clicks, scroll, active-time)
app.post('/api/activity', (req, res) => {
  const { events } = req.body;
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: 'events must be an array' });
  }

  const insertMany = db.transaction((rows) => {
    for (const ev of rows) {
      insertEvent.run({
        sessionId: ev.sessionId || null,
        type: ev.type,
        url: ev.url || null,
        tabId: ev.tabId || null,
        title: ev.title || null,
        durationMs: ev.durationMs || null,
        meta: ev.meta ? JSON.stringify(ev.meta) : null,
        timestamp: ev.timestamp || new Date().toISOString()
      });
    }
  });

  insertMany(events);
  res.json({ ok: true, inserted: events.length });
});

// Screenshot upload (kept separate from the batch endpoint — larger payload)
app.post('/api/screenshot', (req, res) => {
  const { sessionId, url, image } = req.body;
  if (!image) return res.status(400).json({ error: 'image (base64 data URL) required' });
  const buffer = Buffer.from(image.split(',')[1], 'base64');
  insertScreenshot.run(sessionId || null, url || null, buffer);
  res.json({ ok: true });
});

// Simple read API for a dashboard / debugging
app.get('/api/activities', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const rows = db.prepare(`
    SELECT id, session_id, type, url, title, duration_ms, meta, created_at
    FROM activity_events
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
  res.json(rows);
});

app.get('/api/stats', (req, res) => {
  const byType = db.prepare(`
    SELECT type, COUNT(*) as count FROM activity_events GROUP BY type
  `).all();
  const totalEvents = db.prepare(`SELECT COUNT(*) as c FROM activity_events`).get().c;
  const totalSessions = db.prepare(`SELECT COUNT(DISTINCT session_id) as c FROM activity_events`).get().c;
  res.json({ totalEvents, totalSessions, byType });
});

app.listen(PORT, () => {
  console.log(`Activity Monitor backend running on http://localhost:${PORT}`);
});
