/** Model-facing tool for submitting one durable SAST finding assessment. */

import type { SastAssessment } from '@aaub-software/dsh-sast-contract'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { SastAssessmentStore } from './storage.js'

const assessmentOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findingId: { type: 'string', required: true },
    verdict: {
      type: 'string',
      enum: ['confirmed', 'likely', 'false-positive', 'inconclusive'],
      required: true,
    },
    summary: { type: 'string', required: true },
  },
} as const

/** Build the tool that validates, links, and persists one model assessment. */
export function createSubmitSastAssessmentTool(store: SastAssessmentStore) {
  return defineTool({
    name: 'submit_sast_assessment',
    description: 'Persist your completed review of exactly one SAST finding from this task. '
      + 'Inspect the relevant project code before calling this tool. Use false-positive only when concrete code evidence '
      + 'refutes a necessary vulnerability condition; use inconclusive when important context remains unavailable. '
      + 'The finding must exist in a successful semgrep_scan or eslint_security_scan result captured in this task.',
    parameters: {
      findingId: {
        type: 'string',
        required: true,
        description: 'Exact id copied from the scanner-produced finding being reviewed.',
      },
      verdict: {
        type: 'string',
        enum: ['confirmed', 'likely', 'false-positive', 'inconclusive'],
        required: true,
        description: 'Final adjudication of this candidate finding.',
      },
      summary: {
        type: 'string',
        required: true,
        description: 'Concise conclusion and the decisive code-based reason for the verdict.',
      },
    },
    output: {
      schema: assessmentOutputSchema,
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    async execute(args: SastAssessment, exec) {
      if (exec.agent === undefined) {
        throw new Error('submit_sast_assessment requires a calling Agent session')
      }
      const findingId = args.findingId.trim()
      const summary = args.summary.trim()
      if (findingId === '') {
        throw new Error('submit_sast_assessment: findingId must not be blank')
      }
      if (summary === '') {
        throw new Error('submit_sast_assessment: summary must not be blank')
      }

      exec.signal.throwIfAborted()
      const stored = await store.putAssessment(String(exec.agent.session.id), {
        findingId,
        verdict: args.verdict,
        summary,
      })
      return stored.assessment
    },
  })
}
