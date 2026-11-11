import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {issue} from './issue-engagement.mjs';
const dir=await mkdtemp(join(tmpdir(),'issuer-test-'));
const campaign={templateId:'template-1',issuer:'0x'+'a'.repeat(40),artifactSha256:'a'.repeat(64),templateName:'t',campaign:'c',right:'r',description:'d',orgId:'org1'};
const recipient='0x'+'b'.repeat(40), token='1'.repeat(64);
const plan={templateId:campaign.templateId,issuer:campaign.issuer,recipient,artifactSha256:campaign.artifactSha256,commitment:'c'.repeat(64),action:{mint:{template_id:campaign.templateId,num:1,to:recipient,data:{custom:{campaign:campaign.campaign,right:campaign.right,artifact_sha256:campaign.artifactSha256,completion_commitment:'c'.repeat(64)}}}}};
const fetchImpl=async()=>({ok:true,json:async()=>({plan,expiresAt:Date.now()+10000})});
let writes=0;
const call=async(name)=>{if(name==='executeAction'){writes++; return {action_id:'a'.repeat(24),steps:[{output:{ids:['b'.repeat(24)]}}],requested_nonce:3,submitted_nonce:3,executed_nonce:3,nonce_substituted:false};} return {getWallet:{account:{address:campaign.issuer,controller:{custody:'custodial'}}},getTemplate:{id:campaign.templateId,name:campaign.templateName,actions:[{name:'mint',access:{type:'private'},notifications:{enabled:false}}],object:{metadata:{description:campaign.description},custom:{campaign:campaign.campaign,right:campaign.right,artifact_sha256:campaign.artifactSha256}}},getNetworkFees:{total_fee_wei:'5'},getOrganizationBalance:{amount:'5'},getNonce:{nonce:3}}[name];};
try {
  const opts={token,origin:'http://localhost:3000',maxFeeWei:'5',journalDir:dir,campaign,call,fetchImpl};
  const good=await issue(opts); assert.equal(good.status,'submitted');
  // Lazy mock: only the execution call is considered a write.
  const replay=await issue(opts); assert.equal(replay.status,'submitted'); assert.equal(replay.replay,true); assert.equal(writes,1);
  assert.equal(JSON.parse(await readFile(good.journal,'utf8')).status,'submitted');
  await assert.rejects(()=>issue({...opts,token:'bad'}),/invalid_input/);
  await assert.rejects(()=>issue({...opts,token:'2'.repeat(64),fetchImpl:async()=>({ok:false})}),/request_not_found/);
  const uncertain=await issue({...opts,token:'3'.repeat(64),call:async(name,args)=>{if(name==='executeAction') throw Error('timeout');return call(name,args);}});
  assert.equal(uncertain.status,'pending');
  assert.equal((await issue({...opts,token:'3'.repeat(64)})).status,'pending'); assert.equal(writes,1);
  const fee=await issue({...opts,token:'4'.repeat(64),maxFeeWei:'4'}); assert.equal(fee.reason,'fee_limit');
  console.log('issuance checks passed');
} finally {await rm(dir,{recursive:true,force:true});}
