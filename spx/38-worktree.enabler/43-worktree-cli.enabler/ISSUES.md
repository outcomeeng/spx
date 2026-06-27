# Worktree CLI Issues

## Codex hook integration has no reliable controlling-process contract

The installed spec-tree plugin invokes `spx worktree claim --session-id <session-id>` from `SessionStart` and from `PreToolUse` repair. The hook passes the session identity but no explicit holder process identity. `spx worktree claim` therefore infers the holder by walking the hook subprocess ancestry for an agent command name, then falling back to the immediate parent. In Codex, live repair sometimes reports `Error: worktree controlling process could not be resolved`, and sometimes reports successful repair on every tool use because the claim records a transient hook-side process that is gone by the next `PreToolUse`.

**Evidence:** In the `outcomeeng/plugins` repository, `src/plugins/spec-tree/scripts/session-start.py` invokes `[spx, "worktree", "claim", "--session-id", session_id]`; `src/plugins/spec-tree/scripts/load-gate.py` invokes the same argv during repair. `src/plugins/spec-tree/scripts/hook_runtime.py` falls back only to `CODEX_THREAD_ID` and `CLAUDE_SESSION_ID` for the session id, not for a controlling pid. The plugin's own issue note at `spx/21-spec-tree.enabler/19-worktree-occupancy.enabler/ISSUES.md` records that `spx worktree claim --session-id ...` cannot resolve the Codex controlling process and leaves status stale. A live trace in this product worktree showed repeated `PreToolUse claimed this worktree for session 019ed5f2-0971-7283-a31c-4a609a2633cf` messages across consecutive tool uses; the claim file recorded short-lived PIDs such as `41023` that were absent by the time the tool command ran, while the tool command itself was parented by the long-lived Codex process `95097`. Running `SPX_WORKTREE_CONTROLLING_PID=95097 spx worktree claim --session-id 019ed5f2-0971-7283-a31c-4a609a2633cf` changed `spx worktree status --format json` to `{"worktree":"spx-b","status":"occupied"}` and stopped the next hook from emitting stale-repair context. Running `spx worktree claim --session-id 019ed5f2-0971-7283-a31c-4a609a2633cf` directly from the tool shell outside the sandbox also recorded PID `95097`, proving the CLI resolver can find Codex when Codex is actually in the subprocess ancestry; the plugin hook path is the path that lacks a reliable long-lived holder.

**Impact:** Worktree occupancy does not work for Codex sessions while the plugin hook path uses the Python repair loop and does not call the SPX hook event runner. The `CLAUDE_WORKTREE_CLAIMED` env marker never becomes trustworthy for those sessions, and every `PreToolUse` can run a Python hook that calls `spx worktree status`, then `spx worktree claim`, then walks the process table again before allowing the tool call.

**Skills:** `spec-tree:applying`, `typescript:testing-typescript`, `typescript:coding-typescript`, `typescript:auditing-typescript-tests`, and `typescript:auditing-typescript`.

**Resolution:** Switch the plugin SessionStart hook to the SPX-side `spx hook run session-start` entry point. That hook event reads hook stdin, resolves `payload.session_id` with `CODEX_THREAD_ID` / `CLAUDE_SESSION_ID` fallback, writes the hook env file, and runs the claim once from the payload product directory. Keep `spx worktree claim` available for manual repair paths.

## Worktree claiming runs as a repeated Python-to-spx repair loop

The installed spec-tree plugin performs worktree occupancy through Python hook scripts that call `spx`. `SessionStart` calls `spx worktree claim` once, but `PreToolUse` also calls `spx worktree status --format json` and then `spx worktree claim --session-id <session-id>` whenever the status is stale or unclaimed. The session id and project directory are stable for the life of an agent session, so worktree ownership should be established once at session start through a stable holder contract rather than rediscovered on every tool use.

**Evidence:** In the `outcomeeng/plugins` repository, `src/plugins/spec-tree/scripts/session-start.py` reads the session id from `payload.session_id`, falling back to `CODEX_THREAD_ID` and `CLAUDE_SESSION_ID`, then writes `CLAUDE_SESSION_ID`, `CLAUDE_PROJECT_DIR`, `PROJECT_DIR`, and `CLAUDE_WORKTREE_CLAIMED` to `$CLAUDE_ENV_FILE`. The same script invokes `spx worktree claim --session-id <session-id>`. `src/plugins/spec-tree/scripts/load-gate.py` repeats status and claim work during every `PreToolUse` when `CLAUDE_WORKTREE_CLAIMED` is not `1`. The live failure shows this repair path repeatedly records stale hook-side PIDs instead of establishing durable occupancy.

**Impact:** Every affected tool call pays for a Python process, an `spx` status process, an `spx` claim process, JSON parsing, and process-table reads until the plugin switches to the SPX-side `spx hook run session-start` path. The repair loop also hides the true contract problem by reporting repeated successful claims that are stale by the next tool use.

**Skills:** `spec-tree:applying`, `typescript:testing-typescript`, `typescript:coding-typescript`, `typescript:auditing-typescript-tests`, and `typescript:auditing-typescript`.

**Resolution:** Switch plugin occupancy setup from the Python status-then-claim repair loop to `spx hook run session-start` at SessionStart. Worktree claim should run only from the session-start path after the CLI has the hook payload, runtime env, working directory, and env-file path; `PreToolUse` should not attempt repeated occupancy repair.

## Status target accepts paths but not pool worktree basenames

`spx worktree status <target>` resolves `<target>` as a filesystem path from the caller's current directory. Passing a pool worktree basename such as `plugins-e` from outside the pool member therefore fails with `path resolves to no worktree: plugins-e`, even though a human reading `git worktree list` sees `plugins-e` as the worktree name.

**Evidence:** `resolveTargetWorktree` resolves the status argument through `resolve(base, options.worktree)` and refuses it when `detectWorktreeProductRoot` reports a non-git path. The observed report ran `spx worktree status plugins-e --format json` and received `Error: path resolves to no worktree: plugins-e`.

**Impact:** This is not the primary claim failure, but it makes manual diagnosis harder and creates a mismatch between the JSON field `{"worktree":"plugins-e"}` and the accepted command argument shape.

**Skills:** `spec-tree:applying`, `typescript:testing-typescript`, `typescript:coding-typescript`, `typescript:auditing-typescript-tests`, and `typescript:auditing-typescript`.

**Resolution:** Either document the argument as a path and improve the error/help text, or teach `status` to resolve a sibling pool basename through `git worktree list` when the path lookup fails.

## `--all --format json` L2 compliance test shares production git-facts parsing

The L2 compliance test for `spx worktree status --all --format json` derives its multi-worktree expected entries by calling the same `gatherGitFacts(firstPath)` path that production uses through `resolveAllTargetWorktrees`, so list-content and ordering bugs in shared git worktree parsing can self-validate on both expected and actual sides.

**Evidence:** PR #298 spec-tree review classified this as FOLLOW-UP [evidence] after the `spx worktree status --all --format json` compliance assertion was added. The single-worktree L2 case and L1 scenario test still provide independent evidence for JSON-array shape, ordering, and claim-name derivation, while the multi-worktree L2 case primarily proves CLI wiring against a real packaged executable.

**Impact:** The compliance evidence is bounded but uneven: the L2 test covers Commander flag parsing and packaged JSON-array behavior, while domain parsing correctness depends on the lower-level scenario evidence rather than an independent real-git oracle.

**Skills:** `spec-tree:applying`, `typescript:testing-typescript`, `typescript:coding-typescript`, `typescript:auditing-typescript-tests`, and `typescript:auditing-typescript`.

**Resolution:** Replace the shared-production oracle with an independent real-git expectation for the multi-worktree L2 test, or split the spec assertions so L2 is cited only for packaged CLI wiring while L1 carries the ordering and claim-name evidence.
