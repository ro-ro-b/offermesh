(() => {
  const app = document.querySelector("#app");
  const api = new URL("../api/engagement/", location.href);
  let state,
    moves = [],
    busy = false;
  const urlParams = new URLSearchParams(location.search);
  const campaign = urlParams.get("campaign");
  const publisher = urlParams.get("publisher");
  const validPlacement =
    /^[a-f0-9]{64}$/i.test(campaign || "") &&
    ["fieldnotes", "arcade"].includes(publisher);
  const participantApi = validPlacement
    ? new URL(`placements/${campaign}/${publisher}/`, api)
    : api;
  const proofUrl = validPlacement
    ? `proof.html?campaign=${encodeURIComponent(campaign)}&publisher=${encodeURIComponent(publisher)}`
    : "proof.html";
  const statePath = "state";
  if (validPlacement) {
    document.body.classList.add(`publisher-${publisher}`);
    document.querySelector("#publisher-context").textContent =
      publisher === "fieldnotes"
        ? "FIELDNOTES · SPONSORED PLACEMENT · OPTIONAL"
        : "ARCADE · SPONSORED PLACEMENT · OPTIONAL";
    const editorial = document.querySelector("#field-notes");
    if (publisher === "fieldnotes") {
      editorial.innerHTML = `<div><div class="eyebrow dark">FIELDNOTES / EDITORIAL</div><h2>How to test a <em>tutorial.</em></h2><p>Independent advice: a useful tutorial helps you act before it explains everything. Notice where you first feel lost.</p></div><div class="note-grid"><article><h3>Start without a guide.</h3><p>Try the first action on your own. If you pause, ask what information you were missing.</p></article><article><h3>Describe the moment.</h3><p>“I could not tell what to press” is more useful than simply saying a game is bad.</p></article><article><h3>Keep your own view.</h3><p>A clear tutorial and an enjoyable game are different things. Both deserve honest feedback.</p></article></div>`;
    } else {
      editorial.innerHTML = `<div><div class="eyebrow dark">ARCADE / PUZZLE LIST</div><h2>Three ways to <em>play with clues.</em></h2><p>Our independent puzzle picks: patterns, deduction and listening. Try this free clue right here: what comes next, 2, 4, 6?</p><p><strong>Answer: 8.</strong> Each number increases by two.</p></div><div class="note-grid"><article><h3>Pattern puzzles</h3><p>Look for a repeated change. Check the rule against every number before guessing.</p></article><article><h3>Deduction puzzles</h3><p>Cross out what cannot be true; the remaining possibilities become easier to test.</p></article><article><h3>Audio puzzles</h3><p>Listen for a change in pitch, rhythm or texture. Repeat the signal if you need to.</p></article></div>`;
    }
  }

  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const money = (cents) =>
    Number.isFinite(Number(cents))
      ? new Intl.NumberFormat("en-AU", {
          style: "currency",
          currency: "AUD",
        }).format(Number(cents) / 100)
      : "—";
  const set = (id, value) => {
    document.getElementById(id).textContent = value;
  };
  function update(s) {
    state = s;
    const c = s.campaign || {},
      m = s.metrics || {},
      p = s.proof || {};
    const mode = c.shared ? "SHARED PILOT" : "PRIVATE PILOT";
    set("mode", mode);
    set("dash-mode", mode);
    const sponsor = s.sponsor;
    document.getElementById("campaign").hidden = Boolean(c.shared && !sponsor);
    document.querySelector('a[href="#campaign"]').hidden = Boolean(
      c.shared && !sponsor,
    );
    if (sponsor || !c.shared) {
      const shared = Boolean(c.shared);
      document.getElementById("publish-pilot").hidden = shared;
      document.getElementById("placement-links").hidden = !shared;
      document.getElementById("network-outcomes").hidden = !shared;
      document.getElementById("distribution-description").textContent = shared
        ? "Share a placement link with players. Each publisher has its own context and attribution."
        : "Publish a shared pilot to create separate Fieldnotes and Arcade links. Publishing switches this browser to the shared pilot.";
      if (shared) {
        for (const name of ["fieldnotes", "arcade"]) {
          const path = c.shareLinks?.[name];
          // Only display same-origin placement URLs returned by the campaign service.
          const link = path ? new URL(path, location.origin) : null;
          document.getElementById(`${name}-link`).value =
            link?.origin === location.origin ? link.href : "";
        }
        const o = sponsor?.observations || {};
        document.getElementById("observation-report").textContent =
          `Across players: ${sponsor?.accepted ?? 0} opted in · ${sponsor?.completed ?? 0} completed. Observations: clear ${o.clear ?? 0} · confusing ${o.confusing ?? 0} · too hard ${o["too-hard"] ?? 0}`;
        const publishers = sponsor?.publishers || {};
        document.getElementById("publisher-report").textContent = [
          "fieldnotes",
          "arcade",
        ]
          .map((name) => {
            const p = publishers[name] || {};
            const conversion =
              typeof p.conversion === "number"
                ? `, ${Math.round(p.conversion * 100)}% completed`
                : "";
            return `${name === "fieldnotes" ? "Fieldnotes" : "Arcade"}: ${p.accepted ?? 0} opted in, ${p.completed ?? 0} completed${conversion}`;
          })
          .join(" · ");
      }
    }

    set("budget", money(m.budgetCents ?? c.budgetCents));
    set("fee", money(c.feeCents));
    set("remaining", money(m.remainingCents));
    set("earned", money(m.earnedCents));
    set("accepted", m.accepted ?? "—");
    set("completed", m.completed ?? "—");
    document.getElementById("pause-control").textContent = c.paused
      ? "Resume campaign"
      : "Pause campaign";
    if ([1, 2, 3].includes(Number(c.capacity)))
      document.getElementById("capacity-control").value = String(c.capacity);
    set(
      "terms",
      typeof c.terms === "string"
        ? c.terms
        : c.terms
          ? JSON.stringify(c.terms)
          : "Campaign terms are unavailable.",
    );
    const proofText = p.verified
      ? "Dual verified the issuer template and the game fingerprint. Each wallet entitlement has its own mint receipt."
      : "Current Dual template verification is unavailable.";
    set("proof-status", proofText);
    render();
  }
  function render() {
    const status = state.participant?.status;
    if (state.ownPlacement) {
      app.innerHTML = `<h3>Publisher preview</h3><p>You are viewing your own placement. This preview is read-only; share the publisher link with a different participant to collect feedback.</p><a class="text-link" href="#field-notes">Explore the independent editorial ↗</a>`;
      return;
    }
    if (state.campaign?.shared && state.sponsor && !validPlacement) {
      app.innerHTML = `<h3>Your pilot is published.</h3><p>Use the advertiser dashboard to copy a Fieldnotes or Arcade placement link. Open a link to preview its editorial and sponsored invitation.</p><a class="button" href="#campaign">View placement links ↗</a>`;
      return;
    }
    if (status === "new" && state.campaign?.paused) {
      app.innerHTML = `<h3>Playtest paused</h3><p>Fallow Games is not accepting new participants right now. The independent editorial is still yours to explore.</p><a class="text-link" href="#field-notes">Read the editorial ↗</a>`;
      return;
    }
    if (status === "new")
      app.innerHTML = `<h3>Ready to listen in?</h3><p>This is a voluntary, sponsored playtest. Try the tutorial and share one structured observation to unlock your offline game.</p><button class="button" data-action="accept">I’d like to take part <span>↗</span></button><button class="secondary" data-action="decline">Skip for now</button>`;
    else if (status === "accepted")
      app.innerHTML = `<div class="tag">TUNE THE SIGNAL</div><h3>Find the frequency.</h3><p>A distant signal is hiding on dial <strong>5</strong>. Select a frequency to listen. Try as many as you like, then send your attempt—even if you don’t find it.</p><div class="dial" role="group" aria-label="Signal frequencies">${Array.from({ length: 8 }, (_, i) => `<button data-dial="${i}" aria-label="Frequency ${i}" ${moves.at(-1) === i ? 'class="selected" aria-pressed="true"' : 'aria-pressed="false"'}>${i}</button>`).join("")}</div><p>${moves.length ? (moves.at(-1) === 5 ? "✳ Signal found! The message is coming through clearly." : "Static… try another frequency, or submit this attempt.") : "Choose a frequency to start listening."}</p><button class="button" data-action="play" ${moves.length ? "" : "disabled"}>Submit my attempt <span>↗</span></button><button class="secondary" data-action="decline">Leave playtest</button>`;
    else if (status === "played")
      app.innerHTML = `<div class="tag">YOUR OBSERVATION</div><h3>How did it feel?</h3><p>Choose the closest fit. Candid feedback of every kind is equally eligible for the game.</p><div class="feedback"><button data-observation="clear">The tutorial was clear ↗</button><button data-observation="confusing">I found it confusing ↗</button><button data-observation="too-hard">It felt too hard ↗</button></div><button class="secondary" data-action="decline">Leave playtest</button>`;
    else if (status === "complete")
      app.innerHTML = `<div class="tag">✳ &nbsp; THANK YOU FOR PLAYING</div><h3>Good signal received.</h3><p>Your observation is in. Here’s your complete offline copy of Night Signal: a small game about listening closely and finding your way.</p><a class="button" href="${esc(new URL("reward", participantApi).href)}">Get Night Signal <span>↗</span></a><p>Keep the downloaded file and open it in a browser to play offline.</p><a class="text-link" href="${esc(proofUrl)}">Keep a Dual entitlement ↗</a>`;
    else if (status === "declined")
      app.innerHTML = `<div class="tag">YOUR CHOICE</div><h3>No worries at all.</h3><p>Thanks for stopping by. The field notes are yours to enjoy whenever you like.</p><a class="button" href="#field-notes">Explore field notes <span>↗</span></a>`;
    else
      app.innerHTML =
        "<h3>Experience unavailable.</h3><p>We couldn’t determine the playtest status. Please try reloading.</p>";
  }
  async function request(path, body) {
    if (busy) return;
    busy = true;
    try {
      const base = ["control", "publish"].includes(path) ? api : participantApi;
      const response = await fetch(
        new URL(path, base),
        body === undefined
          ? { credentials: "same-origin" }
          : {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "The request could not be completed.");
      update(data);
      if (body !== undefined && !["control", "publish"].includes(path)) {
        const heading = app.querySelector("h3");
        if (heading) {
          heading.tabIndex = -1;
          heading.focus();
        }
      }
    } catch (error) {
      const destination = ["control", "publish"].includes(path)
        ? document.getElementById("control-message")
        : app;
      const old = destination.querySelector(".error");
      if (old) old.remove();
      const msg = document.createElement("p");
      msg.className = "error";
      msg.setAttribute("role", "alert");
      const message = error.message || "";
      msg.textContent = /capacity|full/i.test(message)
        ? "This playtest is full. Please enjoy the independent editorial."
        : /paused|closed/i.test(message)
          ? "This playtest is currently closed to new participants."
          : message || "Connection unavailable. Please try again.";
      destination.append(msg);
    } finally {
      busy = false;
    }
  }
  app.addEventListener("click", (e) => {
    const dial = e.target.closest("[data-dial]");
    if (dial) {
      const frequency = Number(dial.dataset.dial);
      moves.push(frequency);
      render();
      app.querySelector(`[data-dial="${frequency}"]`)?.focus();
      return;
    }
    const observation = e.target.closest("[data-observation]");
    if (observation) {
      request("complete", { observation: observation.dataset.observation });
      return;
    }
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "accept" || action === "decline") request(action, {});
    if (action === "play" && moves.length) request("play", { moves });
  });
  document
    .getElementById("pause-control")
    .addEventListener("click", () =>
      request("control", { paused: !state?.campaign?.paused }),
    );
  document
    .getElementById("capacity-save")
    .addEventListener("click", () =>
      request("control", {
        capacity: Number(document.getElementById("capacity-control").value),
      }),
    );
  document
    .getElementById("refresh-report")
    .addEventListener("click", () => request("state"));
  document
    .getElementById("publish-pilot")
    .addEventListener("click", () => request("publish", {}));
  document.querySelectorAll("[data-copy]").forEach((button) =>
    button.addEventListener("click", async () => {
      const input = document.getElementById(button.dataset.copy);
      if (!input.value) return;
      try {
        await navigator.clipboard.writeText(input.value);
        document.getElementById("copy-status").textContent = "Link copied.";
      } catch {
        input.focus();
        input.select();
        document.getElementById("copy-status").textContent =
          "Select and copy the link above.";
      }
    }),
  );
  request(statePath);
})();
