// background.js — Manifest V3 service worker
// Responsible for: tab lifecycle tracking, active-time measurement,
// receiving events from content scripts, batching, and posting to the backend.

const API_BASE = 'http://localhost:3000/api';
const BATCH_INTERVAL_MS = 5000;
const SESSION_ID = crypto.randomUUID(); // one id per browser session (service worker lifetime)

let eventQueue = [];
let monitoringEnabled = true;
let activeTabId = null;
let activeTabStartedAt = null;
let activeTabUrl = null;

// ---------- Storage / settings ----------

chrome.storage.local.get(['monitoringEnabled'], (res) => {
  monitoringEnabled = res.monitoringEnabled !== false; // default ON
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.monitoringEnabled) {
    monitoringEnabled = changes.monitoringEnabled.newValue;
  }
});

// ---------- Helpers ----------

function enqueue(event) {
  if (!monitoringEnabled) return;
  eventQueue.push({
    ...event,
    sessionId: SESSION_ID,
    timestamp: new Date().toISOString()
  });
  // also keep a rolling local count for the popup UI
  chrome.storage.local.get(['eventCount'], (res) => {
    chrome.storage.local.set({ eventCount: (res.eventCount || 0) + 1 });
  });
}

function closeOutActiveTabTime() {
  if (activeTabId !== null && activeTabStartedAt !== null) {
    const durationMs = Date.now() - activeTabStartedAt;
    if (durationMs > 500) { // ignore noise
      enqueue({
        type: 'tab_active_time',
        tabId: activeTabId,
        url: activeTabUrl,
        durationMs
      });
    }
  }
}

function setActiveTab(tabId, url) {
  closeOutActiveTabTime();
  activeTabId = tabId;
  activeTabUrl = url;
  activeTabStartedAt = Date.now();
}

async function flushQueue() {
  if (eventQueue.length === 0) return;
  const batch = eventQueue;
  eventQueue = [];
  try {
    const res = await fetch(`${API_BASE}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: batch })
    });
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
  } catch (err) {
    // backend unreachable — put events back so we don't lose them
    console.warn('Activity Monitor: flush failed, requeueing', err);
    eventQueue = batch.concat(eventQueue);
  }
}

setInterval(flushQueue, BATCH_INTERVAL_MS);

// ---------- Tab lifecycle events ----------

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    setActiveTab(tabId, tab.url);
    enqueue({ type: 'page_visit', tabId, url: tab.url, title: tab.title });
  } catch (e) { /* tab may have closed already */ }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    setActiveTab(tabId, tab.url);
    enqueue({ type: 'page_visit', tabId, url: tab.url, title: tab.title });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    closeOutActiveTabTime();
    activeTabId = null;
    activeTabStartedAt = null;
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // browser lost focus entirely — stop the active-time clock
    closeOutActiveTabTime();
    activeTabStartedAt = null;
  } else {
    activeTabStartedAt = Date.now();
  }
});

// ---------- Messages from content scripts / popup ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'click' || message.type === 'scroll') {
    enqueue({
      type: message.type,
      url: sender.tab ? sender.tab.url : message.url,
      tabId: sender.tab ? sender.tab.id : null,
      meta: message.meta || {}
    });
  }

  if (message.type === 'capture_screenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      enqueue({ type: 'screenshot', url: message.url, meta: { size: dataUrl.length } });
      // Send the image straight to the backend (separate endpoint, not batched — it's large)
      fetch(`${API_BASE}/screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: SESSION_ID, url: message.url, image: dataUrl })
      }).catch((e) => console.warn('screenshot upload failed', e));
      sendResponse({ ok: true });
    });
    return true; // keep the message channel open for the async response
  }

  if (message.type === 'get_status') {
    sendResponse({ monitoringEnabled });
  }

  if (message.type === 'toggle_monitoring') {
    monitoringEnabled = message.value;
    chrome.storage.local.set({ monitoringEnabled });
    sendResponse({ monitoringEnabled });
  }
});
