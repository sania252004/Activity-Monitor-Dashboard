const dot = document.getElementById('statusDot');
const toggle = document.getElementById('toggle');
const eventCountEl = document.getElementById('eventCount');
const screenshotBtn = document.getElementById('screenshotBtn');

function refreshStatus() {
  chrome.runtime.sendMessage({ type: 'get_status' }, (res) => {
    if (!res) return;
    toggle.checked = res.monitoringEnabled;
    dot.classList.toggle('off', !res.monitoringEnabled);
  });
}

function refreshCount() {
  chrome.storage.local.get(['eventCount'], (res) => {
    eventCountEl.textContent = res.eventCount || 0;
  });
}

toggle.addEventListener('change', () => {
  chrome.runtime.sendMessage(
    { type: 'toggle_monitoring', value: toggle.checked },
    () => {
      dot.classList.toggle('off', !toggle.checked);
    }
  );
});

screenshotBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0] ? tabs[0].url : null;
    chrome.runtime.sendMessage({ type: 'capture_screenshot', url }, () => {
      screenshotBtn.textContent = 'Captured ✓';
      setTimeout(() => (screenshotBtn.textContent = 'Capture screenshot now'), 1200);
    });
  });
});

refreshStatus();
refreshCount();
setInterval(refreshCount, 2000);
