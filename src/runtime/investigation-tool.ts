import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InvestigationStore } from './investigation.js'

const requiredText = { type: 'string', required: true, description: 'Non-empty text, up to 8000 characters.' } as const
const evidenceIds = { type: 'array', items: { type: 'string' }, required: true,
  description: 'Required even when unknown: use [] then. Up to 40 exact, case-sensitive IDs from record.evidence. Resolved conclusions need at least one ID.' } as const

/** One tool keeps saving and restoring independent discoveries session-scoped. */
export function createSecurityInvestigationTool(store: InvestigationStore) {
  return defineTool({
    name: 'security_investigation',
    description: 'Save or restore a security investigation in this session/workspace. Supports independently discovered issues without scanner IDs. '
      + 'Records are model-authored: schema acceptance is NOT independent confirmation of a vulnerability. '
      + 'Use save at meaningful evidence changes, get to restore one case, list to recover case summaries. '
      + 'supported means an evidence-supported model assessment; reproduction and public disclosure are separate questions. '
      + 'Recheck revision and cited artifacts before reusing a saved conclusion. Never store secrets.',
    parameters: {
      action: { type: 'string', enum: ['save', 'get', 'list'], required: true },
      caseId: { type: 'string', description: 'For save/get: stable lowercase slug, up to 64 letters/digits/dots/underscores/hyphens.' },
      offset: { type: 'integer', description: 'For list: nextOffset returned by the preceding page; defaults to zero.' },
      record: {
        type: 'object', additionalProperties: false,
        description: 'For save: complete vulnerability record, at most 64 KiB. For ordinary fault diagnosis use a report instead; do not invent attacker-control claims. Keep unresolved claims unknown.',
        properties: {
          title: requiredText,
          revision: { ...requiredText, description: 'Observed commit plus relevant uncommitted changes or content hashes; explicitly state if unavailable.' },
          hypothesis: requiredText,
          boundary: { ...requiredText, description: 'The security invariant/trust boundary allegedly violated.' },
          status: { type: 'string', enum: ['investigating', 'supported', 'refuted', 'inconclusive'], required: true,
            description: 'supported requires all four claims supported and counteranalysis=does-not-block. refuted requires a defeated necessary condition. investigating/inconclusive require nextCheck. This label must agree with the final report.' },
          claims: { type: 'array', required: true, description: 'Exactly four claims, one of each kind. Distinguish observed facts from inferences in rationale.', items: {
            type: 'object', additionalProperties: false, properties: {
              kind: { type: 'string', enum: ['attacker-control', 'reachability', 'ineffective-guard', 'security-impact'], required: true },
              conclusion: { type: 'string', enum: ['supported', 'refuted', 'unknown'], required: true },
              rationale: requiredText, evidenceIds,
            },
          } },
          evidence: { type: 'array', required: true, description: 'Up to 40 unique evidence IDs. Cite artifacts; do not embed full logs.', items: {
            type: 'object', additionalProperties: false, properties: {
              id: { type: 'string', required: true, description: 'Case-sensitive ID: 1–64 ASCII letters/digits/dots/underscores/hyphens, starting with a letter or digit. E1 and e1 are different. Example: E1 or run-1.' },
              kind: { type: 'string', enum: ['code', 'execution', 'external'], required: true },
              reference: { ...requiredText, description: 'Recheckable file:line/symbol, command-output artifact, or source URL with version/date.' },
              observation: { ...requiredText, description: 'What was actually read or observed; keep inferred conclusions in claims.' },
            },
          } },
          counteranalysis: { type: 'object', additionalProperties: false, required: true, properties: {
            alternative: { ...requiredText, description: 'Strongest plausible guard or alternative explanation.' },
            conclusion: { type: 'string', enum: ['blocks', 'does-not-block', 'unknown'], required: true },
            rationale: requiredText, evidenceIds,
          } },
          validation: { type: 'object', additionalProperties: false, description: 'Omit if no reproduction attempt occurred.', properties: {
            outcome: { type: 'string', enum: ['reproduced', 'not-reproduced', 'blocked'], required: true },
            procedure: { ...requiredText, description: 'Exact command/artifact and tested implementation/version/entrypoint. Explicitly distinguish target execution from a synthetic mechanism demonstration.' }, expected: requiredText, observed: requiredText,
            control: { ...requiredText, description: 'Control experiment and result, or explicit reason no valid control was obtained.' }, evidenceIds,
          } },
          nextCheck: { ...requiredText, description: 'Next discriminating check for unresolved cases; may be empty for resolved cases.' },
        },
      },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    async execute(args, exec) {
      if (exec.agent === undefined) throw new Error('security_investigation requires a calling Agent session')
      const sessionId = String(exec.agent.session.id)
      const workspace = exec.agent.session.header.cwd
      if (!workspace) throw new Error('security_investigation requires a workspace')
      exec.signal.throwIfAborted()
      if (args.action === 'list') {
        if (args.record !== undefined || args.caseId !== undefined) throw new Error('list accepts only offset')
        return store.list(sessionId, workspace, args.offset)
      }
      if (args.caseId === undefined || args.offset !== undefined) throw new Error('save/get requires caseId and does not accept offset')
      if (args.action === 'get') {
        if (args.record !== undefined) throw new Error('get does not accept record')
        return store.get(sessionId, workspace, args.caseId)
      }
      if (args.record === undefined) throw new Error('save requires record')
      return store.save(sessionId, workspace, args.caseId, args.record)
    },
  })
}
