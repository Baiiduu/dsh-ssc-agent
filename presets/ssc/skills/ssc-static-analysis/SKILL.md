---
name: ssc-static-analysis
description: Use for static application security analysis of a repository, either by reviewing rule-engine findings with code context to reduce false positives or by directly analyzing code to find vulnerabilities that rules may miss.
---

# Static Application Security Analysis

Use either or both analysis paths according to the user's request and the evidence needed. They are complementary: rule-engine coverage finds known patterns efficiently, while direct model analysis can reason about project-specific behavior and cross-file logic.

## Review rule-engine findings

When a rule-engine scan is appropriate, choose the available scanner according to the target and the question:

- Use `semgrep_scan` for general, multi-language pattern coverage and Semgrep rules applicable to the repository.
- Use `eslint_security_scan` for fast JavaScript or TypeScript security-hotspot checks based on that ecosystem's syntax and AST.
- For a broader JavaScript or TypeScript assessment, use both when their complementary coverage is useful. Do not run both automatically when a narrow request or one relevant file only needs one scanner.

Scan the relevant workspace paths rather than widening the target without a reason. Treat every reported finding as a candidate, not as a confirmed vulnerability. A clean result from either scanner is not proof that the code is secure.

For each material finding, inspect the reported code and enough surrounding context to determine:

- whether untrusted or attacker-controlled input can reach the reported operation;
- whether the path is reachable in the real application;
- whether validation, sanitization, authorization, encoding, or other controls prevent exploitation;
- whether the operation has a concrete security impact in its actual deployment context.

Classify the finding as confirmed, likely, false positive, or requiring more evidence, and explain the classification from repository evidence. Do not infer exploitability from the rule severity alone. If the scan is partial or its findings are truncated, state that limitation instead of treating the result as complete.

## Analyze code directly

Use direct model analysis when the user requests a semantic review, when no suitable rule covers the suspected weakness, or when project context suggests that rule scanning alone is insufficient.

Understand the relevant entry points, trust boundaries, privileges, data flows, and security controls. Trace suspicious values and decisions across files where necessary. Look for vulnerabilities arising from business logic, unsafe combinations of otherwise ordinary operations, missing authorization or validation, and other project-specific behavior that pattern rules may not express.

Base every reported issue on identifiable code and a plausible execution or data-flow path. Clearly separate observed facts from inference and state what additional evidence is needed when the path cannot be established. Do not describe the absence of discovered issues as proof that the project is secure.

## Combine the results

When using both paths, use the engine results to guide contextual verification, then perform targeted direct analysis of important surfaces and gaps not covered by those findings. If Semgrep and ESLint Security report the same underlying operation, combine them into one issue rather than counting rule matches separately. Preserve the useful rule identifiers and report the strongest repository evidence for each conclusion.

Static analysis is read-only unless the user separately asks for remediation. Do not modify project code merely because an issue was found.
