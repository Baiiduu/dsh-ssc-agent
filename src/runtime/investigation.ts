/** Model-authored investigations, independent of scanner finding IDs. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { defineDomain, domainTable, type Domain } from '@deepseek-ai/dsh-storage-domain'

const text = z.string().trim().min(1).max(8_000)
const ids = z.array(z.string().trim().min(1).max(64)).max(40)
export const caseIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/)
// Evidence labels are local, case-sensitive references, not storage keys.
export const evidenceIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
const claimKinds = ['attacker-control', 'reachability', 'ineffective-guard', 'security-impact'] as const

/** Checks completeness and cross-references, not the truth of model assertions. */
export const investigationSchema = z.object({
  title: text,
  revision: text,
  hypothesis: text,
  boundary: text,
  status: z.enum(['investigating', 'supported', 'refuted', 'inconclusive']),
  claims: z.array(z.object({
    kind: z.enum(claimKinds),
    conclusion: z.enum(['supported', 'refuted', 'unknown']),
    rationale: text,
    evidenceIds: ids,
  }).strict()).length(4),
  evidence: z.array(z.object({
    id: evidenceIdSchema,
    kind: z.enum(['code', 'execution', 'external']),
    reference: text,
    observation: text,
  }).strict()).max(40),
  counteranalysis: z.object({
    alternative: text,
    conclusion: z.enum(['blocks', 'does-not-block', 'unknown']),
    rationale: text,
    evidenceIds: ids,
  }).strict(),
  validation: z.object({
    outcome: z.enum(['reproduced', 'not-reproduced', 'blocked']),
    procedure: text,
    expected: text,
    observed: text,
    control: text,
    evidenceIds: ids,
  }).strict().nullable().default(null),
  nextCheck: z.string().trim().max(8_000),
}).strict().superRefine((record, ctx) => {
  const problem = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > 65_536) problem('case exceeds 64 KiB; reference artifacts instead of embedding logs')
  const evidence = new Map(record.evidence.map(item => [item.id, item]))
  if (evidence.size !== record.evidence.length) problem('evidence IDs must be unique')
  if (new Set(record.claims.map(claim => claim.kind)).size !== 4) problem('include each of the four claim kinds exactly once')
  for (const item of [...record.claims, record.counteranalysis, ...(record.validation ? [record.validation] : [])]) {
    for (const id of item.evidenceIds) {
      if (!evidence.has(id)) problem(`unknown evidence ID: ${id}`)
    }
  }
  for (const claim of record.claims) {
    if (claim.conclusion !== 'unknown' && claim.evidenceIds.length === 0) problem(`${claim.kind} needs evidence for its conclusion`)
  }
  if (record.counteranalysis.conclusion !== 'unknown' && record.counteranalysis.evidenceIds.length === 0) {
    problem('a resolved counteranalysis needs evidence')
  }
  if (record.status === 'supported' && (
    record.claims.some(claim => claim.conclusion !== 'supported')
    || record.counteranalysis.conclusion !== 'does-not-block'
  )) problem('supported requires all four supported claims and evidence addressing the counterargument')
  if (record.status === 'refuted' && !record.claims.some(claim => claim.conclusion === 'refuted')
    && record.counteranalysis.conclusion !== 'blocks') problem('refuted requires evidence defeating a necessary condition')
  if (['investigating', 'inconclusive'].includes(record.status) && record.nextCheck === '') {
    problem('unresolved investigations need a concrete next check')
  }
  if (record.validation?.outcome === 'reproduced' && !record.validation.evidenceIds.some(id => evidence.get(id)?.kind === 'execution')) {
    problem('reproduced needs execution evidence, not just code or an external report')
  }
})

export type Investigation = z.infer<typeof investigationSchema>
export const storedInvestigationSchema = z.object({
  sessionId: text,
  workspace: text,
  caseId: caseIdSchema,
  record: investigationSchema,
  updatedAt: z.iso.datetime(),
}).strict()

// Separate domain leaves existing SAST records and consumers unchanged.
export const investigationStorageSpec = defineDomain({
  name: 'aaub_ssc_investigations',
  version: 1,
  layout: 'per-record',
  tables: { cases: domainTable<string, z.infer<typeof storedInvestigationSchema>>(storedInvestigationSchema) },
})

function key(sessionId: string, workspace: string, caseId: string): string {
  return createHash('sha256').update(JSON.stringify([sessionId, workspace, caseId])).digest('hex')
}

export class InvestigationStore {
  constructor(private readonly domain: Domain<typeof investigationStorageSpec>) {}

  async save(sessionId: string, workspace: string, caseId: string, record: unknown) {
    const stored = storedInvestigationSchema.parse({ sessionId, workspace, caseId, record, updatedAt: new Date().toISOString() })
    await this.domain.table('cases').put(key(stored.sessionId, stored.workspace, stored.caseId), stored)
    return stored
  }

  get(sessionId: string, workspace: string, caseId: string) {
    return this.domain.table('cases').get(key(sessionId, workspace, caseIdSchema.parse(caseId))) ?? null
  }

  list(sessionId: string, workspace: string, offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('offset must be a non-negative integer')
    const records = [...this.domain.table('cases').entries()].map(([, value]) => value)
      .filter(value => value.sessionId === sessionId && value.workspace === workspace)
      .sort((a, b) => a.caseId.localeCompare(b.caseId))
    return {
      cases: records.slice(offset, offset + 20).map(value => ({
        caseId: value.caseId, title: value.record.title, status: value.record.status,
        revision: value.record.revision, updatedAt: value.updatedAt,
      })),
      nextOffset: offset + 20 < records.length ? offset + 20 : null,
    }
  }

  close() { return this.domain.close() }
}
