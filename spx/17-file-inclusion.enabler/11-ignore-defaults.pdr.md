# Ignore Defaults

The file-inclusion service adopts git's view of the working tree as the default scope source and ripgrep's CLI vocabulary as the invocation-time override surface. Every automatic walk includes the entries `git ls-files --cached --others --exclude-standard --full-name` enumerates against the working tree (tracked plus untracked-not-ignored) and excludes whatever git considers ignored — top-level `.gitignore`, nested `.gitignore`, `.git/info/exclude`, and the global gitignore via `core.excludesFile` — with submodule contents, opaque to the parent, excluded. A consumer-supplied domain path filter (resolved from that consumer's config descriptor) narrows or expands only that domain's scope. Invocation-time overrides on domain commands that walk files are `--files <path>...` / positional paths (explicit paths that bypass every shared layer and every domain filter), `--no-ignore` (bypass every git ignore source), `--no-ignore-vcs` (bypass `.gitignore` and nested `.gitignore` only, still honoring `.git/info/exclude` and global gitignore), and `--ignore-file <path>` (layer an additional ignore-pattern file). Diverging deliberately from ripgrep, spx does **not** exclude dot-prefixed entries by default and exposes no `--hidden` flag — product content under `.github/`, `.changeset/`, `.husky/`, `.devcontainer/`, and similar paths is in scope unconditionally, subject only to the git-tracking layer.

## Rationale

Git already maintains the authoritative declaration of "what is part of this product," and every git-aware code tool (ripgrep, fd, eslint, biome, oxlint, ruff, prettier) consults it; adopting git's view eliminates the duplication where operators would otherwise restate `.gitignore` patterns in each domain descriptor. Reusing ripgrep's `--no-ignore` / `--no-ignore-vcs` / `--ignore-file` names lets operators and agents transfer one mental model. The dotfile divergence is load-bearing: ripgrep's default-exclude-dotfiles serves an interactive operator who flips `--hidden` on seeing missing matches, but spx runs unattended in CI and pre-commit where silent dotfile exclusion produces false-clean verdicts no operator sees, and modern monorepos carry real product content under dot-prefixed directories. Trusting git fully — with no hardcoded universal-noise tail — keeps the model learnable (the one rule is "git is authoritative"; a noise path like `.DS_Store` is fixed once in global gitignore). Untracked-but-not-ignored files are included to match pre-commit expectation (a brand-new file is the one being edited); submodule contents are skipped to match git's opaque-pointer treatment.

Rejected: a hidden-prefix layer excluding dot-prefixed entries (silently skips product content in unattended contexts); a configured artifact-directory name list or a standalone ignore-source file like `spx/EXCLUDE` (duplicates `.gitignore`, creating the drift class the service exists to eliminate); default-include-everything (floods commands with `node_modules`/build outputs on first run); full ripgrep parity including dotfile exclusion (same silent-exclusion failure); and per-consumer ignore defaults (reproduces drift and duplication for shared scope).

## Product properties

1. Default automatic walks include exactly git's effective scope — tracked and untracked-not-ignored entries, excluding every git-ignored entry and all submodule contents.
2. Dot-prefixed entries are included by default, subject only to git's view; no opt-in flag is required.
3. A caller-supplied explicit path is always included regardless of any ignore source or domain filter.

## Verification

### Audit

- ALWAYS: default automatic walks consult `git ls-files --cached --others --exclude-standard --full-name` against the working tree resolved per `spx/15-worktree-resolution.pdr.md` ([audit])
- ALWAYS: every consumer-supplied explicit path bypasses every shared layer and every domain path filter, and appears in the included set with a decision trail naming the explicit-override layer ([audit])
- ALWAYS: a consumer-supplied domain path filter records include and exclude matches in the scope decision trail without affecting any other domain's scope ([audit])
- ALWAYS: submodule contents are excluded from automatic walks; an explicit path under a submodule directory is honored as caller intent and reaches the included set ([audit])
- ALWAYS: each domain command that exposes ignore-override flags names them identically to ripgrep: `--no-ignore`, `--no-ignore-vcs`, `--ignore-file <path>` ([audit])
- ALWAYS: `--no-ignore` includes entries any git ignore source would exclude; `--no-ignore-vcs` includes entries `.gitignore` and nested `.gitignore` would exclude while still honoring `.git/info/exclude` and global gitignore; `--ignore-file <path>` additionally excludes entries matching patterns in the supplied file ([audit])
- NEVER: exclude an entry from an automatic walk for any reason other than git's view of the working tree, a consumer-supplied domain path filter, or a submodule boundary ([audit])
- NEVER: exclude dot-prefixed entries by default — `.github/`, `.changeset/`, `.husky/`, `.devcontainer/`, and every other dot-prefixed product-content directory is walked unconditionally subject to git's view ([audit])
- NEVER: expose a `--hidden` flag or any equivalent dotfile-inclusion override — dotfiles are included by default and require no opt-in ([audit])
- NEVER: maintain an artifact-directory name list, hidden-prefix rule, universal-noise allowlist, or standalone ignore-source file inside spx — the git-tracking layer subsumes every such mechanism ([audit])
- NEVER: drop, rewrite, or silently filter a caller-supplied explicit path — the override is absolute regardless of git's view, domain filters, or submodule status ([audit])
- NEVER: apply one domain's path filter to another domain's scope unless that other domain explicitly consumes the same descriptor section ([audit])
- NEVER: adopt override-flag names other than ripgrep's `--no-ignore`, `--no-ignore-vcs`, and `--ignore-file` — flag-name drift across domains defeats the shared mental model ([audit])
