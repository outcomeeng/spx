# Journal

PROVIDES the `spx journal` command — the verbs `open`, `append`, `read --from <cursor>`, `seal`, and `render` over the agent-run-journal contract of `spx/15-agent-run-journal.enabler`, binding the backend at the edge from the environment and folding a run's terminal projection from its event history
SO THAT the agentic verification skills an agent runs
CAN open a changeset-scoped run, append one event per significant step, read the event history from a cursor, seal the run at terminal completion, and render a projection — persisting and streaming to a local file-and-standard-output backend by default or a GitHub pull-request backend under continuous integration — without naming the backend or carrying a verification-type vocabulary

## Assertions

### Scenarios

- Given a run scope whose branch and product root resolve from the git environment and whose backend binds local, when the `spx journal` commands `open`, `append`, `read --from <cursor>`, `seal`, and `render` run in sequence, then `open` reports a run token, `append` persists and streams each event, `read` returns the events at or after the cursor, `seal` closes the run, and `render` projects the event prefix ([test](tests/journal-cli.scenario.l1.test.ts))
- Given the journal domain in the CLI registry, when it registers with the program, then the `journal` command exposes exactly the `open`, `append`, `read`, `seal`, and `render` verbs ([test](tests/journal-cli-registry.scenario.l1.test.ts))
- Given a run scope whose backend binds github-pr and whose pull-request number resolves from the git environment, when the `spx journal` `open` and `append` commands run in sequence, then `append` streams the appended event to the run's pull-request comment identified by the run's marker ([test](tests/github-cli.scenario.l1.test.ts))
- Given the github-pr pull-request comment client and a run's projection, when the projection is upserted, then the client edits in place the one comment carrying the run's marker or creates it when absent, and rejects the Actions artifact and cache surfaces it does not serve ([test](tests/github-client.scenario.l1.test.ts))

### Mappings

- Environment maps to backend: an unset `SPX_VERIFY_BACKEND` outside continuous integration, or `SPX_VERIFY_BACKEND=local`, selects the local file-and-standard-output backend; a continuous-integration GitHub pull-request environment, or `SPX_VERIFY_BACKEND=github-pr`, selects the GitHub pull-request backend; an unrecognized value is rejected naming the value and the registered backends ([test](tests/backend-selection.mapping.l1.test.ts))
- Each verb maps to its agent-run-journal contract operation — `open` to a new sealed-on-terminal stream, `append` to a sequenced event, `read --from <cursor>` to the events at or after the cursor, `seal` to a terminal seal, `render` to a projection of the event prefix ([test](tests/journal-verbs.mapping.l1.test.ts))
- GitHub event name maps to pull-request context: the `pull_request` event marks the run as a continuous-integration pull request whose number resolves from `GITHUB_REF`, and any other event name — including `pull_request_target`, whose `GITHUB_REF` is the base branch ref — does not ([test](tests/journal-environment.mapping.l1.test.ts))
- The CLI reads the process environment into the journal environment snapshot: a truthy `CI` value (`1` or `true`, case-insensitive) marks continuous integration and any other value does not, `SPX_VERIFY_BACKEND` sets the backend override, and `SPX_VERIFY_BRANCH` sets the branch override ([test](tests/journal-environment.mapping.l1.test.ts))

### Properties

- A run's local persistence path is `.spx/branch/<branch-slug>/<type>/runs/run-<run-token>.jsonl` at the Git common-dir product root, with `<branch-slug>` from the state-store slug of `SPX_VERIFY_BRANCH` or the current branch and `<type>` the caller-supplied opaque scope segment ([test](tests/run-scope.property.l1.test.ts))
- The rendered projection is a pure function of a run's event prefix — the same events always render the same projection across backends and repeated calls ([test](tests/projection.property.l1.test.ts))

### Compliance

- ALWAYS: `append` both persists the event to the bound backend and emits it to the run's streaming surface — standard output under the local backend, the pull-request comment under the GitHub pull-request backend — so the run is observable as it advances ([test](tests/streaming.scenario.l1.test.ts), [test](tests/github-pr-sink.scenario.l1.test.ts), [test](tests/github-cli.scenario.l1.test.ts))
- ALWAYS: streaming is best-effort once the event is durably appended — a streaming-emit failure does not fail the append, so a retry cannot duplicate a committed event ([test](tests/streaming.scenario.l1.test.ts))
- ALWAYS: a successful `append` returns an empty result — its event reaches the run's streaming surface (standard output under the local backend, the pull-request comment under the github-pr backend), so `append` writes no separate result of its own ([test](tests/journal-cli.scenario.l1.test.ts), [test](tests/github-cli.scenario.l1.test.ts))
- ALWAYS: `append`, `read`, `seal`, and `render` reject a run token that `open` did not create rather than operating on a phantom empty run, so a mistyped or unopened token is distinguishable from a real empty run ([test](tests/streaming.scenario.l1.test.ts))
- ALWAYS: `append`, `read`, `seal`, and `render` reject a run whose run-file path resolves to a symbolic link rather than following it, so a symbolic link planted at the run path cannot redirect a run's reads or writes to another file ([test](tests/streaming.scenario.l1.test.ts))
- ALWAYS: the journal verbs resolve a run outside a git repository — including where git is unavailable — using a fallback branch identity rather than failing, so the channel still records the run ([test](tests/journal-cli.scenario.l1.test.ts))
- ALWAYS: when the github-pr backend cannot resolve a non-empty `GITHUB_REPOSITORY`, `append` rejects before constructing the streaming sink rather than succeeding while silently writing no pull-request comment ([test](tests/github-cli.scenario.l1.test.ts))
- ALWAYS: the terminal projection folds from the run's event history — branch and target scope, participant identifiers, base and head identifiers, config digest, timestamps, output paths, and a terminal status of `approved`, `rejected`, `failed`, or `interrupted` — never from a bespoke end-of-run record ([test](tests/run-state.compliance.l1.test.ts))
- ALWAYS: a run is terminal evidence only when its journal is sealed and holds a terminal-completion event; an unsealed run folds to incomplete ([test](tests/run-state.compliance.l1.test.ts))
- ALWAYS: `append` rejects an event input missing a required CloudEvents input field, and `read` rejects a cursor that is not a whole non-negative integer, before touching the run — a malformed request reports an error rather than a success whose event never reads back ([test](tests/journal-cli.scenario.l1.test.ts))
- NEVER: the journal command references a verification-type name (`audit`, `review`) — the run is scoped by the opaque `<type>` segment alone ([audit])
- NEVER: a verb argument or flag selects the backend — backend binding is resolved once from the environment ([audit])
