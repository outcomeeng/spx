# Open Issues

## Admitting the retired selector costs product-wide literal coverage

[`tests/output-mode.compliance.l2.test.ts`](tests/output-mode.compliance.l2.test.ts) must spell `--format`, because the rule it proves is that this exact token is rejected. The literal stage reads that spelling as reuse of a source-owned value, since `src/interfaces/cli/worktree.ts` declares `WORKTREE_CLI.FORMAT_FLAG` and `src/interfaces/cli/spec.ts` declares `SPEC_CLI.FORMAT_OPTION_FLAG` with the same text. Admitting it required adding `--format` to `validation.literal.values.include` in `spx.config.yaml`, and that list is product-wide: it has no path scope.

**Evidence:** the changeset review of this node's output-mode branch, review run `2026-09-23_01-42-19-767-a6726e9f13ec`, finding `f-002`; the allowlist entry in `spx.config.yaml`; the two source declarations above; the value-allowlist shape in `src/validation/literal/config.ts`, which carries `presets`, `include`, and `exclude` and no path dimension.

**Impact:** a worktree-CLI or spec-CLI test that spells `--format` instead of importing its owning constant is no longer reported, so those two nodes lost the cross-file evidence that kept them importing. The product config carries no `validation.paths` section, so scoping the stage to exclude the one file would introduce a whole-file blind spot in place of a token-wide one rather than removing the suppression.

**Settlement condition:** a value-allowlist entry carries the paths it admits, this entry names only the diagnose compliance test, and a `--format` spelling anywhere else is reported again.

## The `/diagnose` skill still invokes the retired output selector

[`11-invocation-modes.pdr.md`](11-invocation-modes.pdr.md) declares that `--format` is not accepted and that the invocation is rejected naming the selector. The spec-tree plugin's `/diagnose` skill invokes `spx diagnose --manifest "${CLAUDE_SKILL_DIR}/manifest.json" --format json` at two sites in its `SKILL.md`, and [`spx/local/merging.md`](../local/merging.md) routes the Deploy step's `worktree-pool` verdict and `mainCheckoutPath` read through that skill. Against a build carrying the retirement, Commander rejects the invocation, the skill emits no report, and the Deploy step cannot read the verdict it requires.

**Evidence:** the changeset review of this node's output-mode branch, review run `2026-09-23_00-59-49-639-5868dd322936`, finding `f-001`, severity REJECT; the two invocations at lines 22 and 62 of the installed plugin's `skills/diagnose/SKILL.md`; the consuming Deploy step in `spx/local/merging.md`.

**Impact:** the shared local executable is refreshed after every merge through that Deploy step, so the retirement reaches the executable before its named consumer moves to `--json`. Every consumer inside this repository was carried across in the same changeset; this one lives in another product and cannot be edited from this workflow.

**Settlement condition:** the plugins product's `/diagnose` skill invokes `spx diagnose --manifest <path> --json`, and the Deploy step reads its verdict from that invocation.

## Three co-located test files carry no assertion link

`tests/config.mapping.l1.test.ts`, `tests/resolve.mapping.l1.test.ts`, and `tests/worktree-status-probe.compliance.l1.test.ts` hold typed assertion evidence that no assertion in [`diagnose.md`](diagnose.md) claims. They appear only in this node's `spx.status.json`.

**Evidence:** test-evidence audit of `spx/54-diagnose.enabler`, finding `f-006`, severity INFO, property `evidence-chain-completeness`, rule `unlinked-evidence`.

**Impact:** the node's assertion-to-test mapping is not total over its `tests/` directory. Each file proves something about diagnose behavior that the spec does not declare, so the declarations those three files verify are invisible to a reader of the spec and to any audit that walks assertions.

**Settlement condition:** each of the three files is reached by a `[test]` link from an assertion in `diagnose.md` that states the behavior it proves, or the file is removed because its behavior is already declared and evidenced elsewhere.
