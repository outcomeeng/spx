# Ignore Defaults

spx commands that discover files for validate, test, review, audit, evaluate, or internal traversal work use the current worktree's git-visible file set as the default automatic scope. Explicit caller paths are always honored, command-specific configured filters may narrow only automatic scope, ignore override flags use ripgrep's vocabulary, and dot-prefixed product-content paths are included by default without a hidden-file opt-in.

## Rationale

Git already declares product membership through tracked files and ignore rules, and every git-aware code tool (ripgrep, fd, eslint, biome, oxlint, ruff, prettier) consults that view. Reusing ripgrep's `--no-ignore` / `--no-ignore-vcs` / `--ignore-file` names lets operators and agents transfer one mental model. Dot-prefixed product paths are included because unattended CI and pre-commit runs cannot rely on an operator noticing a missing file and rerunning with a hidden-file flag. Untracked-but-not-ignored files are included because a brand-new file is often exactly what the command must check; submodule contents are skipped because git treats the submodule as an opaque pointer.

Rejected: excluding dot-prefixed entries by default (silently skips product content in unattended contexts); keeping spx-owned duplicate ignore lists (creates drift from git's view); default-include-everything (floods commands with dependency and build outputs on first run); full ripgrep parity including dotfile exclusion (same silent-exclusion failure); and per-command default ignore policies (reproduces drift and duplication for shared scope).

## Product properties

1. Default automatic walks include exactly git's effective scope — tracked and untracked-not-ignored entries, excluding every git-ignored entry and all submodule contents.
2. Dot-prefixed entries are included by default, subject only to git's view; no opt-in flag is required.
3. A caller-supplied explicit path is always included regardless of any ignore source or domain filter.

## Verification

### Audit

- ALWAYS: default automatic walks include the product's tracked and untracked-not-ignored file set for the current worktree ([audit])
- ALWAYS: every consumer-supplied explicit path appears in the included set even when git's view or a configured filter would exclude it, and output that explains scope decisions marks it as explicitly requested ([audit])
- ALWAYS: a command-specific configured filter narrows only that command's automatic scope and does not affect any other command's scope ([audit])
- ALWAYS: submodule contents are excluded from automatic walks; an explicit path under a submodule directory is honored as caller intent and reaches the included set ([audit])
- ALWAYS: each domain command that exposes ignore-override flags names them identically to ripgrep: `--no-ignore`, `--no-ignore-vcs`, `--ignore-file <path>` ([audit])
- ALWAYS: `--no-ignore` includes entries any git ignore source would exclude; `--no-ignore-vcs` includes entries `.gitignore` and nested `.gitignore` would exclude while still honoring `.git/info/exclude` and global gitignore; `--ignore-file <path>` additionally excludes entries matching patterns in the supplied file ([audit])
- NEVER: exclude an entry from an automatic walk for any reason other than git's view of the working tree, a command-specific configured filter, or a submodule boundary ([audit])
- NEVER: exclude dot-prefixed entries by default — `.github/`, `.changeset/`, `.husky/`, `.devcontainer/`, and every other dot-prefixed product-content directory is walked unconditionally subject to git's view ([audit])
- NEVER: expose a `--hidden` flag or any equivalent dotfile-inclusion override — dotfiles are included by default and require no opt-in ([audit])
- NEVER: maintain an spx-owned artifact-directory name list, hidden-prefix rule, universal-noise allowlist, or standalone ignore-source file that duplicates git's ignore rules ([audit])
- NEVER: drop, rewrite, or silently filter a caller-supplied explicit path — the override is absolute regardless of git's view, domain filters, or submodule status ([audit])
- NEVER: apply one command's configured filter to another command's scope unless that command explicitly consumes the same configuration ([audit])
- NEVER: adopt override-flag names other than ripgrep's `--no-ignore`, `--no-ignore-vcs`, and `--ignore-file` — flag-name drift across domains defeats the shared mental model ([audit])
