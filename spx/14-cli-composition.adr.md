# CLI Composition

Each command domain is composed from three layers in one dependency direction — pure computation in `src/domains/{domain}/`, process-agnostic command handlers in `src/commands/{domain}/`, and a Commander registration descriptor in `src/interfaces/cli/{domain}.ts` — and the composition root registers domains by iterating a static descriptor registry whose every descriptor is reached through an explicit import statement.

## Rationale

The three layers have different coupling and testability profiles. Pure domain modules accept all external state as parameters and verify without the filesystem or process. Command handlers compose pure functions with filesystem I/O and return results — carrying no Commander binding and no process exit, they verify against temporary fixtures and remain usable outside the CLI. The descriptor owns the Commander wiring and the process boundary — exit codes, standard streams, standard input — which only the built executable can exercise. The dependency direction `interfaces/cli → commands → domains` never reverses: a reverse edge would drag the process or framework boundary into a layer meant to be free of it, forcing that layer's isolated test to stand up the very infrastructure the split removes.

The CLI-interface layer is the descriptor's home because the descriptor's whole responsibility is the CLI-framework and process concern — the same boundary that owns input sanitization and the invocation contract; this refines `spx/13-cli.enabler/15-cli-architecture.adr.md`, which establishes `src/interfaces/cli/` as the home for CLI-specific modules. The static descriptor registry mirrors `spx/19-language-registration.adr.md`: a domain joins the CLI by adding its descriptor and one explicit import, and the enumeration is exhaustive at compile time, so a descriptor absent from the registry is absent from the build rather than a silent runtime gap. A runtime mutable registry populated by imperative registration calls would make registration order- and side-effect-dependent and not statically verifiable; a composition root that named each domain directly would force every new domain to edit its control flow.

## Invariants

- The set of domains the composition root registers equals the set the static descriptor registry enumerates.
- For every command domain, no module under `src/domains/{domain}/` references a Commander symbol, a `src/commands/` handler, or a process API; no module under `src/commands/{domain}/` references a Commander symbol or a process-exit/standard-stream API.

## Verification

### Audit

- ALWAYS: each command domain's pure computation lives under `src/domains/{domain}/` and accepts all external state as parameters, with no filesystem or process access, so domain logic verifies in isolation ([audit])
- ALWAYS: each command domain's I/O orchestration lives under `src/commands/{domain}/` as handlers that perform filesystem operations and return results, with no Commander binding and no process exit, so handlers verify against temporary fixtures and compose outside the CLI ([audit])
- ALWAYS: each command domain's Commander registration descriptor lives at `src/interfaces/cli/{domain}.ts` and is the sole site of Commander wiring and process I/O — exit codes, standard output, standard error, and standard input — for that domain ([audit])
- ALWAYS: the CLI-interface layer exposes a static descriptor registry that imports every domain descriptor through an explicit import statement, and the composition root registers domains by iterating that registry ([audit])
- ALWAYS: command handlers import pure functions from `src/domains/{domain}/`, and descriptors import handlers from `src/commands/{domain}/`, so the dependency flows `interfaces/cli → commands → domains` ([audit])
- NEVER: a module under `src/domains/{domain}/` imports from `src/commands/{domain}/` or `src/interfaces/cli/`, or accesses the filesystem or process — this reverses the dependency direction and couples pure computation to I/O ([audit])
- NEVER: a module under `src/commands/{domain}/` imports Commander or writes to the process boundary (`process.exit`, `process.stdout`, `process.stderr`, `process.stdin`) — the process and framework boundary belongs to the descriptor ([audit])
- NEVER: the composition root names individual domains in its registration control flow — domains are registered by iterating the registry ([audit])
- NEVER: a runtime mutable registry populated by imperative registration calls stands in for the static descriptor registry — registration is explicit and enumerable at compile time ([audit])
- NEVER: a descriptor is verified by mocking its command handlers, or a handler by mocking its domain functions — each layer is exercised with the real layer beneath it ([audit])
