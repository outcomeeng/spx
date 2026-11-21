# Agent Search Adapters

CONSTRAINS how SPX searches agent-native sessions
TO one static, typed search adapter per agent module the agent registry module of [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md) lists, mapping its agent to its native store collector, its transcript metadata reader and the evidence forms its transcript contract declares, with selector candidacy from a `TranscriptLocator` port whose production adapter is ripgrep through the runner library under `src/lib/ripgrep/`, which the search command layer wires and injects
SO THAT search answers which session touched a branch or recorded a literal at the native locator's I/O cost, and reads no transcript past its metadata head that the locator did not name

### Test.Mapping: adapter-declarations

Each search adapter takes its declarations from its agent module, and an evidence form applies to an agent's transcripts only where its module declares that form.

| Case            | Declaration                                                                             | Source                                     |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------ |
| store-collector | the native store collector                                                              | the agent module                           |
| metadata-reader | the transcript metadata reader                                                          | the agent module                           |
| evidence-forms  | record reader, transcript-borne branch evidence, command evidence, subagent attribution | the agent module, each only where declared |

### Test.Mapping: locator-exit-status

The locator interprets a ripgrep run from its exit status.

| Case        | Ripgrep outcome                  | Locator result                                   |
| ----------- | -------------------------------- | ------------------------------------------------ |
| matches     | matches found                    | the printed paths                                |
| no-match    | no match                         | the empty set                                    |
| error       | an error                         | a locator failure carrying the diagnostic output |
| unstartable | the executable cannot be started | the unavailable diagnostic                       |

### Test.Mapping: locator-unavailable

When the ripgrep executable cannot be started, each selector kind behaves as its row states.

| Case              | Selector                                                     | Result                                                         |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| locator-dependent | a content literal, a pickup marker, a session id or a branch | fails with a diagnostic naming ripgrep and reads no transcript |
| selector-free     | none                                                         | returns its results                                            |

### Test.Property: search results

- record-branch-match: ALWAYS: a session whose agent module declares a record reader, and whose transcript records the requested branch in any record, matches a branch search and reports the working directory recorded alongside that branch, whichever field path that record carries it under.
- reach-window-independence: ALWAYS: the reach window search applies to its default candidate set bounds transcript file modification time and is independent of the window a resume consumer applies, so changing one leaves the other's candidate set unchanged.
- session-id-any-adapter: ALWAYS: a session-id selector returns the session whose opening metadata carries that id, whichever agent adapter holds it, whichever recorded working directories its transcript carries, and whichever product the invocation addresses.
- session-id-working-directory: ALWAYS: a session-id result reports a recorded working directory inside the invocation product when the transcript records one, and the opening working directory otherwise.
- session-id-never-path: NEVER: a session id reaches the store as a path component; the store receives it only as the locator's needle, whatever characters it carries.
- needle-validation: NEVER: a selector needle that is empty or carries a line terminator reaches the locator or the store; the invocation fails with a diagnostic before any store read.
- nul-path-parsing: ALWAYS: the NUL-separated path list ripgrep prints parses to exactly the paths it printed, for every path set, paths carrying line terminators included.

### Test.Compliance: candidacy

- directory-name-not-scope: ALWAYS: a session-store directory name whose encoded working directory lies outside the invocation product scope still yields its transcripts as candidates when the selector's evidence is transcript-borne.
- locator-named-reads: NEVER: a locator-dependent selector reads a transcript past its metadata head that the locator did not name for that invocation, in candidate scanning or in branch-evidence collection.
- selector-free-head-only: NEVER: a selector-free search reads any transcript past its metadata head.
- branch-locator-stores: NEVER: a branch selector runs the locator over a store whose agent module declares no transcript-borne branch evidence.
- no-directory-listing: NEVER: a content or session-id selector without a branch selector lists a session-store project directory; its candidates come from the locator's result sets and the store root alone.
- null-branch-worktree-root: ALWAYS: a session of an agent whose module declares no transcript-borne branch evidence matches a branch search only when its recorded working directory is inside a same-product worktree root associated with that branch.
- no-incidental-branch: NEVER: branch existence alone, or incidental transcript content, associates with a branch a session of an agent whose module declares no transcript-borne branch evidence.
- declared-evidence-only: ALWAYS: transcript command evidence and subagent attribution apply only to the transcripts of an agent whose module declares those evidence forms.

### Test.Scenario: production locator

- production-locator:
  - Given a temporary store holding one transcript whose text carries the needle and one whose text does not
  - When the production ripgrep locator runs over that store
  - Then it names exactly the first transcript

### Audit: candidacy invariants

- content-needle-intersection: ALWAYS: for a content selector, every result row's transcript lies in the locator's result set for every content needle.
- worktree-root-head-only: ALWAYS: worktree-root association reads opening metadata only.
- collector-superset: ALWAYS: the candidate set a store collector yields is a superset of the set any selector matches; no collector decision removes a session whose transcript contents the selector would match.
- record-sequence-contribution: ALWAYS: where an agent module declares a record reader, a transcript's contribution to product scope and branch association is a function of its whole recorded value sequence, independent of any single record's position in it; where it declares none, the contribution is the opening value alone.
- head-identity: ALWAYS: head-metadata identity decides which located transcript is the session a session id names.

### Audit: search boundaries

- static-adapter-set: ALWAYS: the search adapters and adapter selection are static, typed and exhaustive, enumerated by the agent registry module.
- locator-invocation: ALWAYS: the locator invocation names files only, treats the needle as a fixed string, treats every file as text, searches hidden and ignored paths, ignores user ripgrep configuration, suppresses messages, NUL-terminates paths, restricts the search to transcript files, and passes the needle as a pattern option and the roots after an end-of-options marker.
- pure-locator-logic: ALWAYS: the locator's argument composition, output parsing and exit-status interpretation are pure functions in the search domain; the ripgrep executable starts only inside the ripgrep runner library under `src/lib/ripgrep/`, which owns the process outcome mapping behind an injected process dependency, and the search command layer wires that runner into the locator per [spx/14-cli-composition.adr.md](spx/14-cli-composition.adr.md).
- injected-boundaries: ALWAYS: session-store filesystem operations, the transcript locator and worktree association dependencies cross typed dependency-injection boundaries.
- scope-not-identity: NEVER: a product-scope check decides whether a session-id selector yields a result; scope reaches only which recorded working directory the located session reports.
- no-layout-filter: NEVER: a store-collector filter derived from a directory name, a path encoding or any other store-layout signal decides whether a session matches a selector.
- no-in-process-scan: NEVER: an in-process scan of transcript bytes or text decides selector candidacy.
- no-module-mocks: NEVER: tests replace session-store, locator, or worktree-association boundaries through module mocking.
