// Revolv — marketing-register sections (nav, hero, lifecycle, roles, boundary, footer)

function RvLogo({ inverted }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <DualMark size={22} />
      <span style={{
        fontFamily: "var(--font-sans)", fontWeight: 800, fontSize: 18,
        letterSpacing: "0.02em", color: inverted ? "white" : "var(--ink-700)",
      }}>
        DUAL
      </span>
      <span style={{ width: 1, height: 16, background: inverted ? "rgba(255,255,255,0.25)" : "var(--ink-200)" }}></span>
      <span style={{
        fontFamily: "var(--font-sans)", fontWeight: 500, fontSize: 13,
        letterSpacing: "0.14em", textTransform: "uppercase",
        color: inverted ? "rgba(255,255,255,0.8)" : "var(--ink-500)",
      }}>
        Revolv
      </span>
    </span>
  );
}

function RvNav({ onJump }) {
  return (
    <nav className="mk-nav" data-comment-anchor="rv-nav">
      <a className="logo" href="#top"><RvLogo /></a>
      <div className="links">
        <a onClick={() => onJump("loop")}>How it works</a>
        <a onClick={() => onJump("story")}>Why Revolv</a>
        <a onClick={() => onJump("console")}>Try it</a>
      </div>
      <div className="actions">
        <a className="btn btn-ghost" style={{ padding: "10px 16px" }} onClick={() => onJump("console")}>Run demo loop</a>
        <a className="btn btn-dark" style={{ padding: "10px 16px" }} onClick={() => onJump("console", "command")}>Create offer</a>
      </div>
    </nav>
  );
}

function RvHero({ showOrbit, onJump, hideChips }) {
  return (
    <section className="mk-hero" data-screen-label="Hero" data-comment-anchor="rv-hero" style={{ paddingBottom: showOrbit ? 0 : 80 }}>
      <div className="type-eyebrow" style={{ marginTop: 40, color: "var(--ink-500)" }}>Partner command centre</div>
      <h1>Offers that pay only for<br />proven outcomes</h1>
      <p>
        Revolv puts your offers in front of AI shopping agents. Buyers stay in
        control of what their agent can do, an independent verifier checks every
        redemption, and you never pay for impressions.
      </p>
      <div className="ctas">
        <a className="btn btn-primary" onClick={() => onJump("console", "command")}>
          Create offer <span className="arr">→</span>
        </a>
        <a className="btn btn-text" onClick={() => onJump("console")}>Run demo loop</a>
      </div>
      <div className="rv-posture" style={hideChips ? { display: "none" } : null}>
        <span className="rv-chip"><span className="dot"></span><strong>Read-only</strong> DUAL posture</span>
        <span className="rv-chip"><span className="dot"></span><strong>Scoped</strong> v0.4 Cowork pass</span>
        <span className="rv-chip"><span className="dot pending"></span><strong>Partner gate</strong> pending</span>
        <span className="rv-chip"><span className="dot pending"></span><strong>No</strong> payment capture</span>
      </div>
      {showOrbit && (
        <img
          className="orbit"
          src="assets/illustrations/hero-orbit.png"
          alt="Real-world offers orbiting the DUAL mark"
        />
      )}
    </section>
  );
}

const RV_LIFECYCLE = [
  ["You publish an offer", "Set the terms, the budget cap, and what a verified outcome is worth to you."],
  ["The buyer sets limits", "Each buyer decides what their agent may spend, where, and whether sponsored offers are welcome."],
  ["An agent redeems", "Agents only act on offers that fit what the buyer allowed — nothing moves otherwise."],
  ["A verifier checks", "An independent check confirms the redemption is real before any value is released."],
  ["You see the results", "Your report shows verified outcomes and exactly what you paid — impressions billed: zero."],
];

function RvLifecycle() {
  return (
    <section className="mk-section tinted" id="rv-loop" data-screen-label="How it works" data-comment-anchor="rv-lifecycle">
      <div className="container">
        <div className="eyebrow">How it works</div>
        <h2>From offer to verified outcome.</h2>
        <p className="lead">
          Five steps, one controlled path — the same loop you can try for yourself below.
        </p>
        <div className="rv-steps">
          {RV_LIFECYCLE.map(([t, d], i) => (
            <div className="rv-step" key={t}>
              <div className="n">0{i + 1}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const RV_ROLES = [
  {
    ill: "assets/illustrations/smart-contract-issuance.png",
    role: "Brand",
    title: "Publish a budget-capped offer.",
    body: "Brand teams define sponsored terms, caps, and incentive value. Spend is counted only after a verifier accepts a receipt.",
  },
  {
    ill: "assets/illustrations/integration.png",
    role: "Agent platform",
    title: "Monetise intent without hidden ads.",
    body: "Agents discover structured offers over MCP, but buyer mandates decide what can be considered, reserved, or redeemed.",
  },
  {
    ill: "assets/illustrations/compliance.png",
    role: "Buyer and verifier",
    title: "Keep control and proof separate.",
    body: "The buyer can opt out of sponsored influence. The verifier rejects tampered receipts before value is released.",
  },
];

function RvStory() {
  return (
    <section className="mk-section white" id="rv-story" data-screen-label="Partner story" data-comment-anchor="rv-story">
      <div className="container">
        <div className="eyebrow">Why Revolv</div>
        <h2>Replace ad inventory with a proof-backed offer loop.</h2>
        <p className="lead">
          You don't need to believe in a new ad format. You need to see a safe
          loop — a published offer, a buyer in control, an eligible redemption,
          and a verifier who decides whether you pay.
        </p>
        <div className="mk-feature-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {RV_ROLES.map((r) => (
            <div className="mk-feature" key={r.role}>
              <div className="ill"><img src={r.ill} alt="" /></div>
              <div className="type-label" style={{ marginBottom: 8 }}>{r.role}</div>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RvFooter() {
  return (
    <footer className="db-footer" data-comment-anchor="rv-footer" style={{ maxWidth: "none", margin: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <RvLogo />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <span>Demo environment — no live writes, no payments</span>
        <span>2026 © DUAL</span>
      </div>
    </footer>
  );
}

Object.assign(window, { RvLogo, RvNav, RvHero, RvLifecycle, RvStory, RvFooter });
