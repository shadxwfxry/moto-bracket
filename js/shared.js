// ─── SHARED: общий код для admin и viewer ───

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function getRoundLabel(count) {
  if (count === 1) return 'ФИНАЛ';
  if (count === 2) return 'ПОЛУФИНАЛ';
  if (count === 4) return 'ЧЕТВЕРТЬФИНАЛ';
  return 'РАУНД';
}

function makeVsDivider() {
  const div = document.createElement('div');
  div.style.cssText = 'height:1px;background:var(--border);position:relative';
  div.innerHTML = '<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--card);padding:0 8px;font-family:Share Tech Mono,monospace;font-size:9px;color:var(--muted)">VS</span>';
  return div;
}
