// Revolv — marketing-register sections (nav, hero, lifecycle, roles, boundary, footer)

function RvLogo({
  inverted
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(DualMark, {
    size: 22
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontWeight: 800,
      fontSize: 18,
      letterSpacing: "0.02em",
      color: inverted ? "white" : "var(--ink-700)"
    }
  }, "DUAL"), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 1,
      height: 16,
      background: inverted ? "rgba(255,255,255,0.25)" : "var(--ink-200)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontWeight: 500,
      fontSize: 13,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: inverted ? "rgba(255,255,255,0.8)" : "var(--ink-500)"
    }
  }, "Revolv"));
}
function RvNav({
  onJump
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: "mk-nav",
    "data-comment-anchor": "rv-nav"
  }, /*#__PURE__*/React.createElement("a", {
    className: "logo",
    href: "#top"
  }, /*#__PURE__*/React.createElement(RvLogo, null)), /*#__PURE__*/React.createElement("div", {
    className: "links"
  }, /*#__PURE__*/React.createElement("a", {
    onClick: () => onJump("loop")
  }, "How it works"), /*#__PURE__*/React.createElement("a", {
    onClick: () => onJump("story")
  }, "Why Revolv"), /*#__PURE__*/React.createElement("a", {
    onClick: () => onJump("console")
  }, "Try it")), /*#__PURE__*/React.createElement("div", {
    className: "actions"
  }, /*#__PURE__*/React.createElement("a", {
    className: "btn btn-ghost",
    style: {
      padding: "10px 16px"
    },
    onClick: () => onJump("console")
  }, "Run demo loop"), /*#__PURE__*/React.createElement("a", {
    className: "btn btn-dark",
    style: {
      padding: "10px 16px"
    },
    onClick: () => onJump("console", "command")
  }, "Create offer")));
}
function RvHero({
  showOrbit,
  onJump,
  hideChips
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "mk-hero",
    "data-screen-label": "Hero",
    "data-comment-anchor": "rv-hero",
    style: {
      paddingBottom: showOrbit ? 0 : 80
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "type-eyebrow",
    style: {
      marginTop: 40,
      color: "var(--ink-500)"
    }
  }, "Partner command centre"), /*#__PURE__*/React.createElement("h1", null, "Offers that pay only for", /*#__PURE__*/React.createElement("br", null), "proven outcomes"), /*#__PURE__*/React.createElement("p", null, "Revolv puts your offers in front of AI shopping agents. Buyers stay in control of what their agent can do, an independent verifier checks every redemption, and you never pay for impressions."), /*#__PURE__*/React.createElement("div", {
    className: "ctas"
  }, /*#__PURE__*/React.createElement("a", {
    className: "btn btn-primary",
    onClick: () => onJump("console", "command")
  }, "Create offer ", /*#__PURE__*/React.createElement("span", {
    className: "arr"
  }, "\u2192")), /*#__PURE__*/React.createElement("a", {
    className: "btn btn-text",
    onClick: () => onJump("console")
  }, "Run demo loop")), /*#__PURE__*/React.createElement("div", {
    className: "rv-posture",
    style: hideChips ? {
      display: "none"
    } : null
  }, /*#__PURE__*/React.createElement("span", {
    className: "rv-chip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("strong", null, "Read-only"), " DUAL posture"), /*#__PURE__*/React.createElement("span", {
    className: "rv-chip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot"
  }), /*#__PURE__*/React.createElement("strong", null, "Scoped"), " v0.4 Cowork pass"), /*#__PURE__*/React.createElement("span", {
    className: "rv-chip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot pending"
  }), /*#__PURE__*/React.createElement("strong", null, "Partner gate"), " pending"), /*#__PURE__*/React.createElement("span", {
    className: "rv-chip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot pending"
  }), /*#__PURE__*/React.createElement("strong", null, "No"), " payment capture")), showOrbit && /*#__PURE__*/React.createElement("img", {
    className: "orbit",
    src: "assets/illustrations/hero-orbit.png",
    alt: "Real-world offers orbiting the DUAL mark"
  }));
}
const RV_LIFECYCLE = [["You publish an offer", "Set the terms, the budget cap, and what a verified outcome is worth to you."], ["The buyer sets limits", "Each buyer decides what their agent may spend, where, and whether sponsored offers are welcome."], ["An agent redeems", "Agents only act on offers that fit what the buyer allowed — nothing moves otherwise."], ["A verifier checks", "An independent check confirms the redemption is real before any value is released."], ["You see the results", "Your report shows verified outcomes and exactly what you paid — impressions billed: zero."]];
function RvLifecycle() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mk-section tinted",
    id: "rv-loop",
    "data-screen-label": "How it works",
    "data-comment-anchor": "rv-lifecycle"
  }, /*#__PURE__*/React.createElement("div", {
    className: "container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "How it works"), /*#__PURE__*/React.createElement("h2", null, "From offer to verified outcome."), /*#__PURE__*/React.createElement("p", {
    className: "lead"
  }, "Five steps, one controlled path \u2014 the same loop you can try for yourself below."), /*#__PURE__*/React.createElement("div", {
    className: "rv-steps"
  }, RV_LIFECYCLE.map(([t, d], i) => /*#__PURE__*/React.createElement("div", {
    className: "rv-step",
    key: t
  }, /*#__PURE__*/React.createElement("div", {
    className: "n"
  }, "0", i + 1), /*#__PURE__*/React.createElement("h3", null, t), /*#__PURE__*/React.createElement("p", null, d))))));
}
const RV_ROLES = [{
  ill: "assets/illustrations/smart-contract-issuance.png",
  role: "Brand",
  title: "Publish a budget-capped offer.",
  body: "Brand teams define sponsored terms, caps, and incentive value. Spend is counted only after a verifier accepts a receipt."
}, {
  ill: "assets/illustrations/integration.png",
  role: "Agent platform",
  title: "Monetise intent without hidden ads.",
  body: "Agents discover structured offers over MCP, but buyer mandates decide what can be considered, reserved, or redeemed."
}, {
  ill: "assets/illustrations/compliance.png",
  role: "Buyer and verifier",
  title: "Keep control and proof separate.",
  body: "The buyer can opt out of sponsored influence. The verifier rejects tampered receipts before value is released."
}];
function RvStory() {
  return /*#__PURE__*/React.createElement("section", {
    className: "mk-section white",
    id: "rv-story",
    "data-screen-label": "Partner story",
    "data-comment-anchor": "rv-story"
  }, /*#__PURE__*/React.createElement("div", {
    className: "container"
  }, /*#__PURE__*/React.createElement("div", {
    className: "eyebrow"
  }, "Why Revolv"), /*#__PURE__*/React.createElement("h2", null, "Replace ad inventory with a proof-backed offer loop."), /*#__PURE__*/React.createElement("p", {
    className: "lead"
  }, "You don't need to believe in a new ad format. You need to see a safe loop \u2014 a published offer, a buyer in control, an eligible redemption, and a verifier who decides whether you pay."), /*#__PURE__*/React.createElement("div", {
    className: "mk-feature-row",
    style: {
      gridTemplateColumns: "repeat(3, 1fr)"
    }
  }, RV_ROLES.map(r => /*#__PURE__*/React.createElement("div", {
    className: "mk-feature",
    key: r.role
  }, /*#__PURE__*/React.createElement("div", {
    className: "ill"
  }, /*#__PURE__*/React.createElement("img", {
    src: r.ill,
    alt: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "type-label",
    style: {
      marginBottom: 8
    }
  }, r.role), /*#__PURE__*/React.createElement("h3", null, r.title), /*#__PURE__*/React.createElement("p", null, r.body))))));
}
function RvFooter() {
  return /*#__PURE__*/React.createElement("footer", {
    className: "db-footer",
    "data-comment-anchor": "rv-footer",
    style: {
      maxWidth: "none",
      margin: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 16
    }
  }, /*#__PURE__*/React.createElement(RvLogo, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 24,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("span", null, "Demo environment \u2014 no live writes, no payments"), /*#__PURE__*/React.createElement("span", null, "2026 \xA9 DUAL")));
}
Object.assign(window, {
  RvLogo,
  RvNav,
  RvHero,
  RvLifecycle,
  RvStory,
  RvFooter
});
