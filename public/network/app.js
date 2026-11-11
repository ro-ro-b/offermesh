(() => {
  const app = document.querySelector('#app');
  const api = new URL('../api/engagement/', location.href);
  let state, moves = [], busy = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => Number.isFinite(Number(cents)) ? new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(cents)/100) : '—';
  const set = (id, value) => { document.getElementById(id).textContent = value; };
  function update(s) {
    state = s;
    const c = s.campaign || {}, m = s.metrics || {}, p = s.proof || {};
    const mode = s.mode === 'dual' ? 'DUAL CONNECTED' : 'LOCAL REHEARSAL';
    set('mode',mode); set('dash-mode',mode);
    set('budget',money(m.budgetCents ?? c.budgetCents)); set('fee',money(c.feeCents)); set('remaining',money(m.remainingCents)); set('earned',money(m.earnedCents));
    set('accepted',m.accepted ?? '—'); set('completed',m.completed ?? '—');
    document.getElementById('pause-control').textContent = c.paused ? 'Resume campaign' : 'Pause campaign';
    if ([1,2,3].includes(Number(c.capacity))) document.getElementById('capacity-control').value = String(c.capacity);
    set('terms', typeof c.terms === 'string' ? c.terms : c.terms ? JSON.stringify(c.terms) : 'Campaign terms are unavailable.');
    const proofText = s.mode === 'dual' ? 'Dual-connected mode. See the delivery record for issuer and exact proof status.' : 'Local rehearsal: no live Dual issuance or delivery proof is claimed.';
    set('proof-status',proofText);
    render();
  }
  function render() {
    const status = state.participant?.status;
    if (status === 'new') app.innerHTML = `<h3>Ready to listen in?</h3><p>This is a voluntary, sponsored playtest. Try the tutorial and share one structured observation to unlock your offline game.</p><button class="button" data-action="accept">I’d like to take part <span>↗</span></button><button class="secondary" data-action="decline">Skip for now</button>`;
    else if (status === 'accepted') app.innerHTML = `<div class="tag">01 / TUNE THE SIGNAL</div><h3>Find the frequency.</h3><p>A distant signal is hiding on dial <strong>5</strong>. Select a frequency to listen. Try as many as you like, then send your attempt—even if you don’t find it.</p><div class="dial" role="group" aria-label="Signal frequencies">${Array.from({length:8},(_,i)=>`<button data-dial="${i}" aria-label="Frequency ${i}" ${moves.at(-1)===i?'class="selected" aria-pressed="true"':'aria-pressed="false"'}>${i}</button>`).join('')}</div><p>${moves.length ? (moves.at(-1)===5 ? '✳ Signal found! The message is coming through clearly.' : 'Static… try another frequency, or submit this attempt.') : 'Choose a frequency to start listening.'}</p><button class="button" data-action="play" ${moves.length?'':'disabled'}>Submit my attempt <span>↗</span></button><button class="secondary" data-action="decline">Leave playtest</button>`;
    else if (status === 'played') app.innerHTML = `<div class="tag">02 / YOUR OBSERVATION</div><h3>How did it feel?</h3><p>Choose the closest fit. Candid feedback of every kind is equally eligible for the game.</p><div class="feedback"><button data-observation="clear">The tutorial was clear ↗</button><button data-observation="confusing">I found it confusing ↗</button><button data-observation="too-hard">It felt too hard ↗</button></div><button class="secondary" data-action="decline">Leave playtest</button>`;
    else if (status === 'complete') app.innerHTML = `<div class="tag">✳ &nbsp; THANK YOU FOR PLAYING</div><h3>Good signal received.</h3><p>Your observation is in. Here’s your complete offline copy of Night Signal: a small game about listening closely and finding your way.</p><a class="button" href="${esc(new URL('reward',api).href)}">Get Night Signal <span>↗</span></a><p>Keep the downloaded file and open it in a browser to play offline.</p>`;
    else if (status === 'declined') app.innerHTML = `<div class="tag">YOUR CHOICE</div><h3>No worries at all.</h3><p>Thanks for stopping by. The field notes are yours to enjoy whenever you like.</p><a class="button" href="#field-notes">Explore field notes <span>↗</span></a>`;
    else app.innerHTML = '<h3>Experience unavailable.</h3><p>We couldn’t determine the playtest status. Please try reloading.</p>';
  }
  async function request(path, body) {
    if (busy) return; busy = true;
    try {
      const response = await fetch(new URL(path, api), body === undefined ? {credentials:'same-origin'} : {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
      update(data);
    } catch (error) {
      const old = app.querySelector('.error'); if (old) old.remove();
      const msg = document.createElement('p'); msg.className='error'; msg.setAttribute('role','alert'); msg.textContent = error.message || 'Connection unavailable. Please try again.'; app.append(msg);
    } finally { busy=false; }
  }
  app.addEventListener('click', e => {
    const dial = e.target.closest('[data-dial]');
    if (dial) { moves.push(Number(dial.dataset.dial)); render(); return; }
    const observation = e.target.closest('[data-observation]');
    if (observation) { request('complete',{observation:observation.dataset.observation}); return; }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'accept' || action === 'decline') request(action,{});
    if (action === 'play' && moves.length) request('play',{moves});
  });
  document.getElementById('pause-control').addEventListener('click', () => request('control',{paused: !state?.campaign?.paused}));
  document.getElementById('capacity-save').addEventListener('click', () => request('control',{capacity:Number(document.getElementById('capacity-control').value)}));
  request('state');
})();
