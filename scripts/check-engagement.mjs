import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
const dir=await mkdtemp(join(tmpdir(),'engagement-test-'));
process.env.REVOLV_ENGAGEMENT_DIR=dir;
process.env.OFFERMESH_EPHEMERAL='1';
const {handle}=await import('../lib/app.mjs');
const base='http://localhost';
async function request(path, {cookie,body,origin=base,method=body?'POST':'GET'}={}) {
  const { Readable } = await import('node:stream');
  const req=Readable.from(body ? [JSON.stringify(body)] : []); req.method=method; req.url=path;
  req.headers={host:'localhost',...(cookie?{cookie}:{}),...(body?{'content-type':'application/json',origin}: {})};
  const headers={}; let status=200, data='';
  const res={setHeader(k,v){headers[k.toLowerCase()]=v},writeHead(code,h){status=code;Object.assign(headers,h)},end(chunk=''){data+=chunk}};
  await handle(req,res);
  return {status,cookie:headers['set-cookie']?.split(';')[0],data:JSON.parse(data)};
}
try {
  const a=await request('/api/engagement/state'), b=await request('/api/engagement/state');
  assert.equal(a.status,200); assert.notEqual(a.cookie,b.cookie); assert.equal(a.data.mode,'rehearsal');
  assert.equal((await request('/api/engagement/reward',{cookie:a.cookie})).status,403);
  assert.equal((await request('/api/engagement/accept',{cookie:a.cookie,body:{},origin:'https://evil.example'})).status,403);
  assert.equal((await request('/api/engagement/play',{cookie:a.cookie,body:{moves:[1]}})).status,409);
  assert.equal((await request('/api/engagement/control',{cookie:a.cookie,body:{paused:true}})).status,200);
  assert.equal((await request('/api/engagement/accept',{cookie:a.cookie,body:{}})).data.error,'campaign_paused');
  await request('/api/engagement/control',{cookie:a.cookie,body:{paused:false}});
  await request('/api/engagement/control',{cookie:a.cookie,body:{capacity:1}});
  await request('/api/engagement/accept',{cookie:a.cookie,body:{}});
  assert.equal((await request('/api/engagement/play',{cookie:a.cookie,body:{moves:[0]}})).data.error,'dial_attempt_required');
  await request('/api/engagement/play',{cookie:a.cookie,body:{moves:[1,5]}});
  const outcomes=await Promise.all(Array.from({length:8},()=>request('/api/engagement/complete',{cookie:a.cookie,body:{observation:'clear'}})));
  assert.ok(outcomes.every(x=>x.status===200));
  assert.equal(new Set(outcomes.map(x=>x.data.participant.receipt.id)).size,1);
  assert.equal(outcomes[0].data.metrics.earnedCents,100); assert.equal(outcomes[0].data.metrics.remainingCents,0);
  assert.equal((await request('/api/engagement/complete',{cookie:a.cookie,body:{observation:'confusing'}})).data.error,'observation_conflict');
  assert.equal((await request('/api/engagement/state',{cookie:b.cookie})).data.metrics.completed,0);
  assert.equal((await request('/api/engagement/state',{cookie:a.cookie})).data.metrics.completed,1);
  assert.equal((await request('/api/engagement/reward',{cookie:b.cookie})).status,403);
  console.log('engagement checks passed');
} finally { await rm(dir,{recursive:true,force:true}); }
