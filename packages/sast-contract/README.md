# @aaub-software/dsh-sast-contract

Versioned, scanner-neutral SAST result contract for DeepSeek Harness security plugins.

The package gives Semgrep, ESLint Security, and future scanner plugins a common model-facing result shape while preserving bounded scanner-specific evidence.

## Scope

This package defines the scanner fact layer:

- scanner and component versions;
- normalized rule metadata and severity;
- workspace-relative source locations;
- findings and scanner-provided evidence;
- diagnostics that affect scan completeness;
- result counts, truncation, and duration.

It does not define model verdicts, false-positive decisions, remediation text, cross-tool grouping, or final report formatting. Those belong to later Agent review layers.

## Install

```sh
npm install @aaub-software/dsh-sast-contract
```

The package requires Node.js 24 or newer.

## TypeScript usage

```ts
import {
  SAST_SCHEMA_VERSION,
  type SastScanResult,
} from '@aaub-software/dsh-sast-contract'

const result = {
  schemaVersion: SAST_SCHEMA_VERSION,
  status: 'completed',
  scanner: {
    name: 'example-scanner',
    version: '1.0.0',
    configuration: 'security-default',
  },
  scannedPaths: ['src'],
  findings: [
    {
      id: 'example-scanner:rule-id:src/server.js:2:18',
      scanner: 'example-scanner',
      rule: {
        id: 'rule-id',
        severity: 'error',
        cwe: ['CWE-95'],
      },
      message: 'A dynamic expression reaches an eval call.',
      location: {
        path: 'src/server.js',
        startLine: 2,
        startColumn: 18,
        endLine: 2,
        endColumn: 44,
      },
      evidence: [],
    },
  ],
  diagnostics: [],
  summary: {
    scannedFiles: 1,
    totalFindings: 1,
    returnedFindings: 1,
    truncated: false,
    durationMs: 125,
  },
} satisfies SastScanResult
```

The generated declaration files let an editor complete contract fields and let TypeScript reject incompatible values before the scanner plugin is published.

## Scanner-specific evidence

Plugins may extend `SastEvidence` with typed evidence that the scanner actually emitted:

```ts
import type {
  SastEvidence,
  SastScanResult,
} from '@aaub-software/dsh-sast-contract'

interface MetavariableEvidence extends SastEvidence {
  type: 'semgrep.metavariables'
  data: {
    [name: string]: string
  }
}

type SemgrepScanResult = SastScanResult<MetavariableEvidence>
```

Evidence types should be stable and namespaced. Plugins must not copy complete native scanner output into `data`.

## Normalization rules

A scanner adapter should:

1. convert native severities to `info`, `warning`, or `error`;
2. convert host paths to forward-slash workspace-relative paths;
3. retain accurate rules, messages, locations, fingerprints, and useful evidence;
4. separate security findings from scan diagnostics;
5. report truncation and partial coverage explicitly;
6. omit progress logs, cache details, host paths, and unrelated runtime internals.

Optional CWE, OWASP, reference, fingerprint, and evidence fields must come from scanner output or an explicitly maintained deterministic mapping. Adapters must not guess them.

## JSON Schema

The Draft 2020-12 runtime schema is exported as:

```text
@aaub-software/dsh-sast-contract/schema
```

Its schema identifier is:

```text
urn:aaub-software:ssc-sast:v1
```

TypeScript declarations provide compile-time checks. The JSON Schema supports runtime validation and plugins implemented in other languages.

## Versioning

Every result carries `schemaVersion: "ssc-sast/v1"`. Additive optional fields remain compatible with v1. Removing fields, changing required fields, or changing field meaning requires a new protocol version.

## License

MIT
