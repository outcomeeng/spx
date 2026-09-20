# Issues: review

## The command-surface assertion links a test file that does not exist

**Evidence:** `spx/34-verification.enabler/32-verify.enabler/65-review.enabler/review.md`
carries the assertion "NEVER: review command vocabulary exposes GitHub review subcommands or
provider-specific review comment verbs; provider handling stays in payloads and backend
projection" with the evidence link `tests/review-command-surface.compliance.l1.test.ts`. The node
carries no `tests/` directory, so the linked path
`spx/34-verification.enabler/32-verify.enabler/65-review.enabler/tests/review-command-surface.compliance.l1.test.ts`
resolves to no file.

**Impact:** the assertion derives Declared. The node's own claim carries no result for it, so
the review command-surface rule is stated and not proven while the child nodes
`21-review-evidence-model.enabler` and `32-review-run-projection.enabler` carry passing evidence.

**Settlement condition:** the linked test file exists at the linked path and the assertion's
evidence passes.
