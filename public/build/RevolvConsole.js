// Revolv — console (dashboard register): demo loop, marketplace, brand command,
// mandates, proof room, readiness. State lives in RvConsole.

const {
  useState,
  useRef,
  useEffect
} = React;

/* ---------- small shared bits ---------------------------------------------- */

function RvStatus({
  s
}) {
  const cls = {
    "agent-visible": "",
    reserved: "pending",
    verified: "ok",
    flagged: "flag"
  }[s] || "";
  return /*#__PURE__*/React.createElement("span", {
    className: "db-status " + cls
  }, s.replace("-", " "));
}
function RvCard({
  title,
  action,
  children,
  pad
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "db-card",
    style: {
      padding: 0
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "db-table-head",
    style: {
      padding: "14px 18px"
    }
  }, /*#__PURE__*/React.createElement("h3", null, title), action), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: pad === false ? 0 : "16px 18px"
    }
  }, children));
}

/* ---------- demo loop -------------------------------------------------------- */

function RvDemoLoop({
  speed,
  onProof
}) {
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
      timers.current.push(setTimeout(() => setStepState(s => ({
        ...s,
        [i]: "active"
      })), t));
      step.trace.forEach(([key, msg, tone]) => {
        t += base * 0.6;
        timers.current.push(setTimeout(() => {
          const time = new Date().toTimeString().slice(0, 8);
          setLines(l => [...l, {
            time,
            key,
            msg,
            tone
          }]);
        }, t));
      });
      t += base * 0.4;
      timers.current.push(setTimeout(() => setStepState(s => ({
        ...s,
        [i]: "done"
      })), t));
    });
    timers.current.push(setTimeout(() => {
      setRunning(false);
      onProof({
        id: "proof_" + Math.random().toString(16).slice(2, 8),
        offer: "Espresso subscription — first month",
        brand: "Lavazza",
        verifier: "verified",
        outcomes: 412,
        billed: 0
      });
    }, t + 300));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "rv-two rv-rise"
  }, /*#__PURE__*/React.createElement(RvCard, {
    title: "Partner demo mode \u2014 one run, five proofs",
    action: /*#__PURE__*/React.createElement("button", {
      className: "rv-btn primary",
      onClick: run,
      disabled: running
    }, running ? "Running…" : "Run partner demo")
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-runner"
  }, RV_DEMO_STEPS.map((s, i) => /*#__PURE__*/React.createElement("div", {
    className: "rv-run-step " + (stepState[i] || ""),
    key: s.title
  }, /*#__PURE__*/React.createElement("span", {
    className: "marker"
  }, stepState[i] === "done" ? "✓" : i + 1), /*#__PURE__*/React.createElement("div", {
    className: "body"
  }, /*#__PURE__*/React.createElement("h4", null, s.title), /*#__PURE__*/React.createElement("p", null, s.desc)), /*#__PURE__*/React.createElement("span", {
    className: "state"
  }, stepState[i] === "done" ? "Passed" : stepState[i] === "active" ? "Running" : "Queued"))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(RvCard, {
    title: "Decision trace",
    pad: false
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-trace",
    ref: logRef,
    style: {
      border: "none",
      borderRadius: "0 0 12px 12px"
    }
  }, lines.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "t-empty"
  }, "Run the demo to stream the decision trace."), lines.map((l, i) => /*#__PURE__*/React.createElement("div", {
    className: "t-line",
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "t-time"
  }, l.time), /*#__PURE__*/React.createElement("span", {
    className: "t-key"
  }, l.key), /*#__PURE__*/React.createElement("span", {
    className: l.tone === "ok" ? "t-ok" : l.tone === "flag" ? "t-flag" : ""
  }, l.msg))))), /*#__PURE__*/React.createElement("div", {
    className: "db-kpi-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "db-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab"
  }, "Verified outcomes"), /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, "412"), /*#__PURE__*/React.createElement("div", {
    className: "delta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "chip"
  }, "\u25B2 38 today"))), /*#__PURE__*/React.createElement("div", {
    className: "db-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab"
  }, "Impressions billed"), /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, "0"), /*#__PURE__*/React.createElement("div", {
    className: "delta neutral"
  }, "Always")))));
}

/* ---------- marketplace ------------------------------------------------------ */

function RvMarketplace({
  offers
}) {
  const [role, setRole] = useState("Agent platform");
  const view = RV_ROLE_VIEWS[role];
  return /*#__PURE__*/React.createElement("div", {
    className: "rv-two rv-rise"
  }, /*#__PURE__*/React.createElement("div", {
    className: "db-table"
  }, /*#__PURE__*/React.createElement("div", {
    className: "db-table-head"
  }, /*#__PURE__*/React.createElement("h3", null, "Live offers \u2014 what agents see over MCP"), /*#__PURE__*/React.createElement("span", {
    className: "type-label"
  }, "Disclosure attached")), /*#__PURE__*/React.createElement("table", {
    className: "db-grid"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "Offer"), /*#__PURE__*/React.createElement("th", null, "Brand"), /*#__PURE__*/React.createElement("th", null, "Incentive"), /*#__PURE__*/React.createElement("th", null, "Sponsored"), /*#__PURE__*/React.createElement("th", null, "Terms hash"), /*#__PURE__*/React.createElement("th", null, "Status"))), /*#__PURE__*/React.createElement("tbody", null, offers.map(o => /*#__PURE__*/React.createElement("tr", {
    key: o.id
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      fontWeight: 500
    }
  }, o.name), /*#__PURE__*/React.createElement("td", null, o.brand), /*#__PURE__*/React.createElement("td", null, o.incentive), /*#__PURE__*/React.createElement("td", null, o.sponsored ? "Disclosed" : "—"), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("span", {
    className: "db-addr"
  }, o.hash)), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement(RvStatus, {
    s: o.status
  }))))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(RvCard, {
    title: "Role-based view",
    action: null
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-rolebar",
    style: {
      marginBottom: 14,
      flexWrap: "wrap"
    }
  }, Object.keys(RV_ROLE_VIEWS).map(r => /*#__PURE__*/React.createElement("button", {
    key: r,
    className: r === role ? "active" : "",
    onClick: () => setRole(r)
  }, r))), /*#__PURE__*/React.createElement("p", {
    className: "type-small",
    style: {
      margin: "0 0 10px",
      color: "var(--ink-500)"
    }
  }, view.lead), /*#__PURE__*/React.createElement("div", null, view.rows.map(([k, v]) => /*#__PURE__*/React.createElement("div", {
    className: "rv-kv",
    key: k
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, k), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, v))))), /*#__PURE__*/React.createElement(RvCard, {
    title: "Reference agent integration"
  }, /*#__PURE__*/React.createElement("p", {
    className: "type-small",
    style: {
      margin: 0,
      color: "var(--ink-500)"
    }
  }, "Connect an agent to MCP reads publicly, then use a gateway key only for reserve, redeem, and simulate paths. Those paths fail closed with", " ", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: "var(--font-mono)",
      fontSize: 11.5,
      color: "var(--teal-600)"
    }
  }, "agent_auth_required"), "."))));
}

/* ---------- brand command (create offer wizard + KPIs) ----------------------- */

function RvBrandCommand({
  offers,
  onCreate
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    brand: "",
    name: "",
    cap: "$10,000",
    incentive: "$5.00"
  });
  const created = step === 3;
  const next = () => setStep(s => Math.min(3, s + 1));
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
      status: "agent-visible"
    });
    setStep(3);
  };
  const labels = ["Brand", "Budget", "Proof"];
  return /*#__PURE__*/React.createElement("div", {
    className: "rv-two rv-rise"
  }, /*#__PURE__*/React.createElement(RvCard, {
    title: "Create offer \u2014 one controlled path"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-wizard-steps"
  }, labels.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: l,
    className: "ws " + (i === step ? "active" : i < step || created ? "done" : "")
  }, /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, i < step || created ? "✓" : "0" + (i + 1)), " ", l))), step === 0 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "rv-field"
  }, /*#__PURE__*/React.createElement("label", null, "Brand"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "e.g. Lavazza",
    value: form.brand,
    onChange: e => setForm({
      ...form,
      brand: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "rv-field"
  }, /*#__PURE__*/React.createElement("label", null, "Offer name"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Name the offer agents will see",
    value: form.name,
    onChange: e => setForm({
      ...form,
      name: e.target.value
    })
  }), /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "Creates the brand workspace and a budget-capped program.")), /*#__PURE__*/React.createElement("button", {
    className: "rv-btn primary",
    onClick: next,
    disabled: !canNext
  }, "Continue")), step === 1 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "rv-field"
  }, /*#__PURE__*/React.createElement("label", null, "Outcome cap (escrow budget)"), /*#__PURE__*/React.createElement("select", {
    value: form.cap,
    onChange: e => setForm({
      ...form,
      cap: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", null, "$5,000"), /*#__PURE__*/React.createElement("option", null, "$10,000"), /*#__PURE__*/React.createElement("option", null, "$25,000"), /*#__PURE__*/React.createElement("option", null, "$50,000"))), /*#__PURE__*/React.createElement("div", {
    className: "rv-field"
  }, /*#__PURE__*/React.createElement("label", null, "Incentive per verified outcome"), /*#__PURE__*/React.createElement("select", {
    value: form.incentive,
    onChange: e => setForm({
      ...form,
      incentive: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", null, "$2.50"), /*#__PURE__*/React.createElement("option", null, "$5.00"), /*#__PURE__*/React.createElement("option", null, "$7.50"), /*#__PURE__*/React.createElement("option", null, "$10.00")), /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "Spend is counted only after a verifier accepts a receipt.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "rv-btn ghost",
    onClick: () => setStep(0)
  }, "Back"), /*#__PURE__*/React.createElement("button", {
    className: "rv-btn primary",
    onClick: next
  }, "Continue"))), step === 2 && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "type-small",
    style: {
      marginTop: 0,
      color: "var(--ink-500)"
    }
  }, "Publishing mints the machine-readable offer, an agent preview, and a shareable proof-room link. Share the proof room before claiming readiness."), /*#__PURE__*/React.createElement("div", {
    className: "rv-hash",
    style: {
      marginBottom: 16
    }
  }, "revolv.dual.xyz/proof/", (form.brand || "brand").toLowerCase().replace(/[^a-z0-9]+/g, "-"), "/", (form.name || "offer").toLowerCase().replace(/[^a-z0-9]+/g, "-")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "rv-btn ghost",
    onClick: () => setStep(1)
  }, "Back"), /*#__PURE__*/React.createElement("button", {
    className: "rv-btn primary",
    onClick: finish
  }, "Create offer"))), created && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
    className: "type-small",
    style: {
      marginTop: 0,
      color: "var(--ink-500)"
    }
  }, /*#__PURE__*/React.createElement("strong", {
    style: {
      color: "var(--ink-700)"
    }
  }, form.name), " is live in the agent marketplace with disclosure attached. The proof room is shareable now."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "rv-btn ghost",
    onClick: () => {
      setStep(0);
      setForm({
        brand: "",
        name: "",
        cap: "$10,000",
        incentive: "$5.00"
      });
    }
  }, "Create another")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "db-kpi-panel",
    style: {
      gridTemplateColumns: "1fr 1fr"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "db-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab"
  }, "Escrow budget remaining"), /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, "$48,200"), /*#__PURE__*/React.createElement("div", {
    className: "delta neutral"
  }, "Across ", offers.length, " offers")), /*#__PURE__*/React.createElement("div", {
    className: "db-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab"
  }, "Verified outcomes \u2014 30d"), /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, "1,284"), /*#__PURE__*/React.createElement("div", {
    className: "delta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "chip"
  }, "\u25B2 96 this week"))), /*#__PURE__*/React.createElement("div", {
    className: "db-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab"
  }, "Impressions billed"), /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, "0"), /*#__PURE__*/React.createElement("div", {
    className: "delta neutral"
  }, "By design")), /*#__PURE__*/React.createElement("div", {
    className: "db-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lab"
  }, "Active offers"), /*#__PURE__*/React.createElement("div", {
    className: "num"
  }, offers.length), /*#__PURE__*/React.createElement("div", {
    className: "delta neutral"
  }, "All budget-capped"))), /*#__PURE__*/React.createElement(RvCard, {
    title: "Report \u2014 per verified outcome"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Spend (epoch 2026-06)"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "$2,472.00")), /*#__PURE__*/React.createElement("div", {
    className: "rv-kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Equals"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "412 outcomes \xD7 incentive")), /*#__PURE__*/React.createElement("div", {
    className: "rv-kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Impressions billed"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "0")))));
}

/* ---------- mandates ---------------------------------------------------------- */

function RvMandates() {
  const [sponsored, setSponsored] = useState(true);
  const [scope, setScope] = useState("Beverages");
  const [ceiling, setCeiling] = useState("$40.00");
  const [signed, setSigned] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "rv-two rv-rise"
  }, /*#__PURE__*/React.createElement(RvCard, {
    title: "Sign a buyer mandate"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-field"
  }, /*#__PURE__*/React.createElement("label", null, "Scope"), /*#__PURE__*/React.createElement("select", {
    value: scope,
    onChange: e => {
      setScope(e.target.value);
      setSigned(false);
    }
  }, /*#__PURE__*/React.createElement("option", null, "Beverages"), /*#__PURE__*/React.createElement("option", null, "Fitness"), /*#__PURE__*/React.createElement("option", null, "Home & tools"), /*#__PURE__*/React.createElement("option", null, "Any merchant"))), /*#__PURE__*/React.createElement("div", {
    className: "rv-field"
  }, /*#__PURE__*/React.createElement("label", null, "Spend ceiling"), /*#__PURE__*/React.createElement("select", {
    value: ceiling,
    onChange: e => {
      setCeiling(e.target.value);
      setSigned(false);
    }
  }, /*#__PURE__*/React.createElement("option", null, "$5.00"), /*#__PURE__*/React.createElement("option", null, "$20.00"), /*#__PURE__*/React.createElement("option", null, "$40.00"), /*#__PURE__*/React.createElement("option", null, "$100.00"))), /*#__PURE__*/React.createElement("div", {
    className: "rv-field",
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("label", null, "Sponsorship preference"), /*#__PURE__*/React.createElement("span", {
    className: "rv-toggle " + (sponsored ? "on" : ""),
    onClick: () => {
      setSponsored(!sponsored);
      setSigned(false);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "track"
  }), /*#__PURE__*/React.createElement("span", {
    className: "lab"
  }, sponsored ? "Sponsored offers allowed" : "Opted out of paid influence")), /*#__PURE__*/React.createElement("div", {
    className: "hint",
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: 12,
      color: "var(--ink-300)",
      marginTop: 6
    }
  }, "Opting out is enforceable \u2014 disclosed offers are excluded before scoring.")), /*#__PURE__*/React.createElement("button", {
    className: "rv-btn primary",
    onClick: () => setSigned(true),
    disabled: signed
  }, signed ? "Mandate signed" : "Sign mandate")), /*#__PURE__*/React.createElement(RvCard, {
    title: "Mandate \u2014 what the agent is allowed to do",
    pad: false
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-trace",
    style: {
      border: "none",
      borderRadius: "0 0 12px 12px",
      minHeight: 220
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "t-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "t-key"
  }, "scope"), /*#__PURE__*/React.createElement("span", null, scope.toLowerCase())), /*#__PURE__*/React.createElement("div", {
    className: "t-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "t-key"
  }, "spend_ceiling"), /*#__PURE__*/React.createElement("span", null, ceiling)), /*#__PURE__*/React.createElement("div", {
    className: "t-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "t-key"
  }, "sponsored"), /*#__PURE__*/React.createElement("span", {
    className: sponsored ? "" : "t-flag"
  }, sponsored ? "allowed (disclosed only)" : "opted_out")), /*#__PURE__*/React.createElement("div", {
    className: "t-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "t-key"
  }, "merchant_policy"), /*#__PURE__*/React.createElement("span", null, "allow-list enforced")), /*#__PURE__*/React.createElement("div", {
    className: "t-line"
  }, /*#__PURE__*/React.createElement("span", {
    className: "t-key"
  }, "status"), /*#__PURE__*/React.createElement("span", {
    className: signed ? "t-ok" : "t-empty"
  }, signed ? "signed — gates active before reserve" : "unsigned draft")))));
}

/* ---------- proof room ---------------------------------------------------------- */

function RvProofRoom({
  proof,
  events,
  onTamper
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "rv-two rv-rise"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-proof-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "type-label",
    style: {
      marginBottom: 12,
      color: "var(--ink-500)"
    }
  }, "Shareable proof room"), /*#__PURE__*/React.createElement("div", {
    className: "inner"
  }, proof ? /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "rv-kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Offer"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, proof.offer)), /*#__PURE__*/React.createElement("div", {
    className: "rv-kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Brand"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, proof.brand)), /*#__PURE__*/React.createElement("div", {
    className: "rv-kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Verifier status"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, /*#__PURE__*/React.createElement(RvStatus, {
    s: "verified"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "rv-kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Verified outcomes"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, proof.outcomes.toLocaleString())), /*#__PURE__*/React.createElement("div", {
    className: "rv-kv"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "Impressions billed"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, proof.billed)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "type-label",
    style: {
      marginBottom: 6
    }
  }, "Receipt hash"), /*#__PURE__*/React.createElement("div", {
    className: "rv-hash"
  }, "0x6a1f3c\u2026e94b07 \u2014 anchored to append-only log"))) : /*#__PURE__*/React.createElement("p", {
    className: "type-small",
    style: {
      margin: 0,
      color: "var(--ink-400)"
    }
  }, "Run the demo loop or create an offer to generate a live proof-room card. The public page shows terms, disclosure, verifier status, the brand report, and the no-live-write boundary."))), /*#__PURE__*/React.createElement(RvCard, {
    title: "Proof event log \u2014 hashed, append-only",
    action: /*#__PURE__*/React.createElement("button", {
      className: "rv-btn danger-ghost",
      onClick: onTamper
    }, "Submit tampered receipt"),
    pad: false
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-trace",
    style: {
      border: "none",
      borderRadius: "0 0 12px 12px"
    }
  }, events.map((e, i) => /*#__PURE__*/React.createElement("div", {
    className: "t-line",
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "t-time"
  }, e.time), /*#__PURE__*/React.createElement("span", {
    className: "t-key"
  }, e.key), /*#__PURE__*/React.createElement("span", {
    className: e.tone === "ok" ? "t-ok" : e.tone === "flag" ? "t-flag" : ""
  }, e.msg))))));
}

/* ---------- readiness rail -------------------------------------------------------- */

function RvReadiness() {
  const cols = [["Ready to test today", "var(--viz-positive)", RV_READINESS.ready], ["Blocked behind gates", "var(--ink-300)", RV_READINESS.gated], ["Deliberately excluded", "var(--viz-negative)", RV_READINESS.excluded]];
  return /*#__PURE__*/React.createElement("div", {
    className: "rv-rise"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-three"
  }, cols.map(([title, dot, items]) => /*#__PURE__*/React.createElement("div", {
    className: "rv-rail-col",
    key: title
  }, /*#__PURE__*/React.createElement("h3", null, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    style: {
      background: dot
    }
  }), title), /*#__PURE__*/React.createElement("ul", null, items.map(([t, d]) => /*#__PURE__*/React.createElement("li", {
    key: t
  }, /*#__PURE__*/React.createElement("strong", null, t), " \u2014 ", d)))))), /*#__PURE__*/React.createElement("p", {
    className: "type-small",
    style: {
      marginTop: 20,
      color: "var(--ink-400)",
      maxWidth: 720
    }
  }, "Claim boundary: partner-ready pilot language still requires the fresh broad Cowork gate. Full production-ready has separate live and provider blockers."));
}

/* ---------- console shell ------------------------------------------------------------ */

const RV_TABS = [["demo", "Watch a run"], ["market", "What agents see"], ["command", "Create an offer"], ["mandates", "Buyer controls"], ["proof", "Proof room"], ["readiness", "What's ready"]];
function RvConsole({
  tab,
  setTab,
  demoSpeed
}) {
  const [offers, setOffers] = useState(RV_OFFERS_SEED);
  const [proof, setProof] = useState(null);
  const [events, setEvents] = useState([{
    time: "09:14:02",
    key: "offer",
    msg: "off_8f2e91 published — terms hashed",
    tone: ""
  }, {
    time: "09:14:31",
    key: "reserve",
    msg: "agent gateway key accepted",
    tone: ""
  }, {
    time: "09:15:07",
    key: "verify",
    msg: "rcp_88c2 accepted — value released",
    tone: "ok"
  }]);
  const addEvent = (key, msg, tone) => setEvents(ev => [...ev, {
    time: new Date().toTimeString().slice(0, 8),
    key,
    msg,
    tone
  }]);
  const handleProof = p => {
    setProof(p);
    addEvent("proof", p.id + " generated — proof room shareable", "ok");
  };
  const handleCreate = offer => {
    setOffers(o => [offer, ...o]);
    setProof({
      id: "proof_" + offer.id.slice(4),
      offer: offer.name,
      brand: offer.brand,
      verifier: "verified",
      outcomes: 0,
      billed: 0
    });
    addEvent("offer", offer.id + " published by " + offer.brand, "");
  };
  const handleTamper = () => addEvent("integrity", "tampered receipt flagged — $0 released", "flag");
  return /*#__PURE__*/React.createElement("section", {
    className: "rv-console",
    id: "rv-console",
    "data-screen-label": "Console",
    "data-comment-anchor": "rv-console"
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rv-console-head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "type-label",
    style: {
      marginBottom: 10
    }
  }, "Try it yourself"), /*#__PURE__*/React.createElement("h2", null, "The same loop, hands on."), /*#__PURE__*/React.createElement("p", null, "Everything below runs against demo data \u2014 nothing is billed and no payments move. Watch a run, see what agents see, publish an offer, and open its proof room.")), /*#__PURE__*/React.createElement("div", {
    className: "db-tabs",
    style: {
      marginBottom: 0
    }
  }, RV_TABS.map(([id, label]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: tab === id ? "active" : "",
    onClick: () => setTab(id)
  }, label)))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 28
    }
  }, tab === "demo" && /*#__PURE__*/React.createElement(RvDemoLoop, {
    speed: demoSpeed,
    onProof: handleProof
  }), tab === "market" && /*#__PURE__*/React.createElement(RvMarketplace, {
    offers: offers
  }), tab === "command" && /*#__PURE__*/React.createElement(RvBrandCommand, {
    offers: offers,
    onCreate: handleCreate
  }), tab === "mandates" && /*#__PURE__*/React.createElement(RvMandates, null), tab === "proof" && /*#__PURE__*/React.createElement(RvProofRoom, {
    proof: proof,
    events: events,
    onTamper: handleTamper
  }), tab === "readiness" && /*#__PURE__*/React.createElement(RvReadiness, null))));
}
Object.assign(window, {
  RvConsole
});
