# Visual Activity Monitor — Chrome Extension + Backend

A Chrome extension that tracks browsing activity (page visits, active time,
clicks, scroll depth, and on-demand screenshots) and stores it in a database
via a small backend API. Built for demonstrating browser-extension + agent +
data-pipeline skills.

- **content.js** — injected into every page. Listens for clicks and scroll,
  and reports *structural* metadata only (tag name, id/class, short visible
  text, scroll %). It never reads input field values, so passwords and typed
  text are never captured.
- **background.js** — the extension's service worker. Tracks tab
  activation/navigation to log page visits, measures how long each tab stays
  active/focused, batches all events, and flushes them to the backend every
  5 seconds. Also handles on-demand screenshot capture via
  `chrome.tabs.captureVisibleTab`.
- **popup.html/js** — lets the user see whether monitoring is on, toggle it
  off, see a live event count, and trigger a screenshot.
- **server.js** — Express server backed by SQLite (via `better-sqlite3`).
  Two write endpoints (`/api/activity` for batched events, `/api/screenshot`
  for images) and two read endpoints (`/api/activities`, `/api/stats`) used
  by the dashboard.
- **public/dashboard.html** — a live view of what's been logged, useful for
  demoing.

## Setup

### 1. Backend

```bash
cd server
npm install
npm start
```

This starts the API on `http://localhost:3000` and creates `activity.db`
(SQLite file) automatically. Open `http://localhost:3000/dashboard.html` to
watch events arrive in real time.

### 2. Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Browse normally — open the popup to confirm monitoring is on and to see
   the event counter increase; watch `dashboard.html` update live.

## Data captured

| Event type        | Fields                                      |
|--------------------|----------------------------------------------|
| `page_visit`       | url, title, tabId, timestamp                 |
| `tab_active_time`  | url, tabId, durationMs                       |
| `click`            | url, element tag/id/class/short text, x/y    |
| `scroll`           | url, scroll percentage                       |
| `screenshot`       | url, PNG image (on demand only)              |

No password fields, form input values, or keystrokes are ever captured.

## A note on scope

This is built as a **personal/local monitoring tool** — the user installs it
on their own browser and can see exactly what's tracked (visible extension
icon, working on/off toggle, no hidden background capture). If this is ever
adapted for monitoring *other people's* devices (e.g. an employee-monitoring
product), it should add explicit disclosure/consent flows and admin controls
before collecting any data — that's usually a strong signal to interviewers
that you're thinking about the ethics and legality of monitoring tools, not
just the mechanics.
