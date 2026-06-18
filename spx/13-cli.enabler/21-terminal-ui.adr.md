# Terminal User Interface Runtime

Interactive terminal interfaces in spx render through Ink — a React renderer for the terminal — with the interactive component tree and all raw-mode terminal input and output confined to the CLI-interface layer under `src/interfaces/cli/`, the selection, filter, and key-action model held as pure computation in the domain layer under `src/domains/`, and terminal restoration on exit or signal owned by the Ink application's unmount, wired into the process-lifecycle signal handlers of [`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md) so a signal received mid-render leaves the terminal restored before the parent process exits.

## Rationale

A browse-and-preview interface — a scrollable list, a selected row, a multi-line preview pane, a key map, terminal-width-aware truncation — is persistent layout, not a single prompt. Ink expresses it through component composition and Flexbox layout via Yoga, so the interface is a list component over selection state beside a preview component rather than hand-managed cursor arithmetic and ANSI escapes. A prompt library, whose model is one question in and one answer out, cannot hold persistent layout with a live preview that updates as the selection moves.

The domain-versus-interface split is [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md) applied to rendering: the projection schema, the sort and filter, and the key-action reducer are pure values over injected inputs, so they verify with no terminal attached and a non-terminal renderer (a browser interface) reuses them unchanged. Sharing rendered components between a browser React tree and a terminal React tree leaks DOM and terminal concerns into each other; sharing the model layer does not. The Ink component tree is the CLI-interface layer's process-and-framework concern, the same boundary the descriptor already owns for standard streams.

Terminal restoration is the single concern Ink and the process-lifecycle handlers both touch: Ink places the terminal in raw mode and an alternate screen, while the handlers of [`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md) forward SIGINT and SIGTERM. One owner — Ink's unmount, triggered by the lifecycle handler before the parent exits — resolves the signal-mid-render race so the terminal never stays in raw mode after the process ends. Two independent owners admit a wedged terminal. The React reconciler and Yoga are runtime dependencies the ESM and Node floor of [`spx/12-node-runtime.adr.md`](../12-node-runtime.adr.md) admits, and JSX compiles through the existing esbuild-based build.

## Invariants

- For every interactive terminal interface, the selection, filter, and key-action model is a pure function of injected inputs, evaluable with no terminal attached.
- For every Ink application that enters raw mode, the terminal is restored to its prior mode on unmount, whether unmount is reached by user exit, completion, or a forwarded signal.

## Verification

### Audit

- ALWAYS: interactive terminal interfaces render through Ink, and the component tree together with all raw-mode and alternate-screen terminal I/O lives under `src/interfaces/cli/` per [`spx/14-cli-composition.adr.md`](../14-cli-composition.adr.md) ([audit])
- ALWAYS: the selection, filter, and key-action model is pure computation under `src/domains/`, accepting the candidate set and key events as parameters and returning the next state, with no React, Ink, or terminal import ([audit])
- ALWAYS: the process-lifecycle SIGINT and SIGTERM handlers of [`spx/13-cli.enabler/15-cli-architecture.adr.md`](15-cli-architecture.adr.md) trigger the mounted Ink application's unmount, so terminal restoration completes before the parent process exits ([audit])
- ALWAYS: an Ink application receives its input stream, output stream, and exit callback through injected props or render options, so the component tree verifies through `ink-testing-library` over a string buffer ([audit])
- NEVER: a module under `src/domains/` imports React, Ink, or a terminal API — the model layer stays renderer-agnostic so a non-terminal interface reuses it ([audit])
- NEVER: an interactive Ink interface renders when its output or input stream is not a TTY — a non-interactive context refuses rather than rendering to a non-terminal stream ([audit])
- NEVER: `vi.mock()` or `jest.mock()` stands in for Ink, the terminal, or the input stream — the model verifies as a pure function and the component tree through `ink-testing-library`'s real render ([audit])
