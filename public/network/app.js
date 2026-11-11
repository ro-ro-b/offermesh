(() => {
  const app = document.querySelector('#app');
  const api = new URL('../api/engagement/', location.href);
  let state, moves = [], busy = false;
  const urlParams = new URLSearchParams(location.search);
  const campaign = urlParams.get('campaign');
  const publisher = urlParams.get('publisher');
  const validPlacement = /^[a-f0-9]{64}$/i.test(campaign || '') && ['fieldnotes','arcade'].includes(publisher);
  const statePath = validPlacement ? `state?campaign=${encodeURIComponent(campaign)}&publisher=${encodeURIComponent(publisher)}` : 'state';
  if (validPlacement) {
    document.querySelector('#publisher-context').textContent = publisher === 'fieldnotes'
      ? 'FIELDNOTES PLACEMENT · OPTIONAL'
      : 'ARCADE PLACEMENT · OPTIONAL';
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => Number.isFinite(Number(cents)) ? new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(Number(cents)/100) : '—';
  const set = (id, value) => { document.getElementById(id).textContent = value; };
  function update(s) {
    state = s;
    const c = s.campaign || {}, m = s.metrics || {}, p = s.proof || {};
    const mode = s.mode === 'dual' ? 'DUAL CONNECTED' : 'LOCAL REHEARSAL';
    set('mode',mode); set('dash-mode',mode);
    const sponsor = s.sponsor;
    document.getElementById('campaign').hidden = Boolean(c.shared && !sponsor);
    document.querySelector('a[href="#campaign"]').hidden = Boolean(c.shared && !sponsor);
    if (sponsor || !c.shared) {
      const shared = Boolean(c.shared);
      document.getElementById('publish-pilot').hidden = shared;
      document.getElementById('placement-links').hidden = !shared;
      document.getElementById('network-outcomes').hidden = !shared;
      document.getElementById('distribution-description').textContent = shared
        ? 'Share a placement link with players. Each publisher has its own context and attribution.'
        : 'Publish a shared pilot to create separate Fieldnotes and Arcade links. Publishing switches this browser to the shared pilot.';
      if (shared) {
        for (const name of ['fieldnotes','arcade']) {
          const path = c.shareLinks?.[name];
          // Only display same-origin placement URLs returned by the campaign service.
          const link = path ? new URL(path, location.origin) : null;
          document.getElementById(`${name}-link`).value = link?.origin === location.origin ? link.href : '';
        }
        const o = sponsor?.observations || {};
        document.getElementById('observation-report').textContent = `Across players: ${sponsor?.accepted ?? 0} opted in · ${sponsor?.completed ?? 0} completed. Observations: clear ${o.clear ?? 0} · confusing ${o.confusing ?? 0} · too hard ${o['too-hard'] ?? 0}`;
        const publishers = sponsor?.publishers || {};
        document.getElementById('publisher-report').textContent = ['fieldnotes','arcade'].map(name => {
          const p = publishers[name] || {};
          const conversion = typeof p.conversion === 'number' ? `, ${Math.round(p.conversion * 100)}% completed` : '';
          return `${name === 'fieldnotes' ? 'Fieldnotes' : 'Arcade'}: ${p.accepted ?? 0} opted in, ${p.completed ?? 0} completed${conversion}`;
        }).join(' · ');
      }
    }

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
    else if (status === 'complete') app.innerHTML = `<div class="tag">✳ &nbsp; THANK YOU FOR PLAYING</div><h3>Good signal received.</h3><p>Your observation is in. Here’s your complete offline copy of Night Signal: a small game about listening closely and finding your way.</p><a class="button" href="${esc(new URL('reward',api).href)}">Get Night Signal <span>↗</span></a><p>Keep the downloaded file and open it in a browser to play offline.</p><a class="text-link" href="proof.html">Keep a Dual entitlement ↗</a>`;
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
      if (body !== undefined && !['control','publish'].includes(path)) {
        const heading = app.querySelector('h3');
        if (heading) { heading.tabIndex = -1; heading.focus(); }
      }
    } catch (error) {
      const destination = ['control','publish'].includes(path) ? document.getElementById('control-message') : app;
      const old = destination.querySelector('.error'); if (old) old.remove();
      const msg = document.createElement('p'); msg.className='error'; msg.setAttribute('role','alert'); msg.textContent = error.message || 'Connection unavailable. Please try again.'; destination.append(msg);
    } finally { busy=false; }
  }
  app.addEventListener('click', e => {
    const dial = e.target.closest('[data-dial]');
    if (dial) {
      const frequency = Number(dial.dataset.dial);
      moves.push(frequency);
      render();
      app.querySelector(`[data-dial="${frequency}"]`)?.focus();
      return;
    }
    const observation = e.target.closest('[data-observation]');
    if (observation) { request('complete',{observation:observation.dataset.observation}); return; }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'accept' || action === 'decline') request(action,{});
    if (action === 'play' && moves.length) request('play',{moves});
  });
  document.getElementById('pause-control').addEventListener('click', () => request('control',{paused: !state?.campaign?.paused}));
  document.getElementById('capacity-save').addEventListener('click', () => request('control',{capacity:Number(document.getElementById('capacity-control').value)}));
  document.getElementById('refresh-report').addEventListener('click', () => request('state'));
  document.getElementById('publish-pilot').addEventListener('click', () => request('publish',{}));
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const input = document.getElementById(button.dataset.copy);
    if (!input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      document.getElementById('copy-status').textContent = 'Link copied.';
    } catch {
      input.focus(); input.select();
      document.getElementById('copy-status').textContent = 'Select and copy the link above.';
    }
  }));
  request(statePath);
})();
