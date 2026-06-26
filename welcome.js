for (const el of document.querySelectorAll('[data-i18n]')) {
  const msg = chrome.i18n.getMessage(el.dataset.i18n);
  if (msg.includes('\n')) {
    el.innerHTML = msg.split('\n').map(s => s.replace(/</g, '&lt;')).join('<br>');
  } else {
    el.textContent = msg;
  }
}
