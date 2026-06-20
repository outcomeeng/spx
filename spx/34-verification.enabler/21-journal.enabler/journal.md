# Journal

PROVIDES the `spx journal` command — the verbs `open`, `append`, `read --from <cursor>`, `seal`, and `render` over the agent-run-journal contract of `spx/15-agent-run-journal.enabler`, binding the backend at the edge from the environment and folding a run's terminal projection from its event history
SO THAT the agentic verification skills an agent runs
CAN open a changeset-scoped run, append one event per significant step, read the event history from a cursor, seal the run at terminal completion, and render a projection — persisting and streaming to a local file-and-standard-output backend by default or a GitHub pull-request backend under continuous integration — without naming the backend or carrying a verification-type vocabulary

## Assertions

### Scenarios

- Given a run scope whose branch and product root resolve from the git environment and whose backend binds local, when the `spx journal` commands `open`, `append`, `read --from <cursor>`, `seal`, and `render` run in sequence, then `open` reports a run token, `append` persists and streams each event, `read` returns the events at or after the cursor, `seal` closes the run, and `render` projects the event prefix ([test](tests/journal-cli.scenario.l1.test.ts), [test](tests/journal-cli-registry.scenario.l1.test.ts))

### Mappings

- Environment maps to backend: an unset `SPX_VERIFY_BACKEND` outside continuous integration, or `SPX_VERIFY_BACKEND=local`, selects the local file-and-standard-output backend; a continuous-integration GitHub pull-request environment, or `SPX_VERIFY_BACKEND=github-pr`, selects the GitHub pull-request backend; an unrecognized value is rejected naming the value and the registered backends ([test](tests/backend-selection.mapping.l1.test.ts))
- Each verb maps to its agent-run-journal contract operation — `open` to a new sealed-on-terminal stream, `append` to a sequenced event, `read --from <cursor>` to the events at or after the cursor, `seal` to a terminal seal, `render` to a projection of the event prefix ([test](tests/journal-verbs.mapping.l1.test.ts))

### Properties

- A run's local persistence path is `.spx/branch/<branch-slug>/<type>/runs/run-<run-token>.jsonl` at the Git common-dir product root, with `<branch-slug>` from the state-store slug of `SPX_VERIFY_BRANCH` or the current branch and `<type>` the caller-supplied opaque scope segment ([test](tests/run-scope.property.l1.test.ts))
- The rendered projection is a pure function of a run's event prefix — the same events always render the same projection across backends and repeated calls ([test](tests/projection.property.l1.test.ts))

### Compliance

- ALWAYS: `append` both persists the event to the bound backend and emits it to the run's streaming surface — standard output under the local backend, the pull-request comment under the GitHub pull-request backend — so the run is observable as it advances ([test](tests/streaming.scenario.l1.test.ts), [test](tests/github-pr-sink.scenario.l1.test.ts))
- ALWAYS: the terminal projection folds from the run's event history — branch and target scope, participant identifiers, base and head identifiers, config digest, timestamps, output paths, and a terminal status of `approved`, `rejected`, `failed`, or `interrupted` — never from a bespoke end-of-run record ([test](tests/run-state.compliance.l1.test.ts))
- ALWAYS: a run is terminal evidence only when its journal is sealed and holds a terminal-completion event; an unsealed run folds to incomplete ([test](tests/run-state.compliance.l1.test.ts))
- NEVER: the journal command references a verification-type name (`audit`, `review`) — the run is scoped by the opaque `<type>` segment alone ([audit])
- NEVER: a verb argument or flag selects the backend — backend binding is resolved once from the environment ([audit])
