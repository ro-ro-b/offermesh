const el = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const campaign = query.get("campaign");
const publisher = query.get("publisher");
const placement =
  /^[0-9a-f]{64}$/.test(campaign || "") &&
  ["fieldnotes", "arcade"].includes(publisher);
const api = placement
  ? "/api/engagement/placements/" + campaign + "/" + publisher + "/"
  : "/api/engagement/";
if (placement)
  el("back").href =
    "./?" + new URLSearchParams({ campaign, publisher }) + "#playtest";

async function json(path, body) {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  if (!response.ok)
    throw new Error(
      "The record could not be confirmed. Check the original IDs and try again.",
    );
  return response.json();
}
let plan;
function show(state) {
  const player = state.participant;
  plan = player.claimPlan;
  const proof = player.claimProof;
  const eligible = player.status === "complete";
  el("personal").textContent = proof
    ? "The original mint matched this playtest, game and recipient."
    : plan
      ? "Request prepared for " +
        plan.recipient +
        ". Awaiting the issuer’s mint."
      : eligible
        ? state.proof?.verified
          ? "Your playtest is complete. You can request the wallet entitlement."
          : "Your game is available. Wallet requests will reopen when the issuer template can be verified."
        : "Complete the playtest before preparing a wallet request.";
  el("prepare").hidden =
    !eligible || Boolean(plan) || state.proof?.verified !== true;
  el("handoff").hidden = !plan || Boolean(proof);
  el("verify").hidden = !plan || Boolean(proof);
  el("success").hidden = !proof;
  if (plan) el("token").textContent = plan.requestToken || "";
  if (proof) {
    el("receipt").textContent =
      "Wallet " + proof.recipient + " · Object " + proof.objectId;
    el("portable").href =
      "proof.html?" +
      new URLSearchParams({ object: proof.objectId, action: proof.actionId });
  }
}
async function submit(event, path, body) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  el("error").textContent = "";
  try {
    show(await json(api + path, body));
  } catch (error) {
    el("error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}
el("prepare").addEventListener("submit", (event) =>
  submit(event, "claim-plan", { wallet: el("wallet").value.trim() }),
);
el("verify").addEventListener("submit", (event) =>
  submit(event, "verify-claim", {
    objectId: el("object").value.trim(),
    actionId: el("action").value.trim(),
  }),
);
el("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(plan.requestToken);
    el("copied").textContent = "Request code copied.";
  } catch {
    el("copied").textContent = "Open “Show the request code” to copy it.";
  }
});
(async () => {
  const canonical = await json("/api/engagement/campaign-proof").catch(
    () => null,
  );
  el("template").textContent = canonical?.verified
    ? "Dual returned the Night Signal terms and private mint rule. The current download matches the registered SHA-256 fingerprint. Checked " +
      new Date(canonical.checkedAt).toLocaleString() +
      "."
    : "Live template verification is unavailable. Wallet requests require a matching template and game.";
  if (query.has("action") || query.has("object")) {
    el("your-record").hidden = true;
    el("public-record").hidden = false;
    try {
      const args = new URLSearchParams({
        object: query.get("object"),
        action: query.get("action"),
      });
      const p = await json("/api/engagement/public-receipt?" + args);
      el("public-status").textContent =
        "Verified on Dual. This game entitlement was issued to " +
        p.recipient +
        ". Object " +
        p.objectId +
        " · Mint " +
        p.actionId +
        ".";
    } catch {
      el("public-status").textContent =
        "Unverified. The original mint, recipient and game right must match Dual’s current record.";
    }
    return;
  }
  try {
    show(await json(api + "state"));
  } catch {
    el("personal").textContent =
      "This playtest session is unavailable. Reopen your original placement.";
  }
})();
