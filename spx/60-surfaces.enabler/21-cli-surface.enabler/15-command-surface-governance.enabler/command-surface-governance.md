# Command Surface Governance

PROVIDES shared public command-path vocabulary and deterministic command-surface enforcement boundaries
SO THAT CLI command-family nodes under `spx/60-surfaces.enabler/21-cli-surface.enabler`
CAN expose user-intent nouns, verbs, options, help, diagnostics, and output controls without leaking storage or implementation vocabulary into public command paths

## Assertions

### Compliance

- ALWAYS: public CLI command paths use noun groups for managed resources and user-intent verbs for caller actions ([audit])
- ALWAYS: CLI command-family specs distinguish public surface vocabulary from implementation, storage, journal, event, backend, and adapter vocabulary ([audit])
- ALWAYS: public command-surface governance treats implementation or storage vocabulary outside an explicit storage surface as non-public vocabulary ([audit])
