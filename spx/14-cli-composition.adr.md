# CLI Composition

## Purpose

This decision governs how every CLI command domain is layered and how the composition root assembles the domains into the `spx` program. It determines where pure domain logic, process-agnostic command handlers, and the Commander registration descriptor each live, the dependency direction between those layers, and how the composition root enumerates the domains.

## Context

**Business impact:** `spx` is a deterministic harness whose every operation is a configured local command, and its command-line surface aggregates independent domains. Coherent layering keeps domain computation verifiable in isolation, confines the process and CLI-framework boundary to one place, and lets a new domain join the CLI by adding one descriptor module and one registry entry rather than editing shared control flow. Mixed layers raise maintenance cost and create coverage gaps: pure computation forced through the process boundary cannot be exercised without spawning the executable.

**Technical constraints:** The CLI is built on Commander.js. Each command domain separates into three concerns with distinct testability profiles. Pure computation — selection, formatting, path building — verifies in isolation with no filesystem or process. I/O orchestration — directory reads, file writes, renames — verifies against temporary fixtures and returns results to its caller. The Commander binding — subcommand wiring, option parsing, exit codes, and standard-stream writes — is exercised through the built executable. The product separates a CLI-interface layer at `src/interfaces/cli/` for cross-cutting boundary primitives, and establishes descriptor-based registration for cross-cutting participation in `spx/19-language-registration.adr.md`.

This decision refines, but does not contradict, `spx/13-cli.enabler/15-cli-architecture.adr.md`, which establishes `src/interfaces/cli/` as the home for CLI-specific modules; the per-domain registration descriptor is one such module.

## Decision

Each command domain is composed from three layers in a single dependency direction — pure computation in `src/domains/{domain}/`, process-agnostic command handlers in `src/commands/{domain}/`, and a Commander registration descriptor in `src/interfaces/cli/{domain}.ts` — and the composition root registers domains by iterating a static descriptor registry that imports every descriptor through an explicit import statement.

## Rationale

The three layers exist because the three concerns have different coupling and testability profiles. Pure domain modules accept all external state as parameters and verify without the filesystem or process. Command handlers compose pure functions with filesystem I/O and return results — they carry no Commander binding and no process exit — so they verify against temporary fixtures and remain usable outside the CLI. The registration descriptor owns the Commander wiring and the process boundary (exit codes, standard streams, standard input), the parts that can only be exercised through the built executable.

The dependency direction `interfaces/cli → commands → domains`, never reversed, is what keeps each layer verifiable on its own. A reverse edge — a domain module importing a handler, or a handler importing Commander — would drag the process or framework boundary into a layer meant to be free of it, and the isolated test for that layer would require the very infrastructure the split removes.

The CLI-interface layer is the descriptor's home because the descriptor's entire responsibility is CLI-framework and process concern — the same boundary that owns input sanitization and the invocation contract. Placing the descriptor there keeps the process and framework coupling in one layer and leaves `src/domains/` and `src/commands/` free of Commander and process symbols.

The static descriptor registry mirrors the registration mechanism of `spx/19-language-registration.adr.md`: a registry module imports each descriptor through an explicit import statement and exposes the enumeration, and the composition root iterates that enumeration. A domain joins the CLI by adding its descriptor and one explicit import; the composition root's control flow does not name individual domains, so adding a domain does not edit it. The enumeration is exhaustive at compile time — a descriptor absent from the registry is absent from the build, not a silent runtime gap.

Alternatives rejected:

- **Descriptor in the domain layer (`src/domains/{domain}/`)**: forces the domain layer to import command handlers and call process APIs, coupling pure computation to the process boundary and preventing its isolated verification.
- **Descriptor in the command layer (`src/commands/{domain}/`)**: mixes process-agnostic handlers with a process- and Commander-coupled module in one layer, blurring which modules are reusable outside the CLI.
- **Imperative mutable registry populated by runtime registration calls**: registration becomes order- and side-effect-dependent and the enumeration is not statically verifiable; a missing registration surfaces at runtime rather than compile time.
- **Composition root that names each domain directly**: every new domain edits the composition root's control flow, and no single typed enumeration of registered domains exists.

## Trade-offs accepted

| Trade-off                                                                            | Mitigation / reasoning                                                                                                                                |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three modules per domain instead of one                                              | Each concern has a distinct testability profile; the split is what makes computation verifiable in isolation and handlers verifiable against fixtures |
| A descriptor module plus one registry import per domain                              | The import is a single explicit statement; the registry's typed enumeration is exhaustive at compile time                                             |
| The CLI-interface layer holds per-domain descriptors beside cross-cutting primitives | Descriptors are the per-domain face of the same CLI boundary concern; co-locating them confines process and framework coupling to one layer           |

## Invariants

- The set of domains the composition root registers equals the set the static descriptor registry enumerates.
- For every command domain, no module under `src/domains/{domain}/` references a Commander symbol, a `src/commands/` handler, or a process API; no module under `src/commands/{domain}/` references a Commander symbol or a process-exit/standard-stream API.

## Compliance

### Recognized by

Each command domain exports a `Domain` descriptor from `src/interfaces/cli/{domain}.ts`. The CLI-interface registry imports each descriptor through an explicit import statement and exposes the enumeration. `src/cli.ts` registers domains by iterating that enumeration. Modules under `src/domains/{domain}/` reference no command handler and no CLI-framework symbol.

### MUST

- Each command domain's pure computation lives under `src/domains/{domain}/` and accepts all external state as parameters, with no filesystem or process access — so domain logic verifies in isolation ([review])
- Each command domain's I/O orchestration lives under `src/commands/{domain}/` as handlers that perform filesystem operations and return results, with no Commander binding and no process exit — so handlers verify against temporary fixtures and compose outside the CLI ([review])
- Each command domain's Commander registration descriptor lives at `src/interfaces/cli/{domain}.ts` and is the sole site of Commander wiring and process I/O — exit codes, standard output, standard error, and standard input — for that domain ([review])
- The CLI-interface layer exposes a static descriptor registry that imports every domain descriptor through an explicit import statement, and the composition root registers domains by iterating that registry ([review])
- Command handlers import pure functions from `src/domains/{domain}/`, and descriptors import handlers from `src/commands/{domain}/` — dependency flows `interfaces/cli → commands → domains` ([review])

### NEVER

- A module under `src/domains/{domain}/` imports from `src/commands/{domain}/` or `src/interfaces/cli/`, or accesses the filesystem or process — reverses the dependency direction and couples pure computation to I/O ([review])
- A module under `src/commands/{domain}/` imports Commander or writes to the process boundary (`process.exit`, `process.stdout`, `process.stderr`, `process.stdin`) — the process and framework boundary belongs to the descriptor ([review])
- The composition root names individual domains in its registration control flow — domains are registered by iterating the registry ([review])
- A runtime mutable registry populated by imperative registration calls stands in for the static descriptor registry — registration is explicit and enumerable at compile time ([review])
- A descriptor is verified by mocking its command handlers, or a handler by mocking its domain functions — each layer is exercised with the real layer beneath it (domain logic in isolation, handlers against temporary fixtures, descriptors through the built executable), so the split removes the need to mock ([review])
