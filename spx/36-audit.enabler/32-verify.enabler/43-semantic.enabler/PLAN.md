# Plan: Fix Gate 0 violations to reach APPROVED

Audit verdict: REJECT (Gate 0: 57 ESLint C1+L1 errors). Gates 1 and 2 were skipped.
Verdict file: `.spx/nodes/spx-spx-36-audit.enabler-32-verify.enabler-43-semantic.enabler/2026-04-26_07-45-11.audit.xml`

## Step 1 — Export defect constants from `src/audit/semantic.ts`

Add three exported constants at the top of the file:

```typescript
export const DEFECT_INCOHERENT_VERDICT = "incoherent verdict";
export const DEFECT_FAILED_NO_FINDINGS = "failed gate has no findings";
export const DEFECT_SKIPPED_NO_REASON = "skipped gate missing reason";
```

Both test files redeclare these as local `const` — C1 violations. Importing from the
production module eliminates the C1 and L1 findings for all three.

## Step 2 — Resolve status/verdict string literals

`"PASS"`, `"FAIL"`, `"SKIPPED"`, `"APPROVED"`, `"REJECT"` appear as L1 violations across
both test files. Two options (choose one):

**Option A — Export constants from `src/audit/reader.ts`**:

```typescript
export const GATE_STATUSES = { PASS: "PASS", FAIL: "FAIL", SKIPPED: "SKIPPED" } as const;
export const VERDICT_VALUES = { APPROVED: "APPROVED", REJECT: "REJECT" } as const;
```

Import in tests: `import { GATE_STATUSES, VERDICT_VALUES } from "@/audit/reader"`.

**Option B — Add a repo-level `eslint.audit.config.ts` override**:
These strings are schema-protocol values (like HTTP methods). Extend the default config
with `protocolStringExceptions` covering them. File goes at `<project-root>/eslint.audit.config.ts`.

## Step 3 — Update test fixtures

Replace all module-scope `const` object fixtures (`APPROVED_HEADER`, `REJECT_HEADER`,
`PASS_GATE`, `FAIL_GATE`, etc.) with either:

- Inline construction per test case (removes C1; use imported constants for strings)
- Shared factory helpers in `@testing/harnesses/audit-verdict.ts`

Gate names (`"architecture"`, `"tests"`, `"paths"`) and timestamps (`"2024-01-01_00-00-00"`)
are synthetic test values — generate them or use a factory, not named constants.

## Step 4 — Re-run audit

```bash
/typescript:auditing-typescript-tests spx/spx/36-audit.enabler/32-verify.enabler/43-semantic.enabler
```

Gate 0 should now PASS; Gates 1 and 2 will then run.

---

## Defect: Audit skill verdict template uses wrong XML format

The `typescript:auditing-typescript-tests` skill's `<verdict_template>` shows attributes:

```xml
<gate id="0" name="deterministic" status="FAIL">
```

But `src/audit/reader.ts` uses `fast-xml-parser` with `attributeNamePrefix: "@_"` and
reads gate properties as **child elements** (`raw["name"]`, `raw["status"]`). Attributes
parse to `raw["@_name"]`, `raw["@_status"]` — not `raw["name"]`.

**Correct format** (matches reader implementation):

```xml
<gate>
  <name>deterministic</name>
  <status>FAIL</status>
  <skipped_reason>Gate 0 failed</skipped_reason> <!-- only for SKIPPED gates -->
  <findings count="N">
    <finding>...</finding>
  </findings>
</gate>
```

This defect should be filed against the `typescript:auditing-typescript-tests` skill template
in the plugins repo. Writing a verdict with attributes causes `status: undefined` on all gates,
which makes the semantic stage report "incoherent verdict: REJECT but all gates are PASS".
