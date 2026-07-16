# Agent Search Adapters

Agent-native session search uses a static, typed adapter set that maps each supported agent kind to its native store collector and opening-metadata parser. Pi sessions carry no inferred transcript branch identity or command-evidence grammar; their null-branch association uses same-product worktree roots, while Codex-specific subagent attribution remains confined to Codex transcripts.

## Rationale

A closed adapter vocabulary keeps store discovery, session classification, filtering, and result rendering exhaustive as agent support expands. Reusing the common session-head contract preserves one search pipeline without treating distinct transcript formats as interchangeable.

## Verification

### Testing

- ALWAYS: each supported search agent kind maps to its declared native store collector and opening-metadata parser ([mapping])
- ALWAYS: a Pi session without branch metadata matches a branch search only when its recorded working directory is inside a same-product worktree root associated with that branch ([compliance])
- NEVER: branch existence alone or incidental transcript content associates a Pi session with a branch ([compliance])
- ALWAYS: transcript command evidence and subagent attribution are applied only to agent transcript contracts that declare those evidence forms ([compliance])

### Audit

- ALWAYS: the supported search-agent vocabulary and adapter selection are static, typed, and exhaustive ([audit])
- ALWAYS: session-store filesystem operations and worktree association dependencies cross typed dependency-injection boundaries ([audit])
- NEVER: tests replace session-store or worktree-association boundaries through module mocking ([audit])
