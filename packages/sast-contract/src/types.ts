/** JSON values allowed in extensible scanner-specific fields. */
export type JsonPrimitive = boolean | number | string | null

/** A JSON-serializable value. */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

/** Version of the normalized SAST result contract. */
export type SastSchemaVersion = 'ssc-sast/v1'

/** Completion state of a usable scan result. Fatal failures should remain tool errors. */
export type SastScanStatus = 'completed' | 'partial'

/** Common severity vocabulary exposed to the Agent. */
export type SastSeverity = 'info' | 'warning' | 'error'

/** Workspace-relative source span. Paths use forward slashes and never expose host paths. */
export interface SastLocation {
  path: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

/** Identity and version information for the scanner that produced a result. */
export interface SastScanner {
  name: string
  version: string
  /** Versions of rule packs, parsers, runtimes, or other relevant components. */
  components?: Record<string, string>
  /** Scanner configuration identity, such as a pinned ruleset name. */
  configuration?: string
}

/** Normalized metadata for the rule that produced a finding. */
export interface SastRule {
  id: string
  name?: string
  severity: SastSeverity
  cwe?: string[]
  owasp?: string[]
  references?: string[]
}

/**
 * Evidence emitted by a scanner in addition to its message and source location.
 *
 * Plugins should use a stable, preferably namespaced `type` and extend this
 * interface with typed fields. `data` is reserved for small JSON values that do
 * not justify a shared cross-scanner field.
 */
export interface SastEvidence {
  type: string
  description?: string
  locations?: SastLocation[]
  data?: Record<string, JsonValue>
}

/** One normalized scanner finding suitable for deterministic Agent consumption. */
export interface SastFinding<TEvidence extends SastEvidence = SastEvidence> {
  /** Stable scanner-scoped identifier used to correlate later assessments. */
  id: string
  /** Scanner name repeated here so a finding remains attributable after aggregation. */
  scanner: string
  rule: SastRule
  message: string
  location: SastLocation
  fingerprint?: string
  evidence: TEvidence[]
}

/** A non-finding condition that may affect completeness or interpretation. */
export interface SastDiagnostic {
  level: 'info' | 'warning' | 'error'
  type: string
  message: string
  code?: number | string
  location?: SastLocation
}

/** Bounded result and timing information shared by every scanner. */
export interface SastScanSummary {
  scannedFiles?: number
  totalFindings: number
  returnedFindings: number
  truncated: boolean
  durationMs: number
}

/**
 * Versioned, model-facing result returned by every SSC SAST scanner plugin.
 * Scanner-native output and progress logs are intentionally excluded.
 */
export interface SastScanResult<TEvidence extends SastEvidence = SastEvidence> {
  schemaVersion: SastSchemaVersion
  status: SastScanStatus
  scanner: SastScanner
  scannedPaths: string[]
  findings: Array<SastFinding<TEvidence>>
  diagnostics: SastDiagnostic[]
  summary: SastScanSummary
}
