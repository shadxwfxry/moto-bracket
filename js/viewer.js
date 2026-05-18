// ─── VIEWER ───

// Уникальный токен зрителя (против двойного голосования)
let voterToken = localStorage.getItem('voter_token');
if (!voterToken) {
  voterToken = Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem('voter_token', voterToken);
}

let lastState = null;
let currentVoteKey = null;
let lastTid = localStorage.getItem('last_tid') || null;
let hasVotedForKey = {};
try { hasVotedForKey = JSON.parse(localStorage.getItem('voted_keys') || '{}'); } catch { }
let justVotedAt = 0; // cooldown: не перезаписувати optimistic UI одразу після голосу

// Витягує число з рядка типу "12 голосів" або "..."
function parseVoteText(text) {
  const n = parseInt(text);
  return isNaN(n) ? 0 : n;
}

// ─── POLLING ───
async function poll() {
  try {
    const data = await fetch('/api/tournament').then(r => r.json());
    if (data.status === 'empty') {
      showWaiting();
      document.getElementById('header-status').textContent = 'ОЖИДАНИЕ';
      return;
    }
    const s = data.state;
    if (!s || (!s.rounds?.length && !s.champion)) { showWaiting(); return; }

    // Новый турнир — сбрасываем историю голосований
    if (s.tid && String(s.tid) !== lastTid) {
      hasVotedForKey = {};
      localStorage.setItem('voted_keys', '{}');
      lastTid = String(s.tid);
      localStorage.setItem('last_tid', lastTid);
    }

    lastState = s;
    updateUI(s);
    adjustPolling();
  } catch {
    document.getElementById('header-status').textContent = 'ОШИБКА СВЯЗИ';
    document.getElementById('header-dot').classList.remove('live');
  }
}

function showWaiting() {
  document.getElementById('waiting').style.display = 'flex';
  document.getElementById('rounds-container').innerHTML = '';
  document.getElementById('vote-banner').style.display = 'none';
  document.getElementById('champion-block').style.display = 'none';
}

function updateUI(s) {
  document.getElementById('waiting').style.display = 'none';
  document.getElementById('header-dot').classList.add('live');

  if (s.champion) {
    document.getElementById('header-status').textContent = `🏆 ${s.champion}`;
    document.getElementById('champ-name').textContent = s.champion;
    document.getElementById('champion-block').style.display = 'flex';
    document.getElementById('vote-banner').style.display = 'none';
  } else {
    document.getElementById('champion-block').style.display = 'none';
    document.getElementById('header-status').textContent = 'LIVE';
  }

  // Vote banner
  if (s.voting?.active) {
    const newKey = s.voting.match_key;
    if (newKey !== currentVoteKey) {
      showVoteBanner(s);
    } else {
      document.getElementById('vote-banner').style.display = 'flex';
    }
  } else {
    currentVoteKey = null;
    document.getElementById('vote-banner').style.display = 'none';
  }

  renderBracket(s);
}

// ─── VOTE BANNER ───
function showVoteBanner(s) {
  const { rIdx, mIdx, match_key } = s.voting;
  const m = s.rounds[rIdx][mIdx];
  const alreadyVoted = hasVotedForKey[match_key];

  document.getElementById('vm-match').textContent = `${m.p1} vs ${m.p2}`;
  document.getElementById('vname1').textContent = m.p1;
  document.getElementById('vname2').textContent = m.p2;
  document.getElementById('vote-banner').style.display = 'flex';
  currentVoteKey = match_key;

  if (alreadyVoted === m.p1 || alreadyVoted === m.p2) {
    setVotedState(alreadyVoted, m.p1, m.p2);
  } else {
    if (alreadyVoted) {
      delete hasVotedForKey[match_key];
      localStorage.setItem('voted_keys', JSON.stringify(hasVotedForKey));
    }
    resetButtonsState();
    document.getElementById('vcnt1').textContent = '...';
    document.getElementById('vcnt2').textContent = '...';
  }

  fetch(`/api/vote?match_key=${match_key}`)
    .then(r => r.json())
    .then(resp => {
      if (currentVoteKey !== match_key) return;
      updateVoteCounts(resp.tally || {}, m.p1, m.p2);
    })
    .catch(() => { });
}

function resetButtonsState() {
  const b1 = document.getElementById('vbtn1');
  const b2 = document.getElementById('vbtn2');
  b1.className = 'vote-btn vote-btn-1';
  b2.className = 'vote-btn vote-btn-2';
  b1.onclick = () => vote(1);
  b2.onclick = () => vote(2);
  document.getElementById('voted-ok').classList.add('hidden');
}

function updateVoteCounts(tally, n1, n2) {
  const v1 = tally[n1] || 0, v2 = tally[n2] || 0;
  const matchTotal = v1 + v2;

  document.getElementById('vcnt1').textContent = `${v1} голос${voteSuffix(v1)}`;
  document.getElementById('vcnt2').textContent = `${v2} голос${voteSuffix(v2)}`;
  const pct = matchTotal > 0 ? Math.round(v1 / matchTotal * 100) : 50;
  document.getElementById('vbar1').style.width = pct + '%';
}

function voteSuffix(n) {
  if (n % 10 === 1 && n % 100 !== 11) return '';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'а';
  return 'ов';
}

function setVotedState(voted, n1, n2) {
  const b1 = document.getElementById('vbtn1');
  const b2 = document.getElementById('vbtn2');
  b1.classList.add('disabled'); b2.classList.add('disabled');
  b1.onclick = null; b2.onclick = null;

  if (voted === n1) {
    b1.classList.add('voted-for'); b2.classList.add('voted-other');
  } else if (voted === n2) {
    b2.classList.add('voted-for'); b1.classList.add('voted-other');
  }
  document.getElementById('voted-ok').classList.remove('hidden');
}

async function vote(which) {
  if (!currentVoteKey || !lastState?.voting?.active) return;
  const { rIdx, mIdx } = lastState.voting;
  const m = lastState.rounds[rIdx][mIdx];
  const participant = which === 1 ? m.p1 : m.p2;

  if (hasVotedForKey[currentVoteKey]) return;

  // 1. Оптимістичний UI
  hasVotedForKey[currentVoteKey] = participant;
  justVotedAt = Date.now(); // блокуємо live-poll на 6 сек
  setVotedState(participant, m.p1, m.p2);

  // 2. Локально +1 (parseVoteText безпечно парсить '...' та '12 голосів')
  const cntEl = document.getElementById(`vcnt${which}`);
  const currentCount = parseVoteText(cntEl.textContent);
  cntEl.textContent = `${currentCount + 1} голос${voteSuffix(currentCount + 1)}`;

  const v1 = parseVoteText(document.getElementById('vcnt1').textContent);
  const v2 = parseVoteText(document.getElementById('vcnt2').textContent);
  const total = v1 + v2;
  const pct = total > 0 ? Math.round(v1 / total * 100) : 50;
  document.getElementById('vbar1').style.width = pct + '%';

  // 3. Отправляем в фоне
  try {
    const resp = await fetch('/api/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_key: currentVoteKey, participant, voter_token: voterToken })
    }).then(r => r.json());

    if (resp.error && resp.error !== 'already_voted') {
      throw new Error('Server rejected vote');
    }

    localStorage.setItem('voted_keys', JSON.stringify(hasVotedForKey));

  } catch {
    fetch(`/api/vote?match_key=${currentVoteKey}&_t=${Date.now()}`)
      .then(r => r.json())
      .then(d => {
        updateVoteCounts(d.tally || {}, m.p1, m.p2);
        const myVoteCount = d.tally ? (d.tally[participant] || 0) : 0;
        if (myVoteCount === 0) {
          delete hasVotedForKey[currentVoteKey];
          resetButtonsState();
        }
      }).catch(() => { });
  }
}

// ─── BRACKET RENDER ───
function renderBracket(s) {
  const container = document.getElementById('rounds-container');
  container.innerHTML = '';

  s.rounds.forEach((round, rIdx) => {
    const block = document.createElement('div');
    block.className = 'round-block';
    block.innerHTML = `<div class="round-label">${getRoundLabel(round.length)}</div>`;

    round.forEach((match, mIdx) => {
      if (match.p1 === null && match.p2 === null) return;
      const isVoting = s.voting?.active && s.voting.rIdx === rIdx && s.voting.mIdx === mIdx;
      const card = document.createElement('div');
      card.className = `match-card${isVoting ? ' voting-match' : ''}`;

      function makeSlot(name) {
        const el = document.createElement('div');
        const isBye = name === null;
        const isWon = match.winner === name && !isBye;
        const isLost = match.winner && match.winner !== name && !isBye;
        el.className = `participant${isBye ? ' bye' : ''}${isWon ? ' won' : ''}${isLost ? ' lost' : ''}`;
        let badge = '';
        if (isWon) badge = '<span class="p-badge badge-win">WIN ✓</span>';
        if (isVoting && !match.winner) badge = '<span class="p-badge badge-live">🗳 LIVE</span>';
        el.innerHTML = `<span class="p-name">${isBye ? 'BYE' : esc(name)}</span>${badge}`;
        return el;
      }

      card.appendChild(makeSlot(match.p1));
      card.appendChild(makeVsDivider());
      card.appendChild(makeSlot(match.p2));
      block.appendChild(card);
    });
    container.appendChild(block);
  });
}

// ─── START ───
poll();
let pollId = setInterval(poll, 1500);
let currentPollRate = 1500;

// Замедлить polling когда чемпион определён, ускорить обратно когда новый турнир
function adjustPolling() {
  const wantRate = lastState?.champion ? 3000 : 1500;
  if (wantRate === currentPollRate) return;
  clearInterval(pollId);
  pollId = setInterval(poll, wantRate);
  currentPollRate = wantRate;
}

// Live vote count update (пропускаємо 6 сек після власного голосу — cooldown)
setInterval(async () => {
  if (!lastState?.voting?.active) return;
  if (Date.now() - justVotedAt < 6000) return; // не перебиваємо optimistic UI
  const { match_key, rIdx, mIdx } = lastState.voting;
  const m = lastState.rounds[rIdx][mIdx];
  try {
    const resp = await fetch(`/api/vote?match_key=${match_key}`).then(r => r.json());
    updateVoteCounts(resp.tally || {}, m.p1, m.p2);
  } catch { /* network error */ }
}, 5000);
