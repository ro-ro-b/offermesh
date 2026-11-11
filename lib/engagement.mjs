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
const campaign = s => ({ title:'Night Signal', sponsor:'Fallow Games', budgetCents:s.capacity * FEE, feeCents:FEE, capacity:s.capacity, paused:s.paused, terms:'Voluntary fictional sponsored tutorial playtest. Attempt a dial adjustment and share one candid observation to keep the original offline game. No real charge or payment.' });
async function proof() {
  try {
    const { getCampaignProof } = await import('./engagementDual.mjs');
    const p = await getCampaignProof();
    // Native claims are accepted only when the adapter explicitly verifies readback.
    if (p?.verified === true && p?.status === 'verified') return p;
    return { status:'unavailable', verified:false };
  } catch { return { status:'unavailable', verified:false }; }
}
async function view(s) {
  const done = s.status === 'complete';
  return {campaign:campaign(s), participant:{status:s.status, ...(s.observation ? {observation:s.observation} : {}), ...(s.receipt ? {receipt:s.receipt} : {})}, metrics:{accepted:['accepted','played','complete'].includes(s.status)?1:0, completed:done?1:0, budgetCents:s.capacity*FEE, earnedCents:done?FEE:0, remainingCents:s.capacity*FEE-(done?FEE:0)}, mode:'rehearsal', proof:await proof()};
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
function transition(s, action, body) {
  if (action === 'control') {
    if (Object.keys(body).length !== 1) throw Error('invalid_control');
    if (typeof body.paused === 'boolean') s.paused=body.paused;
    else if (Number.isInteger(body.capacity) && body.capacity>=1 && body.capacity<=3) s.capacity=body.capacity;
    else throw Error('invalid_control');
  } else if (action === 'accept') {
    if (s.status === 'accepted') return;
    if (s.status !== 'new' || s.paused) throw Error(s.paused?'campaign_paused':'invalid_transition');
    s.status='accepted';
  } else if (action === 'play') {
    if (s.status !== 'accepted' && s.status !== 'played') throw Error('acceptance_required');
    if (!Array.isArray(body.moves) || body.moves.length<1 || body.moves.length>64 || !body.moves.every(n=>Number.isInteger(n)&&n>=0&&n<=7) || !body.moves.some(n=>n!==0)) throw Error('dial_attempt_required');
    s.status='played';
  } else if (action === 'complete') {
    if (!['clear','confusing','too-hard'].includes(body.observation)) throw Error('invalid_observation');
    if (s.status === 'complete') { if (s.observation !== body.observation) throw Error('observation_conflict'); return; }
    if (s.status !== 'played') throw Error('play_attempt_required');
    // Accepted participants retain their promised reward even when paused.
    if (s.capacity*FEE < FEE) throw Error('budget_exhausted');
    s.status='complete'; s.observation=body.observation; s.receipt={id:randomUUID(), simulatedCostCents:FEE, type:'rehearsal', charged:false};
  } else if (action === 'decline') {
    if (s.status === 'declined') return;
    if (s.status !== 'new') throw Error('invalid_transition'); s.status='declined';
  } else throw Error('not_found');
}
export async function engagement(req,res,path,readJson,send,root) {
  let id=cookie(req);
  if (req.method==='GET' && path==='/api/engagement/state' && !id) {
    id=randomBytes(32).toString('hex');
    res.setHeader('set-cookie',`revolv_engagement=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL}${(req.headers['x-forwarded-proto']==='https' || (!/^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(req.headers.host || ''))) ? '; Secure' : ''}`);
  }
  if (!id) return send(res,401,{error:'session_required'});
  try {
    if (req.method==='GET' && path==='/api/engagement/state') return send(res,200,await withRecord(id,view));
    if (req.method==='GET' && path==='/api/engagement/reward') {
      const allowed=await withRecord(id,s=>s.status==='complete');
      if (!allowed) return send(res,403,{error:'completion_required'});
      const data=await readFile(join(root,'public/network/night-signal.html'));
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-disposition':'attachment; filename="night-signal.html"'}); return res.end(data);
    }
    if (req.method!=='POST') return send(res,404,{error:'not_found'});
    if (!originAllowed(req) || !(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return send(res,403,{error:'same_origin_required'});
    const body=await readJson(req); if (!body || typeof body!=='object' || Array.isArray(body)) return send(res,400,{error:'invalid_body'});
    const action=path.slice('/api/engagement/'.length);
    const result=await withRecord(id,async s=>{ transition(s,action,body); return view(s); });
    return send(res,200,result);
  } catch(e) {
    const known=['storage_busy','storage_unavailable','durable_storage_required'];
    if (known.includes(e.message)) return send(res,503,{error:e.message});
    const errors=['invalid_control','invalid_transition','campaign_paused','acceptance_required','dial_attempt_required','invalid_observation','observation_conflict','play_attempt_required','budget_exhausted','not_found'];
    if (errors.includes(e.message)) return send(res,e.message==='not_found'?404:409,{error:e.message});
    throw e;
  }
}
