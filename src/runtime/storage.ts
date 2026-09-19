/** Durable scan and assessment operations over the SSC SAST storage domain. */

import { createHash } from 'node:crypto'
import type {
  SastAssessment,
  SastScanResult,
} from '@aaub-software/dsh-sast-contract'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import {
  sastAssessmentSchema,
  sastScanResultSchema,
  sscSastStorageSpec,
  type StoredSastAssessment,
  type StoredSastScan,
} from './storage-spec.js'

type SscSastDomain = Domain<typeof sscSastStorageSpec>

export interface CaptureSastScanInput {
  sessionId: string
  callId: string
  toolName: string
  result: SastScanResult
}

export interface LocatedSastFinding {
  scanId: string
  scan: StoredSastScan
}

/** Produce a deterministic, path-safe storage key from untrusted identifiers. */
function recordId(...parts: string[]): string {
  const hash = createHash('sha256')
  for (const part of parts) {
    hash.update(String(Buffer.byteLength(part)))
    hash.update(':')
    hash.update(part)
  }
  return hash.digest('hex')
}

/** Persistent operations used by the Runtime observer and model tools. */
export class SastAssessmentStore {
  constructor(private readonly domain: SscSastDomain) {}

  /** Persist one successful normalized scanner result exactly once per tool call. */
  async captureScan(input: CaptureSastScanInput): Promise<string> {
    const sessionId = input.sessionId.trim()
    const callId = input.callId.trim()
    const toolName = input.toolName.trim()
    if (sessionId === '') throw new Error('cannot capture a SAST scan without a session id')
    if (callId === '') throw new Error('cannot capture a SAST scan without a tool call id')
    if (toolName === '') throw new Error('cannot capture a SAST scan without a tool name')

    const scanId = recordId('scan', sessionId, callId, toolName)
    const scans = this.domain.table('scans')
    if (scans.get(scanId) !== undefined) return scanId

    await scans.put(scanId, {
      sessionId,
      callId,
      toolName,
      capturedAt: new Date().toISOString(),
      result: sastScanResultSchema.parse(input.result),
    })
    return scanId
  }

  /** Find the newest captured scan containing exactly one occurrence of a finding id. */
  locateFinding(sessionId: string, findingId: string): LocatedSastFinding {
    const matching = [...this.domain.table('scans').entries()]
      .filter(([, scan]) => scan.sessionId === sessionId)
      .map(([scanId, scan]) => ({
        scanId,
        scan,
        occurrences: scan.result.findings.filter(finding => finding.id === findingId).length,
      }))
      .filter(candidate => candidate.occurrences > 0)
      .sort((left, right) =>
        right.scan.capturedAt.localeCompare(left.scan.capturedAt)
        || right.scanId.localeCompare(left.scanId))

    const newest = matching[0]
    if (newest === undefined) {
      throw new Error(`finding ${JSON.stringify(findingId)} is not present in a captured scan for this task`)
    }
    if (newest.occurrences !== 1) {
      throw new Error(
        `finding ${JSON.stringify(findingId)} is ambiguous because it occurs ${newest.occurrences} times in its scan`,
      )
    }
    return { scanId: newest.scanId, scan: newest.scan }
  }

  /** Validate and durably upsert the current model assessment of one finding. */
  async putAssessment(sessionId: string, assessment: SastAssessment): Promise<StoredSastAssessment> {
    const validated = sastAssessmentSchema.parse(assessment)
    const located = this.locateFinding(sessionId, validated.findingId)
    const assessmentId = recordId('assessment', located.scanId, validated.findingId)
    const assessments = this.domain.table('assessments')
    const previous = assessments.get(assessmentId)
    const now = new Date().toISOString()
    const record: StoredSastAssessment = {
      sessionId,
      scanId: located.scanId,
      assessment: validated,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    }
    await assessments.put(assessmentId, record)
    return record
  }

  /** List this task's assessments in deterministic newest-first order. */
  listAssessments(sessionId: string): StoredSastAssessment[] {
    return [...this.domain.table('assessments').entries()]
      .map(([, record]) => record)
      .filter(record => record.sessionId === sessionId)
      .sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
        || right.scanId.localeCompare(left.scanId)
        || right.assessment.findingId.localeCompare(left.assessment.findingId))
  }

  /** Drain writes and release the Harness storage-domain handle. */
  close(): Promise<void> {
    return this.domain.close()
  }
}
