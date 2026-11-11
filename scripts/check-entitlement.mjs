// Exercise the public provider shapes and app entry points with an isolated, deterministic provider.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { CAMPAIGN as campaign, verifyClaim } from "../lib/engagementDual.mjs";

const dir = await mkdtemp(join(tmpdir(), "revolv-entitlement-"));
process.env.REVOLV_ENGAGEMENT_DIR = dir;
process.env.OFFERMESH_EPHEMERAL = "1";
const { handle } = await import("../lib/app.mjs");
const objectId = "a".repeat(24),
  actionId = "b".repeat(24),
  changeId = "c".repeat(24);
const wallet = "0x" + "d".repeat(40);
const originalFetch = globalThis.fetch;
const template = {
  id: campaign.templateId,
  name: campaign.templateName,
  actions: [
    {
      name: "mint",
      access: { type: "private" },
      notifications: { enabled: false },
    },
  ],
  object: {
    metadata: { description: campaign.description },
    custom: {
      campaign: campaign.campaign,
      right: campaign.right,
      artifact_sha256: campaign.artifactSha256,
    },
  },
};
let obj;
const logs = {
  action_logs: [
    {
      id: actionId,
      name: "mint",
      account: campaign.issuer,
      status: "completed",
      affected_objects: [
        {
          change_type: "create",
          id: objectId,
          template_id: campaign.templateId,
          state_change_id: changeId,
        },
      ],
    },
  ],
};
const history = {
  state_changes: [
    {
      id: changeId,
      change_type: "create",
      action_name: "mint",
      object_id: objectId,
      action_id: actionId,
      current_owner: wallet,
    },
  ],
};
globalThis.fetch = async (input) => {
  const url = new URL(input);
  assert.equal(url.origin, "https://api.dual.network");
  const value = url.pathname.includes("/templates/")
    ? template
    : url.pathname.endsWith("/state-changes")
      ? history
      : url.pathname.endsWith("/action-logs")
        ? logs
        : obj;
  return Response.json(value || {}, { status: value ? 200 : 404 });
};
async function app(path, cookie, body) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  req.url = path;
  req.method = body ? "POST" : "GET";
  req.headers = {
    host: "localhost",
    cookie,
    origin: "http://localhost",
    "content-type": "application/json",
  };
  let status, data;
  const headers = {};
  await handle(req, {
    setHeader: (k, v) => {
      headers[k] = v;
    },
    writeHead: (s) => {
      status = s;
    },
    end: (v) => {
      data = JSON.parse(v);
    },
  });
  return { status, data, cookie: headers["set-cookie"]?.split(";")[0] };
}
try {
  const api = "/api/engagement/";
  const { cookie } = await app(api + "state");
  await app(api + "accept", cookie, {});
  await app(api + "play", cookie, { moves: [0] });
  await app(api + "complete", cookie, { observation: "confusing" });
  const result = await app(api + "claim-plan", cookie, { wallet });
  assert.equal(result.status, 200);
  const plan = result.data.participant.claimPlan;
  assert.match(plan.requestToken, /^[a-f0-9]{64}$/);
  const again = await app(api + "claim-plan", cookie, { wallet });
  assert.equal(
    again.data.participant.claimPlan.requestToken,
    plan.requestToken,
  );
  assert.equal(
    (await app(api + "claim-plan", cookie, { wallet: campaign.issuer })).status,
    409,
  );
  const lookup = await app(api + "issuance-request", "", {
    token: plan.requestToken,
  });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.data.plan.commitment, plan.commitment);
  assert.equal(lookup.data.plan.requestToken, undefined);
  assert.equal(lookup.data.plan.observation, undefined);
  obj = {
    id: objectId,
    template_id: campaign.templateId,
    owner: wallet,
    custom: plan.action.mint.data.custom,
  };
  const match = await app(api + "verify-claim", cookie, { objectId, actionId });
  assert.equal(match.data.participant.claimProof.status, "VERIFIED");
  assert.equal(
    (
      await app(
        api + "public-receipt?object=" + objectId + "&action=" + actionId,
      )
    ).data.verified,
    true,
  );
  for (const [record, key, bad] of [
    [obj, "owner", campaign.issuer],
    [logs.action_logs[0], "status", "pending"],
    [logs.action_logs[0], "account", wallet],
    [history.state_changes[0], "action_id", objectId],
    [obj.custom, "completion_commitment", "f".repeat(64)],
  ]) {
    const saved = record[key];
    record[key] = bad;
    await assert.rejects(verifyClaim(plan, objectId, actionId));
    record[key] = saved;
  }
  template.actions[0].access.type = "public";
  await assert.rejects(verifyClaim(plan, objectId, actionId));
  console.log(
    "Entitlement checks passed: holder request, issuer lookup, public receipt, original mint and rejection paths.",
  );
} finally {
  globalThis.fetch = originalFetch;
  await rm(dir, { recursive: true, force: true });
}
