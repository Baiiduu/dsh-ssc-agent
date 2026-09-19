/**
 * Durable SSC SAST records and their Harness storage-domain declaration.
 * @module @aaub-software/dsh-ssc-agent/runtime/storage-spec
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'

const locationSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(1),
  startColumn: z.number().int().min(1),
  endLine: z.number().int().min(1),
  endColumn: z.number().int().min(1),
}).strict()

const scannerSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  components: z.record(z.string(), z.string()).optional(),
  configuration: z.string().min(1).optional(),
}).strict()

const ruleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  severity: z.enum(['info', 'warning', 'error']),
  cwe: z.array(z.string()).optional(),
  owasp: z.array(z.string()).optional(),
  references: z.array(z.string()).optional(),
}).strict()

const evidenceSchema = z.object({
  type: z.string().min(1),
  description: z.string().min(1).optional(),
  locations: z.array(locationSchema).optional(),
  data: z.record(z.string(), z.json()).optional(),
}).catchall(z.json())

const findingSchema = z.object({
  id: z.string().min(1),
  scanner: z.string().min(1),
  rule: ruleSchema,
  message: z.string().min(1),
  location: locationSchema,
  fingerprint: z.string().min(1).optional(),
  evidence: z.array(evidenceSchema),
}).strict()

const diagnosticSchema = z.object({
  level: z.enum(['info', 'warning', 'error']),
  type: z.string().min(1),
  message: z.string().min(1),
  code: z.union([z.number(), z.string()]).optional(),
  location: locationSchema.optional(),
}).strict()

const scanSummarySchema = z.object({
  scannedFiles: z.number().int().min(0).optional(),
  totalFindings: z.number().int().min(0),
  returnedFindings: z.number().int().min(0),
  truncated: z.boolean(),
  durationMs: z.number().min(0),
}).strict()

/** Runtime validator for scanner-neutral `ssc-sast/v1` results. */
export const sastScanResultSchema = z.object({
  schemaVersion: z.literal('ssc-sast/v1'),
  status: z.enum(['completed', 'partial']),
  scanner: scannerSchema,
  scannedPaths: z.array(z.string().min(1)),
  findings: z.array(findingSchema),
  diagnostics: z.array(diagnosticSchema),
  summary: scanSummarySchema,
}).strict()

/** Runtime validator for the public minimal SAST assessment contract. */
export const sastAssessmentSchema = z.object({
  findingId: z.string().min(1),
  verdict: z.enum(['confirmed', 'likely', 'false-positive', 'inconclusive']),
  summary: z.string().min(1),
}).strict()

/** One scan captured from a successful scanner tool execution. */
export const storedSastScanSchema = z.object({
  sessionId: z.string().min(1),
  callId: z.string().min(1),
  toolName: z.string().min(1),
  capturedAt: z.iso.datetime(),
  result: sastScanResultSchema,
}).strict()

/** One durable model assessment linked to its exact captured scan. */
export const storedSastAssessmentSchema = z.object({
  sessionId: z.string().min(1),
  scanId: z.string().min(1),
  assessment: sastAssessmentSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict()

export type StoredSastScan = z.infer<typeof storedSastScanSchema>
export type StoredSastAssessment = z.infer<typeof storedSastAssessmentSchema>

/**
 * Per-record storage keeps each scan and assessment independently writable and
 * avoids rewriting every historical result when one finding is reviewed.
 */
export const sscSastStorageSpec = defineDomain({
  name: 'aaub_ssc_sast',
  version: 1,
  layout: 'per-record',
  tables: {
    scans: domainTable<string, StoredSastScan>(storedSastScanSchema),
    assessments: domainTable<string, StoredSastAssessment>(storedSastAssessmentSchema),
  },
})
