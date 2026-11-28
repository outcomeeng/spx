# Node Status

PROVIDES per-node persistence of each spec-tree node's verification results — an `spx.status.json` claim in the shape of the methodology version the product declares, a reader, a writer, the pin currency of each result, and the classification that resolves a node to `declared`, `specified`, `failing`, or `passing` — written only by `spx spec status --update`
SO THAT `spx spec status` and other spec-tree status consumers
CAN read a node's last-recorded verification projection, each result's verdict, pin, actor and run, and whether its pin is current, from a committed file without re-running verification

## Assertions

### Scenarios

- Given a node directory has no `spx.status.json`, when a consumer reads that node's lifecycle state, then the consumer derives the state live rather than reading a file ([test](tests/node-status.scenario.l1.test.ts))
- Given a node with linked verification references, when `spx spec status --update` folds recorded evidence for that node, then it records a result for each linked reference, each audit rule slug and each evidence kind the node's malleability requires before deriving the lifecycle projection ([test](tests/node-status.scenario.l1.test.ts))
- Given a tree holding a version-1 claim and a 4.0 claim, when node status is read, then both are read and each is reported with its shape ([test](tests/node-status.scenario.l1.test.ts))
- Given a pinned Test result and a change to one path in its read set, when node status is read, then the result reports as not current and every result whose pin does not read the path stays current ([test](tests/node-status.scenario.l1.test.ts))
- Given a pinned result whose commit Git cannot compare with the checkout, when node status is read, then the result reports as not current and the node does not derive `passing` ([test](tests/node-status.scenario.l1.test.ts))
- Given a pinned Audit result and a link-format edit to the node's spec, when node status is read, then the Audit result stays current and every Test result whose pin reads the spec reports not current ([test](tests/node-status.scenario.l1.test.ts))
- Given a node whose claim recorded `passing` and whose committed claim now carries no Test, Eval or Probe result while a current passed Audit result remains, when node status is read, then the node derives `failing`, the state `spx spec status --update` records for the same claim ([test](tests/node-status.scenario.l1.test.ts))
- Given a parent whose variants' claims carry its entries, when node status is read, then the parent is `passing` only when every variant's copies pass, and its own claim carries no results ([test](tests/node-status.scenario.l1.test.ts))

### Test.Mapping: [lockfile-pin](tests/lockfile-pin.mapping.l1.test.ts)

For a language whose dependencies a lockfile resolves, `spx spec status --update` writes the pin of an Agentic result without any lockfile and the pin of a Deterministic or Attested result with every lockfile its run read, so a commit that changes only a lockfile the run read leaves current every Agentic entry whose other read paths it leaves unchanged.

| Case           | Entry                                         | Lockfiles in the pin        | After a commit that changes only a lockfile the run read |
| -------------- | --------------------------------------------- | --------------------------- | -------------------------------------------------------- |
| test-entry     | a `test` entry from a sealed test run journal | every lockfile its run read | not current                                              |
| eval-entry     | an `eval` entry from a sealed eval run        | every lockfile its run read | not current                                              |
| probe-entry    | a `probe` entry from an attested run          | every lockfile its run read | not current                                              |
| audit-entry    | an `audit` entry from a sealed audit run      | none                        | current                                                  |
| evidence-entry | an `evidence` entry from a sealed audit run   | none                        | current                                                  |

### Test.Mapping: [assertion-audit-fold](tests/assertion-audit-fold.mapping.l1.test.ts)

`spx spec status --update` folds each `assertion:<slug>:<spec>` unit of a sealed audit run into its own `audit` entry under the unit's slug, by what the run records for that unit, whatever the run's terminal status.

| Case                    | What the run records for the unit                      | Entry under the unit's slug                                                                       |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| approved-run            | no blocking finding, judged paths, run sealed approved | `passed`, with the run's actor and run, pinned to the run's commit, the spec and the judged paths |
| rejected-run-clean-unit | no blocking finding, judged paths, run sealed rejected | `passed`, with the run's actor and run, pinned to the run's commit, the spec and the judged paths |
| finding-on-unit         | a blocking finding on the unit, judged paths           | `failed`, with the run's actor and run, pinned to the run's commit, the spec and the judged paths |
| no-judged-paths         | no judged paths                                        | `not-run`, with no pin                                                                            |
| newer-run-same-slug     | a newer sealed run, its pin current, has the slug      | the newer run's unit folds, and the older run's unit folds nowhere                                |
| stale-pin               | judged paths that changed since the run's commit       | no entry from that run                                                                            |

### Test.Scenario: one rejected run over two rows

- [rejected-run-folds-per-row](tests/assertion-audit-fold.scenario.l1.test.ts):
  - Given the node `spx/20-drafts.enabler` with the Audit rows `no-implicit-removal` and `real-storage-in-tests`, and the audit run `2026-01-02_03-04-05-006-0123456789ab` sealed rejected at commit `1111111111111111111111111111111111111111`, with one blocking finding on unit `assertion:real-storage-in-tests:spx/20-drafts.enabler/drafts.md`, none on unit `assertion:no-implicit-removal:spx/20-drafts.enabler/drafts.md`, and the judged path `src/lib/drafts.ts` on each unit
  - When `spx spec status --update` folds recorded evidence for the node
  - Then the node's 4.0 claim holds exactly two `audit` entries: `no-implicit-removal` reads `passed` and `real-storage-in-tests` reads `failed`, each with the run's actor and run token, and each pinned to commit `1111111111111111111111111111111111111111`, `spx/20-drafts.enabler/drafts.md` and `src/lib/drafts.ts`

### Mappings

- Classification of a 4.0 claim resolves `passing` when every required result is current and passed, otherwise `failing` when the claim's Git history records `passing` at or after the latest change to the node's spec or a governing decision record, otherwise `declared` when a required artifact is missing, and `specified` otherwise; classification of a version-1 claim resolves each node to one lifecycle state in precedence order: a node with no linked verification references resolves to `declared`; otherwise a node listed in `spx/EXCLUDE` resolves to `specified`; otherwise a node whose committed verification outcomes all pass resolves to `passing`; otherwise the node resolves to `failing` ([test](tests/node-status.mapping.l1.test.ts))
- Verification results map to lifecycle input in the claim shape they are read from: in the version-1 shape every referenced evidence outcome `passed` maps `overall` to `passed`, any `failed` maps `overall` to `failed`, mixed `passed` and `not-run` outcomes map `overall` to `partial`, and all `not-run` outcomes map `overall` to `not-run`; in the 4.0 shape each entry's `verdict` is the lifecycle input and no `overall` rollup exists ([test](tests/node-status.mapping.l1.test.ts))
- The tracked-path query maps a successful `git ls-files -z` listing run in the product directory to the set of tracked paths, and maps a non-zero exit or an unavailable git runner to no tracked set ([test](tests/tracked-paths.mapping.l1.test.ts))

### Properties

- Every `spx.status.json` the writer produces parses as the claim of the methodology version the product declares: a 4.0 claim carries `state`, `malleability`, and `verification` results grouped by type, each entry carrying a `verdict` of `passed`, `failed`, or `not-run`, a passed or failed entry carrying a pin of `commit` and `read` paths that include the node's spec, and no `overall` rollup; a version-1 claim carries `schemaVersion: 1` and a `verification` object whose mechanism keys are `test`, `eval`, or `audit`, whose `overall` values are `passed`, `failed`, `partial`, or `not-run`, and whose evidence-reference values are `passed`, `failed`, or `not-run` ([test](tests/node-status.property.l1.test.ts))
- The tracked-path predicate admits a path exactly when the path is a git-tracked file or an ancestor directory of one, and admits every path when no tracked set is available ([test](tests/tracked-path-inclusion.property.l1.test.ts))

### Compliance

- ALWAYS: `spx spec status --update` writes an `spx.status.json` file in each tracked output-node directory and none for a `.product`, recording the claim of the methodology version the product declares for that node's results ([test](tests/node-status.compliance.l1.test.ts))
- NEVER: a status read path — `spx spec status` without `--update`, the node-status evidence provider read through `readSpecTree`, the node-status EXCLUDE membership reader, or the status reader — writes `spx.status.json` ([test](tests/node-status.compliance.l1.test.ts))
- ALWAYS: each `spx.status.json` is co-located in the directory of the node it describes; node identity comes from file location, not file content ([audit])
- ALWAYS: `spx.status.json` stores only results that Git cannot answer; node identity, assertion text, evidence links, test source, eval definitions, audit rules, configuration, authorship, and time come from Git, which also compares a pinned commit with the tree over the read paths ([audit])
- ALWAYS: `spx spec status --update` derives pass/fail/not-run outcomes for linked verification references, audit rule slugs and required evidence kinds only from recorded evidence the owning verification surface produced, and classifies every node without executing verification ([test](tests/node-status.compliance.l1.test.ts))
- NEVER: `spx spec status --update` writes `spx.status.json` into a node directory whose file already equals, byte for byte, the projection it would write, so an update over a checkout whose every committed claim equals its projection writes no `spx.status.json` ([test](tests/node-status.compliance.l1.test.ts))
- ALWAYS: `spx spec status --update` over a checkout whose committed `spx.status.json` differs from the projection of the recorded evidence rewrites that file to the projection, so the update leaves `spx/` changed ([test](tests/node-status.compliance.l1.test.ts))
- ALWAYS: CI runs Validate, then, once it passes, the configured verification suite, and then `spx spec status --update --check` on every pull-request head targeting the default branch and every push to the default branch whose changed paths do not all lie in the instruction-document paths `CLAUDE.md`, `AGENTS.md`, `README.md`, `LICENSE`, and `docs/**`, and fails when a node's regenerated state or an entry's regenerated verdict or read set differs from the committed claim, never when only a pin commit differs ([audit])
- ALWAYS: the committed-status comparison reports a difference exactly when a node's state or an entry's verdict or read set differs between the committed and the regenerated claim, and reports none when only pin commits differ ([test](tests/claim-comparison.compliance.l1.test.ts))
- NEVER: a consumer treats a missing `spx.status.json` as an error or a fixed state — absence routes to live derivation ([test](tests/node-status.compliance.l1.test.ts))
- NEVER: `spx spec status --update` writes `spx.status.json` into a node-shaped directory with no git-tracked file under it; such a directory is excluded from the update node set and any stale `spx.status.json` already there is removed ([test](tests/node-status.compliance.l1.test.ts))
- ALWAYS: the git-tracked boundary is the node directory — `spx spec status --update` records a git-tracked node directory's evidence in full, including an evidence file under it that is not yet individually tracked ([test](tests/node-status.compliance.l1.test.ts))
- NEVER: `spx.status.json` is hand-authored or offered as `spx.status.yaml`/`spx.status.toml` — it is a machine-written JSON artifact ([audit])
- NEVER: the status path composes a language-specific test runner — outcomes arrive through the injected resolver over recorded verification evidence ([audit])

### Test.Mapping: audit-entry-key

`spx spec status --update` writes one `audit` entry in a node's 4.0 claim for each keyed audit reference the spec-tree library reads from the node's spec, whichever file form the spec takes, under that reference's key, and none for any other row; the declaration is 4.0 migrating from 3.2.

| Case                | Row of the node's spec                                                                            | Group heading                  | `audit` entry            |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------ |
| audit-row           | `- recovery-message: ALWAYS: the message names the line.`                                         | `### Audit: messages`          | keyed `recovery-message` |
| linked-audit-tag    | `- ALWAYS: the message names the line`, closed by an `audit` link to `audits/recovery-message.md` | `### Compliance`               | keyed `recovery-message` |
| slugged-audit-tag   | `- ALWAYS: the message names the line`, closed by an audit tag of rule slug `recovery-message`    | `### Compliance`               | keyed `recovery-message` |
| test-row            | `- line-verbatim: NEVER: a task drops a character.`                                               | `### Test.Compliance: capture` | none                     |
| unslugged-audit-row | `- ALWAYS: the message names the line.`                                                           | `### Audit`                    | none                     |
| pathless-tag        | `- ALWAYS: the message names the line`, closed by an audit tag with no rule slug                  | `### Compliance`               | none                     |

### Test.Mapping: migration-source-state

Under a declaration of 4.0 migrating from 3.2, `spx spec status --update` and `spx spec status` classify a source-grammar node whose one Assertion carries the audit-tag form of the row, whose linked test passes, and whose resolvers answer every test, audit slug, and evidence kind it requires as passed, by its declared Malleability, to the State the 4.0 rule gives it.

| Case            | Audit-tag form                                  | `spec`    | `verification` | `implementation` | none declared |
| --------------- | ----------------------------------------------- | --------- | -------------- | ---------------- | ------------- |
| no-tag          | none                                            | `passing` | `passing`      | `passing`        | `passing`     |
| linked-tag      | an `audit` link to `audits/recovery-message.md` | `passing` | `passing`      | `passing`        | `passing`     |
| pathless-review | a review tag with no link                       | `passing` | `specified`    | `specified`      | `specified`   |
| pathless-audit  | an audit tag with no rule slug                  | `passing` | `specified`    | `specified`      | `specified`   |

### Test.Compliance: tags without the source grammar

- tags-unread-without-source: ALWAYS: under a declaration on the 4.0 line with no `methodology.migratingFrom`, an audit or review tag of a node's spec, linked, slugged, or pathless, keys no `audit` entry, and the node derives the State it derives with no such tag, through `spx spec status --update` and `spx spec status` alike

### Test.Scenario: audit slugs

- tag-outside-assertion:
  - Given a node at `implementation` under a declaration of 4.0 migrating from 3.2, whose spec's Assertions section holds one row closed by an audit tag of rule slug `recovery-message` and one row that quotes an audit tag of rule slug `quoted-rule` in a code span, and whose spec holds an audit tag of rule slug `stray-rule` in a paragraph after that section
  - When `spx spec status --update` folds the node's claim
  - Then the claim's `audit` section holds exactly one entry, keyed `recovery-message`
- source-node-without-evidence-audit:
  - Given a product migrating from 3.2 and a source-grammar node that declares no Malleability, whose linked tests pass and whose claim carries no `evidence` entry
  - When `spx spec status` reads the node
  - Then the node does not derive `passing`

### Audit: audit slugs

- audit-slugs-from-the-reader: ALWAYS: the audit slugs `spx spec status --update` folds for a node come from the keyed audit references the spec-tree library reads from the node's spec; no node-status module matches an audit tag or an Audit row in spec text
