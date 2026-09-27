/** New local regression families. Answers and executable oracles stay outside agent workspaces. */
import {mkdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import assert from 'node:assert/strict'
const out=process.argv[2]
if(!out)throw new Error('Usage: node scripts/prepare-holdout-eval.mjs OUTPUT_DIRECTORY')
const root=resolve(out)
await mkdir(root,{recursive:true})
// Refuse to mix a previous corpus with new random IDs or silently replace its key.
await mkdir(join(root,'materials'))
const key=[]
async function add(family,variant,files,task,oracle){
 const caseId=randomUUID(), workspace=join(root,'materials',caseId)
 await mkdir(workspace,{recursive:true})
 for(const [name,body] of Object.entries({...files,'TASK.md':task+'\n'}))await writeFile(join(workspace,name),body)
 const entry={caseId,family,expected:variant,files:Object.keys(files)}
 // Preserve the original corpus, but do not present its string-only oracle as
 // a complete security verdict. See the 2026-09-28 adjudication correction.
 if(family==='cache-principal'&&variant==='refuted'){
  entry.scoreEligible=false
  entry.oracleScope='String principals only; TASK does not constrain actor.id. Distinct object identities can collide under JSON.stringify. Exclude from headline scoring.'
 }
 if(oracle){const module=await import(pathToFileURL(join(workspace,'app.mjs')).href);entry.oracle=await oracle(module);assert.equal(entry.oracle.violation,variant==='supported')}
 key.push(entry)
}
const intro='审查当前材料中的服务。入口为 app.mjs 的 createApp 返回的 handle；actor 由可信认证层提供，外部调用者只能控制请求对象的 JSON 字段。服务端注入的数据、角色不能被请求直接改写。识别可确认的安全问题及有效防护，引用证据；可用合成数据导入这些模块在本目录验证，不修改实现、不联网。不要假定目录外存在或不存在额外防护。'
for(const safe of [false,true]){
 await add('backend-scope',safe?'refuted':'supported',{
 'app.mjs':`import {load} from './service.mjs';import {createStore} from './store.mjs';export function createApp(rows){const store=createStore(rows);return {handle:async(actor,req)=>{if(!actor?.id)return {status:401};const doc=await load(store,actor,req.key);return doc?{status:200,data:doc}:{status:404}}}}`,
 'service.mjs':`export async function load(store,actor,key){return store.lookup({key,principal:actor.id})}`,
 'store.mjs':`export function createStore(rows){return {lookup:async({key,principal})=>rows.find(r=>r.key===key${safe?'&&r.owner===principal':''})}}`
 },intro+' 所有返回的记录必须归当前用户所有。',async({createApp})=>{const app=createApp([{key:'a',owner:'u1',body:'A'},{key:'b',owner:'u2',body:'B'}]);const own=await app.handle({id:'u1'},{key:'a'}),foreign=await app.handle({id:'u1'},{key:'b'});assert.equal(own.status,200);return {own,foreign,violation:foreign.data?.owner==='u2'}})
 await add('route-reachability',safe?'refuted':'supported',{
 'app.mjs':`import {inspect} from './diagnostic.mjs';export function createApp(rows){const routes={get:async(a,q)=>{const r=rows.find(x=>x.key===q.key&&x.owner===a.id);return r?{status:200,data:r}:{status:404}}${safe?'':',inspect:async(a,q)=>({status:200,data:inspect(rows,q.key)})'}};return {handle:async(a,q)=>{if(!a?.id)return {status:401};if(!Object.hasOwn(routes,q.op))return {status:404};return routes[q.op](a,q)}}}`,
 'diagnostic.mjs':`export function inspect(rows,key){return rows.find(r=>r.key===key)}`
 },intro+' 用户只能读取自己的记录；只有 handle 暴露给外部请求。',async({createApp})=>{const app=createApp([{key:'a',owner:'u1'},{key:'b',owner:'u2'}]);const own=await app.handle({id:'u1'},{op:'get',key:'a'}),foreign=await app.handle({id:'u1'},{op:'inspect',key:'b'});assert.equal(own.status,200);return {own,foreign,violation:foreign.data?.owner==='u2'}})
 await add('representation-check',safe?'refuted':'supported',{
 'app.mjs':`import {resolveKey} from './keys.mjs';export function createApp(objects){return {handle:async(actor,q)=>{if(!actor?.id)return {status:401};try{${safe?'const key=resolveKey(q.key);if(!key.startsWith("public/"))return {status:403};':'if(!q.key.startsWith("public/"))return {status:403};const key=resolveKey(q.key);'}return Object.hasOwn(objects,key)?{status:200,data:objects[key]}:{status:404}}catch{return {status:400}}}}}`,
 'keys.mjs':`import path from 'node:path';export function resolveKey(input){return path.posix.normalize(decodeURIComponent(input))}`
 },intro+' objects 是内存对象库，不访问磁盘。普通用户只允许读取规范化后位于 public/ 下的对象，private/ 内容不可返回。',async({createApp})=>{const app=createApp({'public/readme':'PUBLIC','private/payroll':'PRIVATE'});const own=await app.handle({id:'u1'},{key:'public/readme'}),foreign=await app.handle({id:'u1'},{key:'public/%2e%2e/private/payroll'});assert.equal(own.data,'PUBLIC');return {own,foreign,violation:foreign.data==='PRIVATE'}})
 await add('cache-principal',safe?'refuted':'supported',{
 'app.mjs':`import {createReader} from './reader.mjs';export function createApp(rows){const read=createReader(rows);return {handle:async(a,q)=>{if(!a?.id)return {status:401};const value=await read(a.id,q.key);return value?{status:200,data:value}:{status:404}}}}`,
 'reader.mjs':`export function createReader(rows){const cache=new Map();return async(principal,key)=>{const cacheKey=${safe?'JSON.stringify([principal,key])':'key'};if(cache.has(cacheKey))return cache.get(cacheKey);const row=rows.find(r=>r.owner===principal&&r.key===key);if(row)cache.set(cacheKey,row);return row}}`
 },intro+' 一个 app 实例被多个用户的正常请求长期复用。不同用户可以有同名 key，每次返回内容只能归当前用户所有。',async({createApp})=>{const app=createApp([{key:'invoice',owner:'u1',body:'A'},{key:'invoice',owner:'u2',body:'B'}]);const first=await app.handle({id:'u1'},{key:'invoice'}),second=await app.handle({id:'u2'},{key:'invoice'});assert.equal(first.data.owner,'u1');return {first,second,violation:second.data?.owner==='u1'}})
 await add('queued-revocation',safe?'refuted':'supported',{
 'app.mjs':`import {makeWorker} from './worker.mjs';export function createApp(roles,objects){const queue=[];return {handle:async(a,q)=>{if(roles.get(a?.id)!=='admin')return {status:403};queue.push({principal:a.id,key:q.key});return {status:202}},drain:makeWorker(queue,roles,objects)}}`,
 'worker.mjs':`export function makeWorker(queue,roles,objects){return async()=>{const outcomes=[];while(queue.length){const job=queue.shift();${safe?'if(roles.get(job.principal)!=="admin"){outcomes.push("denied");continue;}':''}objects.delete(job.key);outcomes.push('deleted')}return outcomes}}`
 },intro+' 本服务提交延后删除任务。drain 由后台调度器调用；roles Map 可由可信管理操作在提交后、执行前撤销角色。安全约束：执行删除时主体必须仍是管理员，已撤权的排队任务不得删除对象。',async({createApp})=>{const roles=new Map([['u1','admin']]),objects=new Map([['a','A'],['b','B']]),app=createApp(roles,objects);await app.handle({id:'u1'},{key:'a'});await app.drain();assert.equal(objects.has('a'),false);await app.handle({id:'u1'},{key:'b'});roles.delete('u1');const drained=await app.drain();return {drained,remaining:objects.has('b'),violation:!objects.has('b')}})
}
await add('sparse-observation','inconclusive',{
 'run.log':'t=0 settings validated\nt=2 enumerate start\nt=3 visited src/a\nt=4 visited src/a/cache/a\nt=90 supervisor deadline\n',
 'capture.md':'仅保留部分调试日志。没有程序源码、目标目录树、完整调用栈或未采样日志。\n'
 },'有人依据 run.log 断言目标目录包含符号链接环，枚举持续了剩余86秒并导致超时。核实哪些主张被材料支持，给出下一项最小区分检查。只用当前材料；不联网，不构造材料没有给出的目标事实。',null)
await add('stage-counterevidence','inconclusive',{
 'run.log':'t=0 rules ready\nt=1 discovery begin\nt=3 discovery complete files=2\nt=4 analysis begin\nt=5 worker heartbeat waiting\nt=60 supervisor deadline\n',
 'capture.md':'阶段开始/结束事件完整。worker 心跳未包含等待对象；没有线程栈、规则实现和进程资源指标。\n'
 },'报告称扫描卡在目录枚举；另有人称一定是分析阶段死锁。根据材料核实两种说法，并设计能区分仍然可能原因的下一项检查。只用当前目录，不联网；未执行的实验不得写成结果。',null)
await writeFile(join(root,'answer-key.json'),JSON.stringify(key,null,2))
console.log(JSON.stringify({cases:key.length,executableOracles:key.filter(x=>x.oracle).length,root}))
