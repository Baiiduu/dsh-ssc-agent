import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { InvestigationStore, investigationSchema } from '../lib/runtime/investigation.js'
import { createSecurityInvestigationTool } from '../lib/runtime/investigation-tool.js'

function candidate() {
  return {
    title: 'Object ownership check', revision: 'fixture-v1; clean',
    hypothesis: 'An ordinary user may read another account through the document route.',
    boundary: 'Only the owner may read a document.', status: 'investigating',
    claims: ['attacker-control', 'reachability', 'ineffective-guard', 'security-impact'].map(kind => ({
      kind, conclusion: 'unknown', rationale: 'Caller and guard not yet inspected.', evidenceIds: [],
    })),
    evidence: [],
    counteranalysis: { alternative: 'The service layer may enforce ownership.', conclusion: 'unknown', rationale: 'Inspect service implementation.', evidenceIds: [] },
    nextCheck: 'Read document service and route registration.',
  }
}

function supported() {
  const value = candidate()
  value.status = 'supported'
  value.evidence = [{ id: 'code-1', kind: 'code', reference: 'fixture/routes.ts:10-24', observation: 'Registered route calls repository by caller-supplied id without ownership scope.' }]
  value.claims.forEach(claim => { claim.conclusion = 'supported'; claim.evidenceIds = ['code-1'] })
  value.counteranalysis = { alternative: 'Repository enforces ownership.', conclusion: 'does-not-block', rationale: 'Repository accepts only id, without an authenticated owner.', evidenceIds: ['code-1'] }
  value.nextCheck = ''
  return value
}

function memoryStore() {
  const rows = new Map()
  return new InvestigationStore({ table: () => ({ get: key => rows.get(key), put: async (key, value) => rows.set(key, value), entries: () => rows.entries() }), close: async () => {} })
}

test('skill save example executes through the real tool and is retrievable', async () => {
  const args = JSON.parse(await readFile(new URL('../presets/ssc/skills/ssc-security-investigation/references/record-example.json', import.meta.url), 'utf8'))
  const store = memoryStore()
  const tool = createSecurityInvestigationTool(store)
  const exec = { agent: { session: { id: 'example', header: { cwd: '/fixture' } } }, signal: new AbortController().signal }
  await tool.execute(args, exec)
  assert.equal((await tool.execute({ action: 'get', caseId: args.caseId }, exec)).record.status, 'investigating')
})

test('incomplete hypotheses remain saveable; missing evidence cannot be promoted', () => {
  const value = candidate()
  assert.equal(investigationSchema.parse(value).validation, null)
  value.status = 'supported'
  assert.throws(() => investigationSchema.parse(value), /all four supported/)
})

test('static support remains distinct from runtime reproduction', () => {
  const value = supported()
  assert.equal(investigationSchema.parse(value).validation, null)
  value.validation = { outcome: 'reproduced', procedure: 'Invoke route as user B.', expected: 'Denied', observed: 'Document returned', control: 'User A owns document.', evidenceIds: ['code-1'] }
  assert.throws(() => investigationSchema.parse(value), /execution evidence/)
  value.evidence.push({ id: 'run-1', kind: 'execution', reference: 'artifacts/run-1.json', observation: 'Owner receives 200, different user also receives document body.' })
  value.validation.evidenceIds = ['run-1']
  assert.equal(investigationSchema.parse(value).validation.outcome, 'reproduced')
})

test('evidence labels accept model-standard uppercase IDs without weakening references or storage keys', async () => {
  const value = supported()
  value.evidence[0].id = 'E1'
  value.claims.forEach(claim => { claim.evidenceIds = ['E1'] })
  value.counteranalysis.evidenceIds = ['E1']
  assert.equal(investigationSchema.parse(value).evidence[0].id, 'E1')
  const store = memoryStore()
  await store.save('a', '/project', 'ownership', value)
  assert.equal(store.get('a', '/project', 'ownership').record.evidence[0].id, 'E1')
  value.claims[0].evidenceIds = ['e1']
  assert.throws(() => investigationSchema.parse(value), /unknown evidence ID/)
  value.claims[0].evidenceIds = ['E1']
  value.evidence.push({ ...value.evidence[0] })
  assert.throws(() => investigationSchema.parse(value), /unique/)
  await assert.rejects(store.save('a', '/project', 'UPPERCASE-KEY', supported()))
})

test('absence of proof is not a refutation', () => {
  const value = candidate()
  value.status = 'refuted'
  assert.throws(() => investigationSchema.parse(value), /necessary condition/)
  value.evidence = [{ id: 'guard', kind: 'code', reference: 'service.ts:42', observation: 'Repository query includes current user id.' }]
  value.claims[2] = { kind: 'ineffective-guard', conclusion: 'refuted', rationale: 'Query is scoped to authenticated owner.', evidenceIds: ['guard'] }
  assert.equal(investigationSchema.parse(value).status, 'refuted')
})

test('duplicate/missing claims, evidence IDs and unresolved counterarguments are rejected', () => {
  for (const mutate of [
    r => { r.claims[1].kind = r.claims[0].kind },
    r => { r.claims[0].evidenceIds = ['missing'] },
    r => { r.evidence.push({ ...r.evidence[0] }) },
    r => { r.counteranalysis.conclusion = 'unknown' },
    r => { r.claims[0].evidenceIds = [] },
  ]) {
    const value = supported()
    mutate(value)
    assert.equal(investigationSchema.safeParse(value).success, false)
  }
})

test('unknown records need a next check and oversized logs are rejected', () => {
  const value = candidate()
  value.nextCheck = ' '
  assert.throws(() => investigationSchema.parse(value), /next check/)
  value.nextCheck = 'Inspect caller'
  value.evidence = Array.from({ length: 10 }, (_, index) => ({ id: `e-${index}`, kind: 'execution', reference: 'trace.log', observation: 'x'.repeat(8_000) }))
  assert.throws(() => investigationSchema.parse(value), /64 KiB/)
})

test('independent findings can be retrieved and are isolated by session and workspace', async () => {
  const store = memoryStore()
  await store.save('a', '/project', 'ownership', supported())
  assert.equal(store.get('a', '/project', 'ownership').record.status, 'supported')
  assert.equal(store.get('b', '/project', 'ownership'), null)
  assert.equal(store.get('a', '/different-project', 'ownership'), null)
  assert.deepEqual(store.list('b', '/project').cases, [])
  const changed = candidate()
  changed.revision = 'fixture-v2; guard changed'
  await store.save('a', '/project', 'ownership', changed)
  assert.equal(store.list('a', '/project').cases.length, 1)
  assert.equal(store.get('a', '/project', 'ownership').record.status, 'investigating')
  await assert.rejects(store.save('a', '/project', '../escape', candidate()))
})

test('pagination exposes remaining cases rather than silently dropping them', async () => {
  const store = memoryStore()
  for (let i = 0; i < 21; i++) await store.save('a', '/project', `case-${i}`, candidate())
  const first = store.list('a', '/project')
  assert.equal(first.cases.length, 20)
  assert.equal(first.nextOffset, 20)
  assert.equal(store.list('a', '/project', first.nextOffset).cases.length, 1)
  assert.equal(store.list('a', '/project', 20).nextOffset, null)
  assert.throws(() => store.list('a', '/project', -1))
})

test('the model-facing definition registers its structured record schema', () => {
  const tool = createSecurityInvestigationTool(memoryStore())
  assert.equal(tool.name, 'security_investigation')
  assert.ok(tool.description.includes('NOT independent confirmation'))
})

test('tool uses caller identity, rejects incomplete promotions, and honors cancellation', async () => {
  const store = memoryStore()
  const tool = createSecurityInvestigationTool(store)
  const exec = { agent: { session: { id: 'caller', header: { cwd: '/project' } } }, signal: new AbortController().signal }
  const record = candidate()
  const saved = await tool.execute({ action: 'save', caseId: 'ownership', record, sessionId: 'someone-else' }, exec)
  assert.equal(saved.sessionId, 'caller')
  assert.equal((await tool.execute({ action: 'get', caseId: 'ownership' }, exec)).record.status, 'investigating')
  assert.equal(store.get('someone-else', '/project', 'ownership'), null)
  record.status = 'supported'
  await assert.rejects(tool.execute({ action: 'save', caseId: 'ownership', record }, exec))
  assert.equal(store.get('caller', '/project', 'ownership').record.status, 'investigating')
  await assert.rejects(tool.execute({ action: 'list', record }, exec), /only offset/)
  await assert.rejects(tool.execute({ action: 'list' }, { signal: exec.signal }), /calling Agent/)
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await assert.rejects(tool.execute({ action: 'save', caseId: 'cancelled', record: candidate() }, { ...exec, signal: controller.signal }), /cancelled/)
  assert.equal(store.get('caller', '/project', 'cancelled'), null)
})
