// Revolv — console (dashboard register): demo loop, marketplace, brand command,
// mandates, proof room, readiness. State lives in RvConsole.

const { useState, useRef, useEffect } = React;

/* ---------- small shared bits ---------------------------------------------- */

function RvStatus({ s }) {
  const cls = { "agent-visible": "", reserved: "pending", verified: "ok", flagged: "flag" }[s] || "";
  return <span className={"db-status " + cls}>{s.replace("-", " ")}</span>;
}

function RvCard({ title, action, children, pad }) {
  return (
    <div className="db-card" style={{ padding: 0 }}>
      {title && (
        <div className="db-table-head" style={{ padding: "14px 18px" }}>
          <h3>{title}</h3>
          {action}
        </div>
      )}
      <div style={{ padding: pad === false ? 0 : "16px 18px" }}>{children}</div>
    </div>
  );
}

/* ---------- demo loop -------------------------------------------------------- */

function RvDemoLoop({ speed, onProof }) {
  const [stepState, setStepState] = useState({}); // idx -> 'active' | 'done'
  const [lines, setLines] = useState([]);
  const [running, setRunning] = useState(false);
  const timers = useRef([]);
  const logRef = useRef(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const run = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStepState({});
    setLines([]);
    setRunning(true);
    const base = 900 / speed;
    let t = 200;
    RV_DEMO_STEPS.forEach((step, i) => {
      timers.current.push(setTimeout(() => setStepState((s) => ({ ...s, [i]: "active" })), t));
      step.trace.forEach(([key, msg, tone]) => {
        t += base * 0.6;
        timers.current.push(
          setTimeout(() => {
            const time = new Date().toTimeString().slice(0, 8);
            setLines((l) => [...l, { time, key, msg, tone }]);
          }, t)
        );
      });
      t += base * 0.4;
      timers.current.push(setTimeout(() => setStepState((s) => ({ ...s, [i]: "done" })), t));
    });
    timers.current.push(
      setTimeout(() => {
        setRunning(false);
        onProof({
          id: "proof_" + Math.random().toString(16).slice(2, 8),
          offer: "Espresso subscription — first month",
          brand: "Lavazza",
          verifier: "verified",
          outcomes: 412,
          billed: 0,
        });
      }, t + 300)
    );
  };

  return (
    <div className="rv-two rv-rise">
      <RvCard
        title="Partner demo mode — one run, five proofs"
        action={
          <button className="rv-btn primary" onClick={run} disabled={running}>
            {running ? "Running…" : "Run partner demo"}
          </button>
        }
      >
        <div className="rv-runner">
          {RV_DEMO_STEPS.map((s, i) => (
            <div className={"rv-run-step " + (stepState[i] || "")} key={s.title}>
              <span className="marker">{stepState[i] === "done" ? "✓" : i + 1}</span>
              <div className="body">
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </div>
              <span className="state">
                {stepState[i] === "done" ? "Passed" : stepState[i] === "active" ? "Running" : "Queued"}
              </span>
            </div>
          ))}
        </div>
      </RvCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <RvCard title="Decision trace" pad={false}>
          <div className="rv-trace" ref={logRef} style={{ border: "none", borderRadius: "0 0 12px 12px" }}>
            {lines.length === 0 && <div className="t-empty">Run the demo to stream the decision trace.</div>}
            {lines.map((l, i) => (
              <div className="t-line" key={i}>
                <span className="t-time">{l.time}</span>
                <span className="t-key">{l.key}</span>
                <span className={l.tone === "ok" ? "t-ok" : l.tone === "flag" ? "t-flag" : ""}>{l.msg}</span>
              </div>
            ))}
          </div>
        </RvCard>
        <div className="db-kpi-grid">
          <div className="db-card">
            <div className="lab">Verified outcomes</div>
            <div className="num">412</div>
            <div className="delta"><span className="chip">▲ 38 today</span></div>
          </div>
          <div className="db-card">
            <div className="lab">Impressions billed</div>
            <div className="num">0</div>
            <div className="delta neutral">Always</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- marketplace ------------------------------------------------------ */

function RvMarketplace({ offers }) {
  const [role, setRole] = useState("Agent platform");
  const view = RV_ROLE_VIEWS[role];
  return (
    <div className="rv-two rv-rise">
      <div className="db-table">
        <div className="db-table-head">
          <h3>Live offers — what agents see over MCP</h3>
          <span className="type-label">Disclosure attached</span>
        </div>
        <table className="db-grid">
          <thead>
            <tr>
              <th>Offer</th><th>Brand</th><th>Incentive</th><th>Sponsored</th><th>Terms hash</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id}>
                <td style={{ fontWeight: 500 }}>{o.name}</td>
                <td>{o.brand}</td>
                <td>{o.incentive}</td>
                <td>{o.sponsored ? "Disclosed" : "—"}</td>
                <td><span className="db-addr">{o.hash}</span></td>
                <td><RvStatus s={o.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <RvCard title="Role-based view" action={null}>
          <div className="rv-rolebar" style={{ marginBottom: 14, flexWrap: "wrap" }}>
            {Object.keys(RV_ROLE_VIEWS).map((r) => (
              <button key={r} className={r === role ? "active" : ""} onClick={() => setRole(r)}>{r}</button>
            ))}
          </div>
          <p className="type-small" style={{ margin: "0 0 10px", color: "var(--ink-500)" }}>{view.lead}</p>
          <div>
            {view.rows.map(([k, v]) => (
              <div className="rv-kv" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
            ))}
          </div>
        </RvCard>
        <RvCard title="Reference agent integration">
          <p className="type-small" style={{ margin: 0, color: "var(--ink-500)" }}>
            Connect an agent to MCP reads publicly, then use a gateway key only for
            reserve, redeem, and simulate paths. Those paths fail closed with{" "}
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--teal-600)" }}>agent_auth_required</code>.
          </p>
        </RvCard>
      </div>
    </div>
  );
}

/* ---------- brand command (create offer wizard + KPIs) ----------------------- */

function RvBrandCommand({ offers, onCreate }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ brand: "", name: "", cap: "$10,000", incentive: "$5.00" });
  const created = step === 3;

  const next = () => setStep((s) => Math.min(3, s + 1));
  const canNext = step === 0 ? form.brand.trim() && form.name.trim() : true;

  const finish = () => {
    onCreate({
      id: "off_" + Math.random().toString(16).slice(2, 8),
      name: form.name,
      brand: form.brand,
      incentive: form.incentive + " / verified outcome",
      sponsored: true,
      cap: form.cap,
      hash: "0x" + Math.random().toString(16).slice(2, 6) + "…" + Math.random().toString(16).slice(2, 6),
      status: "agent-visible",
    });
    setStep(3);
  };

  const labels = ["Brand", "Budget", "Proof"];
  return (
    <div className="rv-two rv-rise">
      <RvCard title="Create offer — one controlled path">
        <div className="rv-wizard-steps">
          {labels.map((l, i) => (
            <div key={l} className={"ws " + (i === step ? "active" : i < step || created ? "done" : "")}>
              <span className="n">{i < step || created ? "✓" : "0" + (i + 1)}</span> {l}
            </div>
          ))}
        </div>
        {step === 0 && (
          <div>
            <div className="rv-field">
              <label>Brand</label>
              <input type="text" placeholder="e.g. Lavazza" value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div className="rv-field">
              <label>Offer name</label>
              <input type="text" placeholder="Name the offer agents will see" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="hint">Creates the brand workspace and a budget-capped program.</div>
            </div>
            <button className="rv-btn primary" onClick={next} disabled={!canNext}>Continue</button>
          </div>
        )}
        {step === 1 && (
          <div>
            <div className="rv-field">
              <label>Outcome cap (escrow budget)</label>
              <select value={form.cap} onChange={(e) => setForm({ ...form, cap: e.target.value })}>
                <option>$5,000</option><option>$10,000</option><option>$25,000</option><option>$50,000</option>
              </select>
            </div>
            <div className="rv-field">
              <label>Incentive per verified outcome</label>
              <select value={form.incentive} onChange={(e) => setForm({ ...form, incentive: e.target.value })}>
                <option>$2.50</option><option>$5.00</option><option>$7.50</option><option>$10.00</option>
              </select>
              <div className="hint">Spend is counted only after a verifier accepts a receipt.</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="rv-btn ghost" onClick={() => setStep(0)}>Back</button>
              <button className="rv-btn primary" onClick={next}>Continue</button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <p className="type-small" style={{ marginTop: 0, color: "var(--ink-500)" }}>
              Publishing mints the machine-readable offer, an agent preview, and a
              shareable proof-room link. Share the proof room before claiming readiness.
            </p>
            <div className="rv-hash" style={{ marginBottom: 16 }}>revolv.dual.xyz/proof/{(form.brand || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-")}/{(form.name || "offer").toLowerCase().replace(/[^a-z0-9]+/g, "-")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="rv-btn ghost" onClick={() => setStep(1)}>Back</button>
              <button className="rv-btn primary" onClick={finish}>Create offer</button>
            </div>
          </div>
        )}
        {created && (
          <div>
            <p className="type-small" style={{ marginTop: 0, color: "var(--ink-500)" }}>
              <strong style={{ color: "var(--ink-700)" }}>{form.name}</strong> is live in the
              agent marketplace with disclosure attached. The proof room is shareable now.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="rv-btn ghost" onClick={() => { setStep(0); setForm({ brand: "", name: "", cap: "$10,000", incentive: "$5.00" }); }}>
                Create another
              </button>
            </div>
          </div>
        )}
      </RvCard>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="db-kpi-panel" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="db-card">
            <div className="lab">Escrow budget remaining</div>
            <div className="num">$48,200</div>
            <div className="delta neutral">Across {offers.length} offers</div>
          </div>
          <div className="db-card">
            <div className="lab">Verified outcomes — 30d</div>
            <div className="num">1,284</div>
            <div className="delta"><span className="chip">▲ 96 this week</span></div>
          </div>
          <div className="db-card">
            <div className="lab">Impressions billed</div>
            <div className="num">0</div>
            <div className="delta neutral">By design</div>
          </div>
          <div className="db-card">
            <div className="lab">Active offers</div>
            <div className="num">{offers.length}</div>
            <div className="delta neutral">All budget-capped</div>
          </div>
        </div>
        <RvCard title="Report — per verified outcome">
          <div className="rv-kv"><span className="k">Spend (epoch 2026-06)</span><span className="v">$2,472.00</span></div>
          <div className="rv-kv"><span className="k">Equals</span><span className="v">412 outcomes × incentive</span></div>
          <div className="rv-kv"><span className="k">Impressions billed</span><span className="v">0</span></div>
        </RvCard>
      </div>
    </div>
  );
}

/* ---------- mandates ---------------------------------------------------------- */

function RvMandates() {
  const [sponsored, setSponsored] = useState(true);
  const [scope, setScope] = useState("Beverages");
  const [ceiling, setCeiling] = useState("$40.00");
  const [signed, setSigned] = useState(false);

  return (
    <div className="rv-two rv-rise">
      <RvCard title="Sign a buyer mandate">
        <div className="rv-field">
          <label>Scope</label>
          <select value={scope} onChange={(e) => { setScope(e.target.value); setSigned(false); }}>
            <option>Beverages</option><option>Fitness</option><option>Home & tools</option><option>Any merchant</option>
          </select>
        </div>
        <div className="rv-field">
          <label>Spend ceiling</label>
          <select value={ceiling} onChange={(e) => { setCeiling(e.target.value); setSigned(false); }}>
            <option>$5.00</option><option>$20.00</option><option>$40.00</option><option>$100.00</option>
          </select>
        </div>
        <div className="rv-field" style={{ marginBottom: 20 }}>
          <label>Sponsorship preference</label>
          <span className={"rv-toggle " + (sponsored ? "on" : "")} onClick={() => { setSponsored(!sponsored); setSigned(false); }}>
            <span className="track"></span>
            <span className="lab">{sponsored ? "Sponsored offers allowed" : "Opted out of paid influence"}</span>
          </span>
          <div className="hint" style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--ink-300)", marginTop: 6 }}>
            Opting out is enforceable — disclosed offers are excluded before scoring.
          </div>
        </div>
        <button className="rv-btn primary" onClick={() => setSigned(true)} disabled={signed}>
          {signed ? "Mandate signed" : "Sign mandate"}
        </button>
      </RvCard>
      <RvCard title="Mandate — what the agent is allowed to do" pad={false}>
        <div className="rv-trace" style={{ border: "none", borderRadius: "0 0 12px 12px", minHeight: 220 }}>
          <div className="t-line"><span className="t-key">scope</span><span>{scope.toLowerCase()}</span></div>
          <div className="t-line"><span className="t-key">spend_ceiling</span><span>{ceiling}</span></div>
          <div className="t-line"><span className="t-key">sponsored</span><span className={sponsored ? "" : "t-flag"}>{sponsored ? "allowed (disclosed only)" : "opted_out"}</span></div>
          <div className="t-line"><span className="t-key">merchant_policy</span><span>allow-list enforced</span></div>
          <div className="t-line"><span className="t-key">status</span><span className={signed ? "t-ok" : "t-empty"}>{signed ? "signed — gates active before reserve" : "unsigned draft"}</span></div>
        </div>
      </RvCard>
    </div>
  );
}

/* ---------- proof room ---------------------------------------------------------- */

function RvProofRoom({ proof, events, onTamper }) {
  return (
    <div className="rv-two rv-rise">
      <div className="rv-proof-card">
        <div className="type-label" style={{ marginBottom: 12, color: "var(--ink-500)" }}>Shareable proof room</div>
        <div className="inner">
          {proof ? (
            <div>
              <div className="rv-kv"><span className="k">Offer</span><span className="v">{proof.offer}</span></div>
              <div className="rv-kv"><span className="k">Brand</span><span className="v">{proof.brand}</span></div>
              <div className="rv-kv"><span className="k">Verifier status</span><span className="v"><RvStatus s="verified" /></span></div>
              <div className="rv-kv"><span className="k">Verified outcomes</span><span className="v">{proof.outcomes.toLocaleString()}</span></div>
              <div className="rv-kv"><span className="k">Impressions billed</span><span className="v">{proof.billed}</span></div>
              <div style={{ marginTop: 14 }}>
                <div className="type-label" style={{ marginBottom: 6 }}>Receipt hash</div>
                <div className="rv-hash">0x6a1f3c…e94b07 — anchored to append-only log</div>
              </div>
            </div>
          ) : (
            <p className="type-small" style={{ margin: 0, color: "var(--ink-400)" }}>
              Run the demo loop or create an offer to generate a live proof-room card.
              The public page shows terms, disclosure, verifier status, the brand
              report, and the no-live-write boundary.
            </p>
          )}
        </div>
      </div>
      <RvCard
        title="Proof event log — hashed, append-only"
        action={<button className="rv-btn danger-ghost" onClick={onTamper}>Submit tampered receipt</button>}
        pad={false}
      >
        <div className="rv-trace" style={{ border: "none", borderRadius: "0 0 12px 12px" }}>
          {events.map((e, i) => (
            <div className="t-line" key={i}>
              <span className="t-time">{e.time}</span>
              <span className="t-key">{e.key}</span>
              <span className={e.tone === "ok" ? "t-ok" : e.tone === "flag" ? "t-flag" : ""}>{e.msg}</span>
            </div>
          ))}
        </div>
      </RvCard>
    </div>
  );
}

/* ---------- readiness rail -------------------------------------------------------- */

function RvReadiness() {
  const cols = [
    ["Ready to test today", "var(--viz-positive)", RV_READINESS.ready],
    ["Blocked behind gates", "var(--ink-300)", RV_READINESS.gated],
    ["Deliberately excluded", "var(--viz-negative)", RV_READINESS.excluded],
  ];
  return (
    <div className="rv-rise">
      <div className="rv-three">
        {cols.map(([title, dot, items]) => (
          <div className="rv-rail-col" key={title}>
            <h3><span className="dot" style={{ background: dot }}></span>{title}</h3>
            <ul>
              {items.map(([t, d]) => (
                <li key={t}><strong>{t}</strong> — {d}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="type-small" style={{ marginTop: 20, color: "var(--ink-400)", maxWidth: 720 }}>
        Claim boundary: partner-ready pilot language still requires the fresh broad
        Cowork gate. Full production-ready has separate live and provider blockers.
      </p>
    </div>
  );
}

/* ---------- console shell ------------------------------------------------------------ */

const RV_TABS = [
  ["demo", "Watch a run"],
  ["market", "What agents see"],
  ["command", "Create an offer"],
  ["mandates", "Buyer controls"],
  ["proof", "Proof room"],
  ["readiness", "What's ready"],
];

function RvConsole({ tab, setTab, demoSpeed }) {
  const [offers, setOffers] = useState(RV_OFFERS_SEED);
  const [proof, setProof] = useState(null);
  const [events, setEvents] = useState([
    { time: "09:14:02", key: "offer", msg: "off_8f2e91 published — terms hashed", tone: "" },
    { time: "09:14:31", key: "reserve", msg: "agent gateway key accepted", tone: "" },
    { time: "09:15:07", key: "verify", msg: "rcp_88c2 accepted — value released", tone: "ok" },
  ]);

  const addEvent = (key, msg, tone) =>
    setEvents((ev) => [...ev, { time: new Date().toTimeString().slice(0, 8), key, msg, tone }]);

  const handleProof = (p) => {
    setProof(p);
    addEvent("proof", p.id + " generated — proof room shareable", "ok");
  };

  const handleCreate = (offer) => {
    setOffers((o) => [offer, ...o]);
    setProof({ id: "proof_" + offer.id.slice(4), offer: offer.name, brand: offer.brand, verifier: "verified", outcomes: 0, billed: 0 });
    addEvent("offer", offer.id + " published by " + offer.brand, "");
  };

  const handleTamper = () =>
    addEvent("integrity", "tampered receipt flagged — $0 released", "flag");

  return (
    <section className="rv-console" id="rv-console" data-screen-label="Console" data-comment-anchor="rv-console">
      <div className="shell">
        <div className="rv-console-head">
          <div>
            <div className="type-label" style={{ marginBottom: 10 }}>Try it yourself</div>
            <h2>The same loop, hands on.</h2>
            <p>
              Everything below runs against demo data — nothing is billed and no
              payments move. Watch a run, see what agents see, publish an offer,
              and open its proof room.
            </p>
          </div>
          <div className="db-tabs" style={{ marginBottom: 0 }}>
            {RV_TABS.map(([id, label]) => (
              <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 28 }}>
          {tab === "demo" && <RvDemoLoop speed={demoSpeed} onProof={handleProof} />}
          {tab === "market" && <RvMarketplace offers={offers} />}
          {tab === "command" && <RvBrandCommand offers={offers} onCreate={handleCreate} />}
          {tab === "mandates" && <RvMandates />}
          {tab === "proof" && <RvProofRoom proof={proof} events={events} onTamper={handleTamper} />}
          {tab === "readiness" && <RvReadiness />}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { RvConsole });
