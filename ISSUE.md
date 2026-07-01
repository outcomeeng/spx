# Encode Windows drive separators in Claude project names

**Governing node:** `spx/46-agent.enabler/21-resume.enabler`
**Source:** `src/domains/agent/resume.ts`
**Status:** open

## Summary

On native Windows, `invocationRoot` includes a drive prefix such as `F:\...`
or `F:/...`. `claudeProjectDirName` rewrites only path separators (`/` and
`\`), so the default worktree filter looks for a Claude project prefix like
`F:-Desktop-...`. Claude Code project directories cannot contain `:` and
encode that drive separator with `-` (for example `F--Desktop-...`), so
`dirAccepts` rejects every Claude Code project before any transcript is read
and `spx agent resume` omits all Claude sessions for Windows worktrees.

This is separate from the path-separator fix (`fix(agent): encode Windows
path separators in Claude project names`) because that change preserved the
drive colon; only `/` and `\` were rewritten.

## Where

- `claudeProjectDirName` — `src/domains/agent/resume.ts`, `CLAUDE_PROJECT_PATH_SEPARATORS = /[/\\]/g`.
  Rewrites separators but leaves `:` untouched.
- `resolveAgentResumeScopeContext` (worktree scope) — builds `projectPrefix`
  from `claudeProjectDirName(invocationRoot)` and accepts a Claude project
  directory only when `dirName === projectPrefix` or
  `dirName.startsWith(`${projectPrefix}-`)`.

On `F:\Desktop\repo` the helper produces `F:-Desktop-repo`, while Claude Code
stores the project under `F--Desktop-repo`. Neither the equality nor the
prefix branch of `dirAccepts` matches, so worktree-scoped resume returns zero
Claude candidates on Windows.

## Impact

- Windows worktree-scoped `spx agent resume` never surfaces Claude Code
  sessions. Codex sessions are unaffected because Codex records `cwd` in the
  session metadata rather than encoding it into a directory name.
- POSIX hosts are unaffected: their paths contain no drive colon.

## Proposed fix

Extend the encoding so `claudeProjectDirName` rewrites the drive colon as well
as path separators, matching Claude Code's actual directory naming
(`F:\Desktop` -> `F--Desktop`). Cover it with a Windows drive-letter case in
the resume test suite alongside the existing separator-encoding regression.
