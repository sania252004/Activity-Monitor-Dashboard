// content.js — injected into every page.
// Captures interaction *metadata* only. Deliberately never reads input values,
// so passwords / form contents are never logged.

(function () {
  function describeElement(el) {
    if (!el) return null;
    return {
      tag: el.tagName ? el.tagName.toLowerCase() : null,
      id: el.id || null,
      classes: el.className && typeof el.className === 'string' ? el.className.slice(0, 100) : null,
      text: el.innerText ? el.innerText.trim().slice(0, 60) : null // short label only, no field values
    };
  }

  let lastScrollSent = 0;

  document.addEventListener('click', (e) => {
    const target = e.target;
    // Never log clicks on password fields' values — only structural info.
    chrome.runtime.sendMessage({
      type: 'click',
      url: location.href,
      meta: {
        element: describeElement(target),
        x: e.clientX,
        y: e.clientY
      }
    });
  }, true);

  document.addEventListener('scroll', () => {
    const now = Date.now();
    if (now - lastScrollSent < 2000) return; // throttle
    lastScrollSent = now;
    const scrollPct = Math.round(
      (window.scrollY / (document.body.scrollHeight - window.innerHeight || 1)) * 100
    );
    chrome.runtime.sendMessage({
      type: 'scroll',
      url: location.href,
      meta: { scrollPercent: Math.min(100, Math.max(0, scrollPct)) }
    });
  }, { passive: true });
})();
