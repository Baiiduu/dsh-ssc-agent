/**
 * Cordis Runtime for durable SSC SAST scans and model assessments.
 * @module @aaub-software/dsh-ssc-agent/runtime
 */

import type { SastScanResult } from '@aaub-software/dsh-sast-contract'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import { SastAssessmentStore } from './storage.js'
import { sscSastStorageSpec } from './storage-spec.js'
import { createSubmitSastAssessmentTool } from './tool.js'

const SAST_SCAN_TOOLS = new Set([
  'semgrep_scan',
  'eslint_security_scan',
])

/** Cordis plugin name used in diagnostics. */
export const name = 'ssc-agent-runtime'

/** Host services required for durable state and scanner-result observation. */
export const inject = ['storageDomain', 'tools']

/** Open durable state and capture successful normalized SAST tool results. */
export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(sscSastStorageSpec)
  const store = new SastAssessmentStore(domain)
  ctx.effect(() => () => store.close(), 'sscAgentRuntime.storageClose')
  ctx.tools.register(createSubmitSastAssessmentTool(store))

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (
      decision.kind === 'block'
      || result.isError
      || exec.agent === undefined
      || !SAST_SCAN_TOOLS.has(exec.name)
    ) {
      return decision
    }

    const value = decision.value ?? result.value
    await store.captureScan({
      sessionId: String(exec.agent.session.id),
      callId: String(exec.callId),
      toolName: exec.name,
      result: value as unknown as SastScanResult,
    })
    return decision
  })
}

export {
  sastAssessmentSchema,
  sastScanResultSchema,
  sscSastStorageSpec,
  storedSastAssessmentSchema,
  storedSastScanSchema,
} from './storage-spec.js'
export type { StoredSastAssessment, StoredSastScan } from './storage-spec.js'
