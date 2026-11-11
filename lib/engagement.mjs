// Private, fictional rehearsals. Each random bearer session has its own bounded ledger.
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { redisConfig } from './storage.mjs';

const TTL = 86400; // records expire after 24 hours; no identity or free-text feedback
const FEE = 100;
const DIR = process.env.REVOLV_ENGAGEMENT_DIR || join(tmpdir(), 'revolv-engagement-sessions');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hash = s => createHash('sha256').update(s).digest('hex');
const initial = () => ({ status:'new', capacity:3, paused:false, createdAt:Date.now(), updatedAt:Date.now() });
const campaign = s => ({ title:'Night Signal', sponsor:'Fallow Games', budgetCents:s.capacity * FEE, feeCents:FEE, capacity:s.capacity, paused:s.paused, shared:!!s.shared, terms:'Voluntary fictional sponsored tutorial playtest. Attempt a dial adjustment and share one candid observation to keep the original offline game. Reservations expire after one hour. No real charge or payment.' });
async function proof() {
  try {
    const { getCampaignProof } = await import('./engagementDual.mjs');
    const p = await getCampaignProof();
    if (p?.verified === true && p?.status === 'verified') return p;
    return { status:'unavailable', verified:false };
  } catch { return { status:'unavailable', verified:false }; }
}
// The sponsor sees anonymous aggregate outcomes; participant views contain only their own outcome.
async function view(s, participant = s, owner = false, campaignId = null) {
  const entries = s.shared ? Object.values(s.participants) : [s];
  const accepted = entries.filter(p => p.everAccepted).length;
  const completed = entries.filter(p => p.status === 'complete').length;
  const done = participant.status === 'complete';
  const c = campaign(s);
  if (owner && s.shared) c.shareLinks = Object.fromEntries(['fieldnotes','arcade'].map(code => [code, `/network?campaign=${campaignId}&publisher=${code}`]));
  const result = { campaign:c, participant:{status:participant.status, ...(participant.observation ? {observation:participant.observation} : {}), ...(participant.receipt ? {receipt:participant.receipt} : {}), ...(participant.reservedUntil ? {reservedUntil:participant.reservedUntil} : {}), ...(participant.claimPlan ? {claimPlan:participant.claimPlan} : {}), ...(participant.claimProof ? {claimProof:participant.claimProof} : {})}, metrics:{accepted:owner ? accepted : (['accepted','played','complete'].includes(participant.status)?1:0), completed:owner ? completed : (done?1:0), budgetCents:s.capacity*FEE, earnedCents:owner ? completed*FEE : (done?FEE:0), remainingCents:owner ? (s.capacity-completed)*FEE : (s.capacity-(done?1:0))*FEE}, mode:'rehearsal', proof:{status:'unavailable',verified:false} };
  if (owner && s.shared) {
    const observations = Object.fromEntries(['clear','confusing','too-hard'].map(v=>[v,entries.filter(p=>p.status==='complete' && p.observation===v).length]));
    const publishers = Object.fromEntries(['fieldnotes','arcade'].map(code=>{
      const group=entries.filter(p=>p.publisher===code);
      const a=group.filter(p=>p.everAccepted).length;
      const d=group.filter(p=>p.status==='complete').length;
      return [code,{accepted:a,completed:d,conversion:a ? d/a : 0}];
    }));
    result.sponsor={accepted,completed,declined:entries.filter(p=>p.status==='declined').length,expired:entries.filter(p=>p.status==='expired').length,observations,publishers};
  }
  return result;
}
function cookie(req) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)revolv_engagement=([a-f0-9]{64})(?:;|$)/);
  return match?.[1] || null;
}
function originAllowed(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (/^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(host || '') ? 'http' : 'https');
  return typeof origin === 'string' && origin === `${proto}://${host}` && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin');
}
async function redis(args) {
  const cfg = redisConfig();
  const res = await fetch(cfg.url, { method:'POST', headers:{authorization:`Bearer ${cfg.token}`, 'content-type':'application/json'}, body:JSON.stringify(args) });
  if (!res.ok) throw Error('storage_unavailable');
  const result = await res.json(); if (result.error) throw Error('storage_unavailable'); return result.result;
}
async function withRecord(id, fn) {
  const key = hash(id), cfg = redisConfig();
  if (cfg) {
    const lock = `revolv:engagement:lock:${key}`, record = `revolv:engagement:${key}`, token = randomUUID();
    let acquired = false;
    for (let i=0;i<30;i++) { if (await redis(['SET',lock,token,'NX','EX','15']) === 'OK') { acquired=true; break; } await sleep(30); }
    if (!acquired) throw Error('storage_busy');
    try {
      const raw = await redis(['GET',record]); const s = raw ? JSON.parse(raw) : initial();
      const out = await fn(s);
      s.updatedAt = Date.now();
      // Compare lock and write atomically; expired locks never commit stale data.
      const ok = await redis(['EVAL',"if redis.call('get',KEYS[1]) == ARGV[1] then redis.call('set',KEYS[2],ARGV[2],'EX',ARGV[3]); return 1 else return 0 end",'2',lock,record,token,JSON.stringify(s),String(TTL)]);
      if (ok !== 1) throw Error('storage_busy');
      return out;
    } finally { await redis(['EVAL',"if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",'1',lock,token]).catch(()=>{}); }
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw Error('durable_storage_required');
  await mkdir(DIR,{recursive:true});
  const lock=join(DIR,`${key}.lock`), path=join(DIR,`${key}.json`); let acquired=false;
  for (let i=0;i<50;i++) { try { await mkdir(lock); acquired=true; break; } catch (e) { if (e.code !== 'EEXIST') throw e; await sleep(20); } }
  if (!acquired) throw Error('storage_busy');
  try {
    let s; try { s=JSON.parse(await readFile(path,'utf8')); if (Date.now()-s.updatedAt>TTL*1000) s=initial(); } catch(e) { if (e.code !== 'ENOENT') throw e; s=initial(); }
    const out=await fn(s); s.updatedAt=Date.now();
    const temp=join(DIR,`${key}.${randomUUID()}.tmp`); await writeFile(temp,JSON.stringify(s),{mode:0o600}); await rename(temp,path);
    // Opportunistic bounded cleanup. Never remove locks or another active temporary write.
    for (const name of (await readdir(DIR)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).slice(0,100)) {
      if (name === `${key}.json`) continue;
      const p=join(DIR,name), otherLock=join(DIR,`${name.slice(0,64)}.lock`);
      try { await mkdir(otherLock); try { if (Date.now()-(await stat(p)).mtimeMs > TTL*1000) await rm(p); } finally { await rm(otherLock,{recursive:true,force:true}); } } catch {}
    }
    return out;
  } finally { await rm(lock,{recursive:true,force:true}); }
}
const RESERVED_MS = 60 * 60 * 1000;
function expireReservations(s) {
  if (!s.shared) return;
  for (const p of Object.values(s.participants)) {
    if (['accepted','played'].includes(p.status) && p.reservedUntil <= Date.now()) {
      p.status = 'expired'; delete p.reservedUntil;
    }
  }
}
function transition(s, p, action, body, owner) {
  if (action === 'control') {
    if (!owner) throw Error('sponsor_required');
    if (Object.keys(body).length !== 1) throw Error('invalid_control');
    if (typeof body.paused === 'boolean') s.paused = body.paused;
    else if (Number.isInteger(body.capacity) && body.capacity >= 1 && body.capacity <= 3) {
      const committed = s.shared ? Object.values(s.participants).filter(x=>['accepted','played','complete'].includes(x.status)).length : (['accepted','played','complete'].includes(p.status)?1:0);
      if (body.capacity < committed) throw Error('capacity_below_commitments');
      s.capacity = body.capacity;
    } else throw Error('invalid_control');
  } else if (action === 'accept') {
    if (owner && s.shared) throw Error('sponsor_cannot_participate');
    if (p.status === 'accepted' || p.status === 'played') return;
    if (p.status !== 'new' || s.paused) throw Error(s.paused ? 'campaign_paused' : 'invalid_transition');
    const used = s.shared ? Object.values(s.participants).filter(x=>['accepted','played','complete'].includes(x.status)).length : 0;
    if (used >= s.capacity) throw Error('budget_exhausted');
    p.status = 'accepted'; p.everAccepted = true; p.reservedUntil = Date.now() + RESERVED_MS;
  } else if (action === 'play') {
    if (p.status !== 'accepted' && p.status !== 'played') throw Error('acceptance_required');
    if (!Array.isArray(body.moves) || body.moves.length < 1 || body.moves.length > 64 || !body.moves.every(n=>Number.isInteger(n)&&n>=0&&n<=7) ) throw Error('dial_attempt_required');
    p.status = 'played';
  } else if (action === 'complete') {
    if (!['clear','confusing','too-hard'].includes(body.observation)) throw Error('invalid_observation');
    if (p.status === 'complete') { if (p.observation !== body.observation) throw Error('observation_conflict'); return; }
    if (p.status !== 'played') throw Error('play_attempt_required');
    p.status = 'complete'; p.observation = body.observation; delete p.reservedUntil;
    p.receipt = {id:randomUUID(),simulatedCostCents:FEE,type:'rehearsal',charged:false};
  } else if (action === 'decline') {
    if (p.status === 'declined') return;
    if (!['new','accepted','played'].includes(p.status)) throw Error('invalid_transition');
    p.status = 'declined'; delete p.reservedUntil;
  } else throw Error('not_found');
}
export async function engagement(req,res,path,readJson,send,root) {
  const placementMatch = path.match(/^\/api\/engagement\/placements\/([a-f0-9]{64})\/(fieldnotes|arcade)\/(state|accept|play|complete|decline|reward|claim-plan|verify-claim)$/);
  const placement = placementMatch ? {campaignId:placementMatch[1],publisher:placementMatch[2]} : null;
  const action = placementMatch ? placementMatch[3] : path.slice('/api/engagement/'.length);
  let id=cookie(req);
  if (req.method==='GET' && action==='state' && !id) {
    id=randomBytes(32).toString('hex');
    res.setHeader('set-cookie',`revolv_engagement=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL}${(req.headers['x-forwarded-proto']==='https' || (!/^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(req.headers.host || ''))) ? '; Secure' : ''}`);
  }
  if (!id) return send(res,401,{error:'session_required'});
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return send(res,404,{error:'not_found'});
    if (req.method === 'POST' && (!originAllowed(req) || !(req.headers['content-type'] || '').toLowerCase().startsWith('application/json'))) return send(res,403,{error:'same_origin_required'});
    const body = req.method === 'POST' ? await readJson(req) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res,400,{error:'invalid_body'});
    let nativeResult = null;
    if (req.method === 'POST' && ['claim-plan','verify-claim'].includes(action)) {
      const snapshot = await withRecord('session:'+id, async session => {
        const binding=placement || (session.binding?.owner ? session.binding : null);
        if (!binding) return {participant:structuredClone(session), owner:false};
        return withRecord('campaign:'+binding.campaignId, c=>({participant:structuredClone(c.participants?.[hash(id)] || {status:'new'}),owner:c.owner===hash(id)}));
      });
      if (snapshot.owner || snapshot.participant.status !== 'complete') throw Error('claim_not_ready');
      let adapter;
      try { adapter = await import('./engagementDual.mjs'); } catch { throw Error('claim_unverified'); }
      if (action === 'claim-plan') {
        if (typeof body.wallet !== 'string' || !body.wallet.trim() || body.wallet.length > 256) throw Error('claim_not_ready');
        body.wallet=body.wallet.trim().toLowerCase();
        if (snapshot.participant.claimPlan && snapshot.participant.claimWallet !== body.wallet) throw Error('claim_conflict');
        if (snapshot.participant.claimPlan) nativeResult=snapshot.participant.claimPlan;
        else {
          try { nativeResult=await adapter.prepareClaim(snapshot.participant.receipt.id, body.wallet); } catch { throw Error('claim_unverified'); }
          if (!nativeResult || typeof nativeResult !== 'object' || !nativeResult.commitment || String(nativeResult.recipient || '').toLowerCase() !== body.wallet) throw Error('claim_unverified');
        }
      } else {
        if (!snapshot.participant.claimPlan || typeof body.objectId !== 'string' || !body.objectId || typeof body.actionId !== 'string' || !body.actionId) throw Error('claim_not_ready');
        try { nativeResult=await adapter.verifyClaim(snapshot.participant.claimPlan,body.objectId,body.actionId); } catch { throw Error('claim_unverified'); }
        if (nativeResult?.status !== 'VERIFIED' || nativeResult.verified !== true || nativeResult.objectId !== body.objectId || nativeResult.actionId !== body.actionId || nativeResult.commitment !== snapshot.participant.claimPlan.commitment || String(nativeResult.recipient || '').toLowerCase() !== String(snapshot.participant.claimPlan.recipient || '').toLowerCase()) throw Error('claim_unverified');
      }
    }
    const result = await withRecord('session:'+id, async session => {
      if (action === 'publish' && req.method === 'POST') {
        if (placement || session.binding?.owner) throw Error('already_bound');
        const campaignId=randomBytes(32).toString('hex');
        await withRecord('campaign:'+campaignId, async c=>{
          Object.assign(c,{shared:true,owner:hash(id),participants:{},capacity:session.capacity,paused:session.paused});
        });
        session.binding={campaignId,owner:true};
      }
      const work = async (c, p, owner, campaignId) => {
        expireReservations(c);
        if (action === 'reward' && req.method === 'GET') return {reward:p.status==='complete'};
        if (action === 'state' && req.method === 'GET' || action === 'publish' && req.method === 'POST') return view(c,p,owner,campaignId);
        if (req.method !== 'POST') throw Error('not_found');
        if (action === 'claim-plan') {
          if (owner && c.shared || p.status !== 'complete') throw Error('claim_not_ready');
          if (p.claimPlan && p.claimWallet !== body.wallet) throw Error('claim_conflict');
          if (!p.claimPlan) { p.claimPlan=nativeResult; p.claimWallet=body.wallet; }
          return view(c,p,owner,campaignId);
        }
        if (action === 'verify-claim') {
          if (owner && c.shared || p.status !== 'complete' || !p.claimPlan) throw Error('claim_not_ready');
          if (nativeResult?.status !== 'VERIFIED' || nativeResult.verified !== true) throw Error('claim_unverified');
          p.claimProof=nativeResult;
          return view(c,p,owner,campaignId);
        }
        transition(c,p,action,body,owner);
        return view(c,p,owner,campaignId);
      };
      const binding=placement || (session.binding?.owner ? session.binding : null);
      if (!binding) return work(session,session,true,null);
      const {campaignId,publisher}=binding;
      return withRecord('campaign:'+campaignId, async c=>{
        if (!c.shared || (!placement && c.owner !== hash(id))) throw Error('campaign_not_found');
        const owner=c.owner===hash(id);
        const key=hash(id);
        const existing=c.participants[key];
        const p=existing || {status:'new',publisher:publisher || null};
        if (!existing && action === 'accept' && Object.keys(c.participants).length >= 100) throw Error('workspace_full');
        if (placement && owner && (action !== 'state' || req.method !== 'GET')) throw Error('sponsor_cannot_participate');
        const output=await work(c,p,owner && !placement,campaignId);
        if (placement && owner) {
          if (action !== 'state' || req.method !== 'GET') throw Error('sponsor_cannot_participate');
          output.ownPlacement=true;
        }
        if (!existing && action === 'accept' && p.everAccepted) c.participants[key]=p;

        return output;
      });
    });
    if (action === 'reward' && req.method === 'GET') {
      if (!result.reward) return send(res,403,{error:'completion_required'});
      const data=await readFile(join(root,'rewards/night-signal.html'));
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-disposition':'attachment; filename="night-signal.html"'}); return res.end(data);
    }
    result.proof=await proof();
    return send(res,200,result);
  } catch(e) {
    if (['storage_busy','storage_unavailable','durable_storage_required'].includes(e.message)) return send(res,503,{error:e.message});
    const errors=['invalid_control','invalid_transition','campaign_paused','acceptance_required','dial_attempt_required','invalid_observation','observation_conflict','play_attempt_required','budget_exhausted','not_found','sponsor_required','capacity_below_commitments','already_bound','invalid_placement','campaign_not_found','workspace_full','sponsor_cannot_participate','claim_not_ready','claim_conflict','claim_unverified'];
    if (errors.includes(e.message)) return send(res,e.message==='not_found'||e.message==='campaign_not_found'?404:e.message==='sponsor_required'?403:409,{error:e.message});
    throw e;
  }
}
