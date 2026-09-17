import type { SastSchemaVersion } from './types.js'

/** Runtime value written to every normalized SSC SAST result. */
export const SAST_SCHEMA_VERSION: SastSchemaVersion = 'ssc-sast/v1'

export type {
  JsonPrimitive,
  JsonValue,
  SastDiagnostic,
  SastEvidence,
  SastFinding,
  SastLocation,
  SastRule,
  SastScanner,
  SastScanResult,
  SastScanStatus,
  SastScanSummary,
  SastSchemaVersion,
  SastSeverity,
} from './types.js'
