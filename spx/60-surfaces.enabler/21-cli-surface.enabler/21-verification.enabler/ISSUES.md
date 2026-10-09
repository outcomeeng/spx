# Known Issues

> Coordination note, not product truth. Reconcile against `verification.md`, the children's specs, [`spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`](spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md), [`spx/14-cli-composition.adr.md`](spx/14-cli-composition.adr.md), and `spx/ISSUES.md` before acting. The issues below are sustainable to fix only inside the spec-tree restructuring `spx/PLAN.md` coordinates; each names the change that unblocks it.

## The verification command family spans four spellings of one domain name

[`spx/14-cli-composition.adr.md`](spx/14-cli-composition.adr.md) composes each command domain from one `{domain}` name across `src/domains/{domain}/`, `src/commands/{domain}/`, and `src/interfaces/cli/{domain}.ts`. The verification family names that domain four ways:

| Layer                   | Path                                                                     | Name           |
| ----------------------- | ------------------------------------------------------------------------ | -------------- |
| domain                  | `src/domains/verify/`                                                    | `verify`       |
| handlers                | `src/commands/verify/` and `src/commands/verification-exec/`             | both           |
| descriptor              | `src/interfaces/cli/verify.ts`                                           | `verify`       |
| registered root command | `VERIFICATION_RUN_CLI_SURFACE.rootCommandName` in that descriptor        | `verification` |
| governing PDR filename  | `13-verify-command-surface.pdr.md`, governing the `verification` surface | `verify`       |

The descriptor contradicts itself: it declares `forbiddenRootCommandName: "verify"` while living in `verify.ts`, and the record-run compliance evidence imports it from `@/interfaces/cli/verify`.

**Impact:** every new command path in this family chooses a spelling, and the split between `src/commands/verify/` and `src/commands/verification-exec/` hides that the caller-driven and spx-driven handlers are one command domain.

**Resolution:** one domain name, `verification`, across the three layers: `git mv src/domains/verify → src/domains/verification`, fold `src/commands/verification-exec/` into `src/commands/verification/`, `git mv src/interfaces/cli/verify.ts → src/interfaces/cli/verification.ts`, and `git mv` the PDR to `13-verification-command-surface.pdr.md`, updating every import and the record-run evidence in the same change. Do this after the layer-name decision in `spx/ISSUES.md` ("CLI source layers carry the pre-surfaces layer names") so the descriptor moves once, not twice.

**Skills:** `/refactor`, `/apply`, `/audit-typescript-code`.

## CLI source layers carry the pre-surfaces layer names

Product-wide; recorded in [`spx/ISSUES.md`](spx/ISSUES.md). It gates the naming resolution above because that resolution moves files under `src/interfaces/cli/`.

## External values reach the terminal without control-byte escaping

This node's terminal output path passes values that originated outside the product's own source straight to the process streams. [`spx/13-cli.enabler/15-cli-architecture.adr.md`](spx/13-cli.enabler/15-cli-architecture.adr.md) makes escaping a property of the composed value: an externally-originated segment is escaped where it is embedded, through the `src/lib/terminal-text/` primitive, while product-authored segments keep their bytes so styling and line structure survive. This node predates that invariant and has not migrated to it.

**Unescaped sites:**

- `src/interfaces/cli/verify.ts` — the caller-driven `spx verification run` command paths' output — git refs and journal file content; the spx-driven `spx verification <type> run` path composes its warning and diagnostics through the primitive and serializes its structured result through the primitive's JSON composition, so it carries none of this debt

**Impact:** a value carrying an escape byte (`0x1b`) can reposition the cursor, recolor the terminal, or clear the screen; a value carrying a line feed can forge an additional diagnostic line that reads as if spx emitted it. Whoever controls the named origins controls those bytes.

**Resolution:** compose this node's terminal-destined text through `src/lib/terminal-text/`, declaring each interpolated value authored or external at the point of composition; then add the node's own compliance assertion and co-located evidence that a control-byte-bearing value renders escaped. [`spx/54-diagnose.enabler`](spx/54-diagnose.enabler/diagnose.md) carries the migrated shape and its evidence.

**Skills:** `/apply`, `/test-typescript`, `/audit-typescript-code`.

**Revisit condition:** before the next changeset touching this node's terminal output path.

## The production descriptor declares names that exist only for evidence to assert absent

**Class:** source-ownership (test-evidence audit findings `f-001` and `f-002`).

**Evidence:** the test-evidence audit of this node, run 1 at `65e35d2b15b8ca92dd8afdc0ee5f4b95bf67d272`, rejected `src/interfaces/cli/verify.ts` lines 49 to 51: `VERIFICATION_RUN_CLI_SURFACE.forbiddenRunCommandNames` (`journal`, `event`, `append-scope`, `append-finding`) and `VERIFICATION_RUN_CLI_SURFACE.forbiddenRootCommandName` (`verify`) are vocabulary no production code registers or reads, kept in a production module so tests can assert the names are absent. Line 50 of the same range, `forbiddenRunHelpTerms`, has the same shape. The readers are `tests/verification.compliance.l1.test.ts`, `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler/tests/record-run.compliance.l1.test.ts`, and `testing/generators/verify/verify.ts`. These lines are outside the `origin/main..HEAD` diff of that audit. The naming entry above covers a different defect: its subject is the `verify` spelling of the descriptor, not what the descriptor carries.

**Impact:** the production command surface carries a list of commands it does not have. A reader of the descriptor cannot tell registered vocabulary from test vocabulary. The negative evidence also checks only the names on that list, so a journal-mechanics command path the list omits passes unnoticed.

**Settlement condition:** `VERIFICATION_RUN_CLI_SURFACE` carries only vocabulary that the CLI registers or consumes. The forbidden names live with the evidence that asserts their absence, and a test-evidence audit of this node and of `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler` reports no source-ownership finding on the descriptor.

## The NEVER-`spx verify` evidence checks one name, not which root commands reach the run lifecycle

**Class:** coupling and falsifiability (test-evidence audit finding `f-003`).

**Evidence:** the same audit run rejected `tests/verification.compliance.l1.test.ts` line 8. The assertion "NEVER: a top-level verb command such as `spx verify` manages verification runs" is evidenced by checking that the registered root command names do not contain `verify`. The test does not observe which root commands reach the verification-run lifecycle handlers. This line is outside the `origin/main..HEAD` diff of that audit.

**Impact:** a top-level verb under any other name that manages verification runs, such as `spx check`, or a `verify` alias attached to a registered command, leaves the test green while it breaks the assertion. The evidence is coupled to one spelling rather than to the behavior the assertion forbids.

**Settlement condition:** the evidence for this assertion observes the root commands whose actions reach the verification-run lifecycle handlers, and fails when any root command other than `verification` reaches them. A test-evidence audit of this node reports no finding on that assertion.

## The shared verification harness carries test predicates into this node's evidence

**Class:** assertion ownership (test-evidence audit finding `f-004`, WARNING). The shared-harness defect is recorded in `spx/34-verification.enabler/32-verify.enabler/ISSUES.md` under "Shared verification harness owns test predicates and unclassified Git doubles".

**Node-local fact:** the same audit run warned that `testing/harnesses/verify/harness.ts` imports `expect` at line 146. That line is outside the `origin/main..HEAD` diff of the audit. This node's `tests/verification.compliance.l1.test.ts` imports `inspectVerificationRunCommandNames` from that module, so the shared defect reaches evidence outside `spx/34-verification.enabler/32-verify.enabler`. The inventory in that entry counts importers only under `spx/34-verification.enabler/32-verify.enabler`.

**Settlement condition:** the shared entry settles, and this node's tests import from the shared harness only observation and resource APIs that hold no `expect` and no assertion predicate.

## Assertion count above the decomposition trigger

**Evidence:** `verification.md` holds 12 assertions against the decomposition trigger of about 7. Its run-inspection command paths — `status`, `render`, `list`, and `compare` of `spx verification run` — form a concern separable from the family's vocabulary boundary; `PLAN.md` of this node records those command paths as family-level, held in the parent rather than in either child.

**Impact:** one spec carries the vocabulary boundary and every inspection command path's contract, so each added inspection rule grows a node whose concerns already exceed one coherent declaration, and its evidence and status attribute to the family rather than to the inspection concern.

**Settlement condition:** `/decompose` of `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler` places the inspection command paths in an inspection child node.

## Ambiguous run token lacks evidence

**Evidence:** the run-lookup rule of [`spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`](spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md) that covers `compare` includes a `--run` value naming more than one run of the Change (`RUN_AMBIGUOUS`). The test generators build no ambiguous run token, so no lookup case exercises that diagnostic.

**Impact:** the ambiguous branch of the `compare` lookup diagnostic can drop the `--change` value, the `--run` token, or the searched target without any test failing.

**Settlement condition:** a generator builds an ambiguous run token, and a lookup case asserts the diagnostic it produces.

## Descriptor evidence runs through recording handlers in place of the real handlers

**Evidence:** `createRecordingVerifyHandlers` in `testing/harnesses/verify/harness.ts` builds handlers that record their options and return an empty result, and five harness functions pass them to `registerVerifyCommands` in place of the real command handlers, the compare and list handlers among them: `observeRejectedVerificationArgs`, `recordVerificationRunHandlerOptions`, `recordVerifyStartOptions`, `observeVerificationRunComparisonParse`, and `observeVerificationRunStartChange`. Five test files reach them:

- `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/tests/run-compare-arguments.compliance.l1.test.ts`
- `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler/tests/record-run.compliance.l1.test.ts`
- `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler/tests/file-scope.mapping.l1.test.ts`
- `spx/60-surfaces.enabler/21-cli-surface.enabler/21-verification.enabler/21-record-run.enabler/tests/change-identity.scenario.l1.test.ts`
- `spx/34-verification.enabler/32-verify.enabler/21-run-context.enabler/tests/verify-drive-mode.compliance.l1.test.ts`

[`spx/14-cli-composition.adr.md`](spx/14-cli-composition.adr.md) rules: "NEVER: a descriptor is verified by mocking its command handlers, or a handler by mocking its domain functions — each layer is exercised with the real layer beneath it (domain logic in isolation, handlers against temporary fixtures, descriptors through the built executable), so the split removes the need to mock".

**Impact:** the descriptor's argument parsing, rejection, and option mapping are evidenced against handlers that never run, so a descriptor that passes options the real handlers mishandle, or that reaches the wrong handler, leaves these tests green.

**Settlement condition:** the descriptor-argument cases run through the built executable at L2, and `createRecordingVerifyHandlers` and the harness functions built on it are removed.
