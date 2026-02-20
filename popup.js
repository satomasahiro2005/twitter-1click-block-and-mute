document.addEventListener('DOMContentLoaded', () => {
  // i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = chrome.i18n.getMessage(el.dataset.i18n);
  });

  chrome.storage.local.get('stats', (data) => {
    const stats = data.stats || { blocked: 0, muted: 0 };
    document.getElementById('blocked-count').textContent = stats.blocked;
    document.getElementById('muted-count').textContent = stats.muted;
  });

  document.getElementById('open-settings').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});
