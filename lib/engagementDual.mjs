import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const API = "https://api.dual.network/public";
export const CAMPAIGN = Object.freeze({
  orgId: "6a69a42d04090c8909582563",
  issuer: "0xe7b65d8cda630351baa478331256e5060986f6bf",
  templateId: "6af3bf49d81da768fafdf958",
  templateName: "io.dual.revolv.nightsignal.playtest.v1",
  campaign: "night-signal-v1",
  right: "keep-and-play-offline-v1",
  description:
    "A Revolv demonstration. The holder may keep and play the four-level Night Signal browser game offline for personal use. Fictional sponsor Fallow Games. No cash value.",
  artifactSha256:
    "f819ef8bde6d9a95b454da1af8dee81a74ac45dba1a4c0585465f461d6854e61",
});
const ID = /^[0-9a-f]{24}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const HEX_DIGEST = /^[0-9a-f]{64}$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sameAddress = (actual, expected) =>
  typeof actual === "string" && actual.toLowerCase() === expected;

async function publicRead(path) {
  const response = await fetch(API + path, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(5500),
  });
  if (!response.ok) throw new Error("Dual read unavailable");
  return response.json();
}

let cached;
let inFlight;
async function checkTemplate() {
  const [template, file] = await Promise.all([
    publicRead("/templates/" + CAMPAIGN.templateId),
    readFile(new URL("../rewards/night-signal.html", import.meta.url)),
  ]);
  const custom = template.object?.custom;
  const [mint] = template.actions || [];
  if (
    template.id !== CAMPAIGN.templateId ||
    template.name !== CAMPAIGN.templateName ||
    template.actions?.length !== 1 ||
    mint?.name !== "mint" ||
    mint.access?.type !== "private" ||
    mint.notifications?.enabled !== false ||
    template.object?.metadata?.description !== CAMPAIGN.description ||
    custom?.campaign !== CAMPAIGN.campaign ||
    custom.right !== CAMPAIGN.right ||
    custom.artifact_sha256 !== CAMPAIGN.artifactSha256 ||
    digest(file) !== CAMPAIGN.artifactSha256
  ) {
    throw new Error("Campaign template or game has changed");
  }
  return {
    status: "verified",
    verified: true,
    scope: "template",
    ...CAMPAIGN,
    checkedAt: new Date().toISOString(),
    url: API + "/templates/" + CAMPAIGN.templateId,
  };
}

export async function getCampaignProof({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() < cached.until) return cached.value;
  if (!inFlight) {
    inFlight = checkTemplate()
      .catch(() => ({
        status: "unavailable",
        verified: false,
        scope: "template",
        templateId: CAMPAIGN.templateId,
      }))
      .then((value) => {
        cached = { value, until: Date.now() + (value.verified ? 30000 : 4000) };
        return value;
      })
      .finally(() => {
        inFlight = undefined;
      });
  }
  return inFlight;
}

// Bind a high entropy completion receipt to one wallet without publishing its feedback or cookie.
export async function prepareClaim(receiptId, wallet) {
  const recipient = String(wallet).toLowerCase();
  if (
    !ADDRESS.test(recipient) ||
    /^0x0{40}$/.test(recipient) ||
    !/^[0-9a-f-]{36}$/.test(receiptId) ||
    !(await getCampaignProof({ fresh: true })).verified
  ) {
    throw new Error("Cannot prepare this claim");
  }
  const commitment = digest(
    JSON.stringify([
      CAMPAIGN.templateId,
      receiptId,
      recipient,
      CAMPAIGN.artifactSha256,
    ]),
  );
  const custom = {
    campaign: CAMPAIGN.campaign,
    right: CAMPAIGN.right,
    artifact_sha256: CAMPAIGN.artifactSha256,
    completion_commitment: commitment,
  };
  return {
    status: "prepared",
    issuer: CAMPAIGN.issuer,
    recipient,
    commitment,
    templateId: CAMPAIGN.templateId,
    artifactSha256: CAMPAIGN.artifactSha256,
    action: {
      mint: {
        template_id: CAMPAIGN.templateId,
        num: 1,
        to: recipient,
        data: { custom },
      },
    },
  };
}

export async function inspectReceipt(objectId, actionId) {
  if (!ID.test(objectId) || !ID.test(actionId))
    throw new Error("Invalid record IDs");
  const [template, obj, logs, history] = await Promise.all([
    getCampaignProof({ fresh: true }),
    publicRead("/objects/" + objectId),
    publicRead("/action-logs?id=" + actionId + "&limit=2"),
    publicRead("/objects/" + objectId + "/state-changes?limit=2&order=asc"),
  ]);
  const log = logs.action_logs?.[0];
  const affected = log?.affected_objects?.[0];
  const creation = history.state_changes?.[0];
  const custom = obj.custom;
  const recipient =
    typeof obj.owner === "string" ? obj.owner.toLowerCase() : "";
  if (
    !template.verified ||
    obj.id !== objectId ||
    obj.template_id !== CAMPAIGN.templateId ||
    !ADDRESS.test(recipient) ||
    !HEX_DIGEST.test(custom?.completion_commitment ?? "") ||
    custom?.campaign !== CAMPAIGN.campaign ||
    custom.right !== CAMPAIGN.right ||
    custom.artifact_sha256 !== CAMPAIGN.artifactSha256 ||
    logs.action_logs?.length !== 1 ||
    log?.id !== actionId ||
    log.name !== "mint" ||
    log.status !== "completed" ||
    !sameAddress(log.account, CAMPAIGN.issuer) ||
    log.affected_objects?.length !== 1 ||
    affected?.change_type !== "create" ||
    affected.id !== objectId ||
    affected.template_id !== CAMPAIGN.templateId ||
    !ID.test(affected.state_change_id || "") ||
    creation?.id !== affected.state_change_id ||
    creation.change_type !== "create" ||
    creation.action_name !== "mint" ||
    creation.object_id !== objectId ||
    creation.action_id !== actionId ||
    !sameAddress(creation.current_owner, recipient)
  ) {
    throw new Error(
      "Original mint and current entitlement could not be verified",
    );
  }
  return {
    status: "VERIFIED",
    verified: true,
    scope: "entitlement",
    objectId,
    actionId,
    recipient,
    templateId: CAMPAIGN.templateId,
    issuer: CAMPAIGN.issuer,
    commitment: custom.completion_commitment,
    artifactSha256: CAMPAIGN.artifactSha256,
    created: obj.when_created,
    checkedAt: new Date().toISOString(),
  };
}

export async function verifyClaim(plan, objectId, actionId) {
  const receipt = await inspectReceipt(objectId, actionId);
  if (
    receipt.commitment !== plan.commitment ||
    receipt.recipient !== plan.recipient ||
    receipt.templateId !== plan.templateId ||
    receipt.artifactSha256 !== plan.artifactSha256
  ) {
    throw new Error("The mint belongs to another request");
  }
  return receipt;
}
