// Single issuer host only. Never retry an existing journal entry, even after a timeout.
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMainnetConnector } from '../lib/issuance-mainnet.mjs';

const TRUSTED = 'https://offermesh.vercel.app';
const digest = s => createHash('sha256').update(s).digest('hex');
function trustedOrigin(value) {
  const u=new URL(value);
  if (u.origin!==TRUSTED && !(u.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(u.hostname))) throw Error('untrusted_origin');
  if (u.username || u.password || u.pathname!=='/' || u.search || u.hash) throw Error('untrusted_origin');
  return u.origin;
}
function address(value) { return typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null; }
function uint(value) { return typeof value==='string' && /^(0|[1-9][0-9]*)$/.test(value); }
async function saveJournal(file, value) {
  const bytes=Buffer.from(JSON.stringify(value));
  await file.write(bytes,0,bytes.length,0);
  await file.truncate(bytes.length);
  await file.sync();
}
export async function issue({token, origin, maxFeeWei, journalDir, campaign, call, fetchImpl=fetch}) {
  if (!/^[a-f0-9]{64}$/.test(token || '') || !uint(maxFeeWei) || !journalDir || !campaign || typeof call !== 'function') throw Error('invalid_input');
  const base=trustedOrigin(origin);
  const reply=await fetchImpl(base+'/api/engagement/issuance-request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token}),redirect:'error'});
  if (!reply.ok) throw Error('request_not_found');
  const {plan,expiresAt}=await reply.json();
  const custom=plan?.action?.mint?.data?.custom;
  if (!plan || !Number.isFinite(expiresAt) || expiresAt<=Date.now() || plan.templateId!==campaign.templateId || address(plan.issuer)!==address(campaign.issuer) || plan.artifactSha256!==campaign.artifactSha256 || !address(plan.recipient) || !/^[a-f0-9]{64}$/.test(plan.commitment || '') || !plan.action?.mint || Object.keys(plan.action).length!==1 || plan.action.mint.template_id!==campaign.templateId || plan.action.mint.num!==1 || address(plan.action.mint.to)!==address(plan.recipient) || custom?.campaign!==campaign.campaign || custom.right!==campaign.right || custom.artifact_sha256!==campaign.artifactSha256 || custom.completion_commitment!==plan.commitment || Object.keys(custom).length!==4 || Object.keys(plan.action.mint).some(k=>!['template_id','num','to','data'].includes(k)) || Object.keys(plan.action.mint.data).length!==1) throw Error('invalid_plan');
  await mkdir(journalDir,{recursive:true,mode:0o700});
  const directoryInfo=await stat(journalDir);
  if (!directoryInfo.isDirectory() || directoryInfo.mode & 0o077 || (typeof process.getuid==='function' && directoryInfo.uid!==process.getuid())) throw Error('journal_directory_insecure');
  const filePath=join(resolve(journalDir),`${digest(token)}.json`);
  const lock=join(resolve(journalDir),'.issuer.lock');
  try { await mkdir(lock,{mode:0o700}); } catch (e) { if (e.code==='EEXIST') throw Error('issuer_busy_or_reconciliation_required'); throw e; }
  let file;
  try { file=await open(filePath,'wx',0o600); }
  catch(e) {
    await rm(lock,{recursive:true,force:true});
    if (e.code==='EEXIST') {
      let prior; try { prior=JSON.parse(await readFile(filePath,'utf8')); } catch { return {status:'pending',journal:filePath}; }
      return {status:prior.status==='submitted'?'submitted':prior.status==='blocked'?'blocked':'pending',journal:filePath,nonce:prior.nonce,result:prior.result,reason:prior.reason,replay:true};
    }
    throw e;
  }
  let record={status:'preflight',tokenDigest:digest(token),templateId:plan.templateId,recipient:address(plan.recipient),commitment:plan.commitment,createdAt:new Date().toISOString()};
  try {
    await saveJournal(file,record);
    const directory=await open(resolve(journalDir),'r'); try { await directory.sync(); } finally { await directory.close(); }
    const wallet=await call('getWallet',{});
    if (address(wallet.account?.address)!==address(campaign.issuer) || !address(campaign.issuer) || wallet.account?.controller?.custody!=='custodial') throw Error('issuer_mismatch');
    const template=await call('getTemplate',{id:campaign.templateId});
    const actual=template.template || template;
    const templateCustom=actual.object?.custom;
    if (actual.id!==campaign.templateId || actual.name!==campaign.templateName || actual.actions?.length!==1 || actual.actions[0].name!=='mint' || actual.actions[0].access?.type!=='private' || actual.actions[0].notifications?.enabled!==false || actual.object?.metadata?.description!==campaign.description || templateCustom?.campaign!==campaign.campaign || templateCustom.right!==campaign.right || templateCustom.artifact_sha256!==campaign.artifactSha256) throw Error('template_mismatch');
    const fees=await call('getNetworkFees',{});
    if (!uint(fees.total_fee_wei) || BigInt(fees.total_fee_wei)>BigInt(maxFeeWei)) throw Error('fee_limit');
    const balance=await call('getOrganizationBalance',{id:campaign.orgId});
    if (!uint(balance.amount) || BigInt(balance.amount)<BigInt(fees.total_fee_wei)) throw Error('insufficient_balance');
    const nonceResult=await call('getNonce',{address:campaign.issuer});
    const nonce=nonceResult.nonce;
    if (!Number.isSafeInteger(nonce) || nonce<0) throw Error('invalid_nonce');
    // This is durable before the sole execute call. A crash means manual reconciliation.
    record={...record,status:'pending',nonce,feeWei:fees.total_fee_wei}; await saveJournal(file,record);
    let result;
    try { result=await call('executeAction',{action:plan.action,nonce}); }
    catch { return {status:'pending',journal:filePath,nonce}; }
    const ids=Array.isArray(result?.steps) ? result.steps.flatMap(step=>Array.isArray(step.output?.ids)?step.output.ids:[]) : [];
    if (!/^[a-f0-9]{24}$/.test(result?.action_id || '') || ids.length!==1 || !/^[a-f0-9]{24}$/.test(ids[0]) || result.requested_nonce!==nonce || result.submitted_nonce!==nonce || result.executed_nonce!==nonce || result.nonce_substituted!==false) return {status:'pending',journal:filePath,nonce};
    const outcome={actionId:result.action_id,objectId:ids[0]};
    record={...record,status:'submitted',result:outcome}; await saveJournal(file,record);
    return {status:'submitted',journal:filePath,nonce,result:outcome};
  } catch(e) {
    if (record.status==='pending' || record.status==='submitted') return {status:'pending',journal:filePath,nonce:record.nonce};
    record={...record,status:'blocked',reason:e.message}; await saveJournal(file,record);
    return {status:'blocked',reason:e.message,journal:filePath};
  } finally { await file.close(); await rm(lock,{recursive:true,force:true}); }
}
async function main() {
  const args=process.argv.slice(2);
  const get=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  const origin=get('--origin'), maxFeeWei=get('--max-fee-wei'), journalDir=get('--journal-dir');
  let input=''; for await (const chunk of process.stdin) { input+=chunk; if (input.length>128) throw Error('invalid_input'); }
  const {CAMPAIGN}=await import('../lib/engagementDual.mjs');
  const result=await issue({token:input.trim(),origin,maxFeeWei,journalDir,campaign:CAMPAIGN,call:createMainnetConnector()});
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(e=>{console.error(JSON.stringify({error:e.message}));process.exitCode=1;});
