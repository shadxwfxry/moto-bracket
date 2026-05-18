// ─── ADMIN ───

let adminToken = '';
let state = null;
let pollInterval = null;
let voteInterval = null;
let isUpdating = false;

// ─── AUTH ───
function auth() {
  adminToken = document.getElementById('token-inp').value.trim();
  if (!adminToken) return;
  fetch('/api/tournament?_t=' + Date.now()).then(r => r.json()).then(data => {
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('auth-block').style.display = 'none';
    if (data.status === 'empty') {
      showSetup();
    } else {
      state = data.state;
      showBracket();
    }
  }).catch(() => {
    document.getElementById('auth-error').classList.remove('hidden');
  });
}

// ─── SETUP ───
let totalCount = 4;

function showSetup() {
  document.getElementById('setup-block').style.display = 'flex';
  buildNameInputs();
}

function selCount(n) {
  totalCount = n;
  document.querySelectorAll('.count-btn').forEach(b => b.classList.toggle('active', b.textContent == n));
  document.getElementById('custom-n').value = '';
  buildNameInputs();
}

function onCustom(el) {
  totalCount = parseInt(el.value) || 2;
  document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
  buildNameInputs();
}

function buildNameInputs() {
  const list = document.getElementById('names-list');
  list.innerHTML = '';
  for (let i = 0; i < totalCount; i++) {
    const row = document.createElement('div');
    row.className = 'name-row';
    row.innerHTML = `<span class="name-num">#${i + 1}</span>
      <input class="name-inp" id="n${i}" type="text" placeholder="Участник ${i + 1}" maxlength="20"
        onkeydown="if(event.key==='Enter'){const nx=document.getElementById('n${i + 1}');if(nx)nx.focus();}">`;
    list.appendChild(row);
  }
}

function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

async function startTournament() {
  const names = [];
  for (let i = 0; i < totalCount; i++) {
    const v = document.getElementById(`n${i}`)?.value.trim();
    names.push(v || `Участник ${i + 1}`);
  }
  const slots = nextPow2(names.length);
  const seeds = [...names];
  while (seeds.length < slots) seeds.push(null);
  const firstRound = [];
  for (let i = 0; i < slots; i += 2) firstRound.push({ p1: seeds[i], p2: seeds[i + 1], winner: null });

  state = { rounds: [firstRound], voting: null, champion: null, tid: Date.now() };
  autoAdvanceByes();
  await pushState();
  document.getElementById('setup-block').style.display = 'none';
  showBracket();
}

// ─── STATE LOGIC ───
function autoAdvanceByes() {
  const r = state.rounds[state.rounds.length - 1];
  r.forEach(m => {
    if (m.winner) return;
    if (m.p1 === null && m.p2 !== null) m.winner = m.p2;
    else if (m.p2 === null && m.p1 !== null) m.winner = m.p1;
  });
  checkRoundComplete();
}

function checkRoundComplete() {
  const r = state.rounds[state.rounds.length - 1];
  if (!r.every(m => m.winner || (m.p1 === null && m.p2 === null))) return;
  const winners = r.map(m => m.winner).filter(Boolean);
  if (winners.length === 1) { state.champion = winners[0]; return; }
  if (winners.length === 0) return;
  const next = [];
  for (let i = 0; i < winners.length; i += 2)
    next.push({ p1: winners[i], p2: winners[i + 1] || null, winner: null });
  state.rounds.push(next);
  autoAdvanceByes();
}

async function pickWinner(rIdx, mIdx, which) {
  const m = state.rounds[rIdx][mIdx];
  if (m.winner) return;
  m.winner = which === 1 ? m.p1 : m.p2;
  checkRoundComplete();
  await pushState();
  renderBracket();
}

async function openVoting(rIdx, mIdx) {
  const m = state.rounds[rIdx][mIdx];
  if (m.winner) return;
  state.voting = { active: true, rIdx, mIdx, match_key: `r${rIdx}_m${mIdx}_${state.tid || 0}` };
  renderBracket();
  startVotePoll();
  pushState();
}

async function closeVoting() {
  state.voting = null;
  stopVotePoll();
  renderBracket();
  pushState();
}

async function applyVoteWinner() {
  if (!state.voting) return;
  const { rIdx, mIdx, match_key } = state.voting;
  const resp = await fetch(`/api/vote?match_key=${match_key}&_t=${Date.now()}`).then(r => r.json());
  const tally = resp.tally || {};
  const m = state.rounds[rIdx][mIdx];
  const v1 = tally[m.p1] || 0, v2 = tally[m.p2] || 0;
  if (v1 === 0 && v2 === 0) { alert('Нет голосов!'); return; }
  m.winner = v1 >= v2 ? m.p1 : m.p2;
  state.voting = null;
  checkRoundComplete();
  stopVotePoll();
  await pushState();
  renderBracket();
}

async function resetTournament() {
  if (!confirm('Сбросить турнир?')) return;
  state = null;
  clearInterval(pollInterval);
  pollInterval = null;
  stopVotePoll();
  await fetch('/api/update', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: adminToken, state: { status: 'empty', rounds: [], voting: null, champion: null } })
  });
  document.getElementById('bracket-block').style.display = 'none';
  showSetup();
}

// ─── NETWORK ───
async function pushState() {
  isUpdating = true;
  await fetch('/api/update', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: adminToken, state })
  });
  setTimeout(() => { isUpdating = false; }, 1000);
}

// ─── VOTE POLL ───
function startVotePoll() {
  stopVotePoll();
  voteInterval = setInterval(async () => {
    if (!state?.voting?.active) { stopVotePoll(); return; }
    const { match_key, rIdx, mIdx } = state.voting;
    const m = state.rounds[rIdx][mIdx];

    try {
      const resp = await fetch(`/api/vote?match_key=${match_key}&_t=${Date.now()}`).then(r => r.json());
      const tally = resp.tally || {};
      const v1 = tally[m.p1] || 0;
      const v2 = tally[m.p2] || 0;

      const c1 = document.getElementById('vote-count-1');
      const c2 = document.getElementById('vote-count-2');
      if (c1) c1.textContent = `${v1} голосов`;
      if (c2) c2.textContent = `${v2} голосов`;

      const adm1 = document.getElementById('adm-v1');
      const adm2 = document.getElementById('adm-v2');
      if (adm1) adm1.textContent = v1;
      if (adm2) adm2.textContent = v2;
    } catch { /* network error — retry next tick */ }
  }, 2000);
}

function stopVotePoll() {
  clearInterval(voteInterval);
  voteInterval = null;
}

// ─── RENDER ───
function showBracket() {
  document.getElementById('bracket-block').style.display = 'flex';
  renderBracket();
  clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (isUpdating) return;
    try {
      const data = await fetch('/api/tournament?_t=' + Date.now()).then(r => r.json());
      if (data.state) { state = data.state; renderBracket(); }
    } catch { /* network error — retry next tick */ }
  }, 5000);
}

function renderBracket() {
  if (!state) return;

  const statusEl = document.getElementById('status-text');
  if (state.champion) statusEl.textContent = `🏆 ЧЕМПИОН: ${state.champion}`;
  else if (state.voting?.active) statusEl.textContent = '🗳 ГОЛОСОВАНИЕ ИДЁТ';
  else statusEl.textContent = 'ТУРНИР ИДЁТ';

  // Vote panel
  const vPanel = document.getElementById('vote-panel');
  if (state.voting?.active) {
    vPanel.classList.remove('hidden');
    const { rIdx, mIdx } = state.voting;
    const m = state.rounds[rIdx][mIdx];
    document.getElementById('vote-match-info').textContent = `${m.p1} vs ${m.p2}`;
    document.getElementById('vote-name-1').textContent = m.p1;
    document.getElementById('vote-name-2').textContent = m.p2;
    if (!voteInterval) startVotePoll();
  } else {
    vPanel.classList.add('hidden');
    if (voteInterval) stopVotePoll();
  }

  const container = document.getElementById('rounds-container');
  container.innerHTML = '';
  const lastRIdx = state.rounds.length - 1;

  state.rounds.forEach((round, rIdx) => {
    const block = document.createElement('div');
    block.className = 'round-block';
    block.innerHTML = `<div class="round-label">${getRoundLabel(round.length)}</div>`;

    round.forEach((match, mIdx) => {
      if (match.p1 === null && match.p2 === null) return;
      const isLast = rIdx === lastRIdx;
      const isVoting = state.voting?.active && state.voting.rIdx === rIdx && state.voting.mIdx === mIdx;
      const card = document.createElement('div');
      card.className = `match-card${isVoting ? ' active-match' : ''}`;

      function makeSlot(name, which) {
        const el = document.createElement('div');
        const isBye = name === null;
        const isWon = match.winner === name && !isBye;
        const isLost = match.winner && match.winner !== name && !isBye;
        const canClick = !match.winner && !isBye && isLast && !state.voting?.active;
        el.className = `participant${isBye ? ' bye' : ''}${isWon ? ' won' : ''}${isLost ? ' lost' : ''}${canClick ? ' selectable' : ''}`;
        if (canClick) el.onclick = () => pickWinner(rIdx, mIdx, which);
        el.innerHTML = `<span class="p-name">${isBye ? 'BYE' : esc(name)}</span>
          ${isWon ? '<span class="p-badge badge-win">WIN ✓</span>' : ''}
          ${isVoting ? `<span class="vote-count" id="adm-v${which}">0</span>` : ''}`;
        return el;
      }

      const s1 = makeSlot(match.p1, 1);
      const s2 = makeSlot(match.p2, 2);

      if (!match.winner && isLast && !state.voting?.active) {
        const voteBtn = document.createElement('button');
        voteBtn.className = 'btn-outline';
        voteBtn.style.cssText = 'width:100%;border-radius:0;border-top:1px solid var(--border);border-left:0;border-right:0;border-bottom:0;padding:8px;font-size:12px;letter-spacing:2px;color:var(--warn);border-color:rgba(255,149,0,0.2)';
        voteBtn.textContent = '🗳 ОТКРЫТЬ ГОЛОСОВАНИЕ';
        voteBtn.onclick = () => openVoting(rIdx, mIdx);
        card.appendChild(s1); card.appendChild(makeVsDivider()); card.appendChild(s2); card.appendChild(voteBtn);
      } else {
        card.appendChild(s1); card.appendChild(makeVsDivider()); card.appendChild(s2);
      }
      block.appendChild(card);
    });
    container.appendChild(block);
  });
}
