// Revolv — shared demo data (curated, realistic; no live calls)

const RV_OFFERS_SEED = [
  {
    id: "off_8f2e91",
    name: "Espresso subscription — first month",
    brand: "Lavazza",
    incentive: "$6.00 / verified outcome",
    sponsored: true,
    cap: "$12,000",
    hash: "0x8f2e…91ac",
    status: "agent-visible",
  },
  {
    id: "off_4b7d22",
    name: "Membership trial — 14 day",
    brand: "GoodLife Fitness",
    incentive: "$9.50 / verified outcome",
    sponsored: true,
    cap: "$24,000",
    hash: "0x4b7d…22e0",
    status: "agent-visible",
  },
  {
    id: "off_c19a4e",
    name: "Pint bundle — loyalty tier",
    brand: "Ben & Jerry's",
    incentive: "$2.25 / verified outcome",
    sponsored: true,
    cap: "$8,500",
    hash: "0xc19a…4e77",
    status: "reserved",
  },
  {
    id: "off_72e0b3",
    name: "Power-tool registration credit",
    brand: "Worx",
    incentive: "$4.00 / verified outcome",
    sponsored: false,
    cap: "$15,000",
    hash: "0x72e0…b3f1",
    status: "agent-visible",
  },
];

const RV_DEMO_STEPS = [
  {
    title: "Autonomous agent run",
    desc: "The agent scores disclosed offers, picks the best within its mandate, redeems, and gets verified.",
    trace: [
      ["mandate", "loaded — scope: beverages, ceiling $40.00, sponsored: allowed"],
      ["discover", "4 structured offers via MCP — disclosure attached"],
      ["score", "incentive density ranked — off_8f2e91 selected"],
      ["redeem", "reserve → redeem within cap", "ok"],
      ["verify", "receipt accepted by independent verifier", "ok"],
    ],
  },
  {
    title: "Unsponsored principal",
    desc: "This principal opted out of paid influence. Disclosure makes the opt-out enforceable.",
    trace: [
      ["mandate", "loaded — sponsored: opted out"],
      ["filter", "3 sponsored offers excluded before scoring"],
      ["result", "no sponsored action taken", "ok"],
    ],
  },
  {
    title: "Narrow mandate",
    desc: "Scope, merchant policy, and spend ceiling are checked before anything moves.",
    trace: [
      ["mandate", "loaded — scope: fitness only, ceiling $5.00"],
      ["gate", "off_4b7d22 blocked — incentive exceeds ceiling"],
      ["result", "nothing reserved, nothing redeemed", "ok"],
    ],
  },
  {
    title: "Red-team tamper",
    desc: "A tampered receipt is flagged for review. No value is released.",
    trace: [
      ["receipt", "rcp_a41f submitted — amount field altered"],
      ["integrity", "hash mismatch against append-only log", "flag"],
      ["result", "flagged for source review — $0 released", "flag"],
    ],
  },
  {
    title: "Brand report",
    desc: "Spend equals verified outcomes. Impressions billed: zero.",
    trace: [
      ["report", "epoch 2026-06 — 412 verified outcomes"],
      ["spend", "$2,472.00 = outcomes × incentive value", "ok"],
      ["billed", "impressions billed: 0", "ok"],
    ],
  },
];

const RV_READINESS = {
  ready: [
    ["Autonomous agent runs", "Full decision trace, inspectable per step."],
    ["Sponsored opt-out", "Paid influence provably blocked per principal."],
    ["Verify and dispute", "Source-review evidence, append-only event log."],
    ["Tenant API + gateway keys", "No raw secrets at rest."],
  ],
  gated: [
    ["Partner-ready pilot language", "Requires the fresh broad Cowork pass."],
    ["OIDC + custom domain", "Separate production gates."],
    ["Full production-ready evidence", "Stricter gate; live/provider blockers remain."],
  ],
  excluded: [
    ["Live DUAL writes", "No public write path is enabled."],
    ["Payment capture", "No wallet movement, payout, or settlement occurs."],
  ],
};

const RV_ROLE_VIEWS = {
  Brand: {
    lead: "Define sponsored terms, caps, and incentive value. Spend counts only after a verifier accepts a receipt.",
    rows: [
      ["Escrow budget remaining", "$48,200"],
      ["Verified outcomes (30d)", "1,284"],
      ["Impressions billed", "0"],
    ],
  },
  "Agent platform": {
    lead: "Discover structured offers over MCP. Buyer mandates decide what can be considered, reserved, or redeemed.",
    rows: [
      ["Offers discoverable", "4"],
      ["Reserve / redeem path", "Gateway key required"],
      ["Reads", "Public, no key"],
    ],
  },
  Buyer: {
    lead: "The mandate limits the agent: scope, spend ceiling, merchant policy, and sponsorship preference.",
    rows: [
      ["Sponsored influence", "Opt-out enforced"],
      ["Spend ceiling", "$40.00"],
      ["Scope", "Beverages"],
    ],
  },
  Verifier: {
    lead: "Receipts settle only when integrity checks pass. Tampered receipts are flagged before value is released.",
    rows: [
      ["Receipts verified (30d)", "1,284"],
      ["Flagged for review", "1"],
      ["Value released on flags", "$0"],
    ],
  },
};

window.RV_OFFERS_SEED = RV_OFFERS_SEED;
window.RV_DEMO_STEPS = RV_DEMO_STEPS;
window.RV_READINESS = RV_READINESS;
window.RV_ROLE_VIEWS = RV_ROLE_VIEWS;
