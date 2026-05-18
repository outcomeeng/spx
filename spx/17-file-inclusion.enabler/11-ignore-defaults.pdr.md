# Ignore Defaults

## Purpose

This decision governs which filesystem entries the file-inclusion service excludes by default during automatic walking, which entries an explicit caller-supplied path always includes, and which invocation-time flags override the default exclusion behavior. Consumer domains supply their own config-backed path filters through registered config descriptors; the file-inclusion service supplies shared scope mechanics, decision trails, and tool-adapter behavior.

## Context

**Business impact:** Every spx command that touches the filesystem makes inclusion decisions. Defaults that surface build artifacts or pollute tool output produce noise and false findings; defaults that silently hide product content produce false-clean verdicts no operator sees. An operator who marks a path as ignored from git expects every spx tool to respect that declaration without restating it in domain descriptors. An operator running spx unattended in CI or pre-commit needs the default scope to match what the operator considers part of the product — modern monorepos place real product content (CI workflows, changesets, hook definitions, devcontainer configuration) under dot-prefixed directories, so a blanket dotfile exclusion silently skips work the operator cares about.

Validation, testing, auditing, and reviewing face separate policy requirements layered on top of the shared default. Validation path filters suppress quality-debt output. Testing path filters narrow the passing-scope lens used by `spx test passing` and status reporting. Auditing and reviewing path filters select targets and persisted state.

**Technical constraints:** spx runs inside git working trees per `spx/15-worktree-resolution.pdr.md`. Git's plumbing enumerates the operator's effective scope through `git ls-files --cached --others --exclude-standard --full-name`, which returns tracked files plus untracked-not-ignored files, resolved against every git ignore source — top-level `.gitignore`, nested `.gitignore` files, `.git/info/exclude`, and the user's global gitignore via `core.excludesFile`. Submodule contents are opaque from the parent repository's perspective and do not appear in the enumeration. ripgrep's CLI vocabulary (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) is the established override convention used across the ecosystem.

## Decision

The file-inclusion service adopts git's view of the working tree as the default scope source and ripgrep's CLI vocabulary as the invocation-time override surface.

**Shared layers** (applied to every automatic walk):

- Git-tracking layer: entries enumerated by `git ls-files --cached --others --exclude-standard` against the working tree are included. Entries git considers ignored — through `.gitignore`, nested `.gitignore` files, `.git/info/exclude`, or the user's global gitignore — are excluded. Submodule contents do not appear in git's enumeration and are excluded from automatic walks.

**Domain path-filter layer** (applied only when supplied by a consumer):

- The caller passes a typed path filter resolved from its domain config descriptor. An operator who supplies an `exclude` pattern suppresses matching paths for that domain. An operator who supplies an `include` pattern restricts that domain's walk to matching paths only.
- Validation reads `validation.paths` from `spx.config.{toml,json,yaml}` for quality-debt suppression.
- Testing reads its own config-backed passing-scope filter from `spx.config.{toml,json,yaml}` for `spx test passing` and status semantics.
- Auditing and reviewing read their own descriptors for target selection and persisted execution state.

**Invocation-time overrides** (CLI flags exposed by domain commands that walk files):

- `--files <path>...` or positional path arguments: caller-supplied explicit paths bypass every shared layer and every domain path filter. Explicit paths express caller intent.
- `--no-ignore`: bypasses every git ignore source — top-level `.gitignore`, nested `.gitignore`, `.git/info/exclude`, and global gitignore. The walk includes ignored entries.
- `--no-ignore-vcs`: bypasses `.gitignore` and nested `.gitignore` files only; `.git/info/exclude` and global gitignore continue to apply.
- `--ignore-file <path>`: layers an additional ignore-pattern file on top of git's view; entries matching the additional file are excluded.

**Deliberate divergence from ripgrep:** spx does not exclude dot-prefixed entries by default. No `--hidden` flag exists because hidden paths are walked unconditionally, subject only to the git-tracking layer. Product content under `.github/`, `.changeset/`, `.husky/`, `.devcontainer/`, and similar paths is in scope by default.

A caller that supplies explicit paths to the resolver bypasses every shared layer and every domain path filter — each supplied path is included with a decision trail naming the explicit-override layer.

## Rationale

Git already maintains the authoritative declaration of "what is part of this product." Operators express scope through `.gitignore`, and every code tool aware of git (ripgrep, fd, eslint, biome, oxlint, ruff, prettier) consults that declaration. Adopting git's view as the spx default eliminates the duplication where operators would otherwise maintain identical ignore patterns in `.gitignore` and in each domain's path-filter descriptor. Domain descriptors retain their meaning — narrowing or expanding scope within the git-tracked set with domain-specific semantics — but no longer carry the operator's universal "this is not product content" intent. That intent lives in `.gitignore`.

ripgrep's invocation-time vocabulary is the established override mechanism in the code-walking ecosystem. `--no-ignore`, `--no-ignore-vcs`, and `--ignore-file` are well-understood by every operator who has used ripgrep, fd, or similar tools. Reusing the names lets agents and operators transfer one mental model across tools and removes the cost of learning a spx-specific override vocabulary.

The divergence on dotfiles is deliberate and load-bearing. ripgrep's default-exclude-dotfiles rule serves an interactive operator who sees missing matches in a terminal and flips `--hidden`. spx runs unattended in CI and pre-commit hooks; silent dotfile exclusion produces false-clean verdicts no operator ever sees. Modern monorepos carry real product content under dot-prefixed directories — CI workflows under `.github/workflows/`, hook definitions under `.husky/` or `lefthook.yml`, devcontainer configuration under `.devcontainer/`, changeset drafts under `.changeset/`. A blanket dotfile exclusion silently skips this content for audit, review, markdown validation, and any future consumer that walks the working tree.

Trusting git fully — with no universal-noise tail of hardcoded exclusions — keeps the model learnable. The single rule is "git is authoritative." If a noise path (`.DS_Store`, `Thumbs.db`, editor swap files) surfaces in walks, the operator's fix is to add it to global gitignore through `git config --global core.excludesFile` once, not to maintain a separate spx noise list that drifts from `.gitignore` and produces surprise when an entry exists in one place but not the other.

Including untracked-but-not-ignored files matches operator expectation in pre-commit contexts. A brand-new file the operator just created — not yet `git add`-ed, not matching any ignore pattern — is walked. Restricting the default to tracked-only would silently skip the file the operator is actively editing.

Skipping submodule contents matches git's own opaque-pointer treatment. The parent repository sees a submodule as a single tree entry pointing at a commit; the submodule's files are managed by the submodule's own repository. Walking submodule contents from the parent would lint, type-check, or audit code the parent product does not own. Operators who need submodule contents processed pass explicit paths under the submodule directory.

Alternatives considered:

- **Hidden-prefix layer that excludes every dot-prefixed entry by default.** Rejected because it silently skips product content under `.github/`, `.changeset/`, `.husky/`, `.devcontainer/`, and similar dot-prefixed directories that carry real product semantics. The ripgrep analogy that motivated the rule does not transfer to unattended execution contexts where no operator sees the empty result.
- **Configured artifact-directory name list.** Each artifact directory name (`node_modules`, `dist`, `coverage`, build caches) declared in the file-inclusion descriptor. Rejected because the operator already declares these in `.gitignore`; duplicating the list in a descriptor creates the drift class the file-inclusion service exists to eliminate, and adds noise to product configuration that has to be maintained alongside `.gitignore`.
- **Standalone ignore-source file (`spx/EXCLUDE` or similar).** A spx-specific text file listing paths the operator wants excluded from scope. Rejected because `.gitignore` already provides operator-declared scope; a parallel mechanism creates drift between the two sources and forces operators to remember which tool reads which file.
- **Default-include everything with no shared exclusion layer.** Reject entries only when a domain descriptor explicitly excludes them. Rejected because it floods every command with `node_modules`, build outputs, and similar artifacts on first run; operators would need to populate domain descriptors before any command produces useful output, and the same exclusion list would have to be restated across every domain.
- **Full ripgrep parity — honor `.gitignore` and exclude dotfiles too.** Rejected for the same reason hidden-prefix is rejected: silent product-content exclusion in unattended contexts is the dominant failure mode.
- **Per-consumer ignore defaults.** Each consumer maintains its own ignore configuration. Rejected because that pattern produces the drift-and-duplication class the file-inclusion service eliminates for shared layers. Consumer-specific policy belongs in domain descriptors; the shared default lives in this subtree.

## Trade-offs accepted

| Trade-off                                                                                        | Mitigation / reasoning                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| spx automatic walks require a git working tree                                                   | `spx/15-worktree-resolution.pdr.md` already requires git for root resolution; spx is positioned for git-tracked products and falls back to the current working directory with a warning when no git repo is present         |
| Operator adds noise paths (`.DS_Store`, editor swaps) to global gitignore                        | One-time setup that matches the convention across ripgrep, fd, eslint, prettier, biome, oxlint, and ruff; avoids a parallel spx-specific noise list                                                                         |
| Untracked-but-not-ignored files appear in automatic walks                                        | Matches operator expectation in pre-commit contexts where a brand-new file is the file the operator is editing; explicit-caller paths remain available to narrow                                                            |
| Submodule contents are excluded from automatic walks                                             | Matches git's own opaque-pointer treatment; an explicit path under a submodule is honored as caller intent                                                                                                                  |
| Product content under dot-prefixed directories is processed by default                           | Intentional divergence from ripgrep — silent product-content exclusion in unattended contexts is the worse failure mode; operators who genuinely want a dot-prefixed path skipped add it to `.gitignore` or a domain filter |
| Override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) require CLI wiring per domain | Each file-walking domain command adds the flags once; flag names follow ripgrep convention so operators and agents transfer one mental model                                                                                |

## Product invariants

- A caller that supplies an explicit path to the file-inclusion scope resolver always receives that path in the included set, regardless of any ignore source or domain filter
- An automatic walk without explicit paths excludes every entry git considers ignored under the working tree — through `.gitignore`, nested `.gitignore`, `.git/info/exclude`, or global gitignore — and includes every tracked or untracked-not-ignored entry
- Dot-prefixed entries are included in automatic walks by default, subject only to git's view of the working tree
- Submodule contents are excluded from automatic walks; an explicit path under a submodule directory is honored
- A consumer-supplied domain path filter applies only to that consumer's scope; domain filters do not affect other domains' scope
- A command that exposes ignore-override flags names them identically to ripgrep — `--no-ignore`, `--no-ignore-vcs`, `--ignore-file`

## Compliance

### Recognized by

An operator running `spx validation literal` without explicit paths processes every file git tracks and every untracked-not-ignored file under the working tree; files matching `.gitignore`, nested `.gitignore`, `.git/info/exclude`, or global gitignore patterns are not processed. An operator running `spx validation literal --files dist/x.ts` sees the file processed even though `.gitignore` matches it. An operator running `spx validation literal --no-ignore` processes every file in the working tree including those normally ignored. Files under `.github/`, `.changeset/`, `.husky/`, and `.devcontainer/` are processed by default — no flag required.

### MUST

- Default automatic walks consult `git ls-files --cached --others --exclude-standard --full-name` against the working tree resolved per `spx/15-worktree-resolution.pdr.md` ([review])
- Every consumer-supplied explicit path bypasses every shared layer and every domain path filter, and appears in the included set with a decision trail naming the explicit-override layer ([review])
- A consumer-supplied domain path filter records include and exclude matches in the scope decision trail without affecting any other domain's scope ([review])
- Submodule contents are excluded from automatic walks; an explicit path under a submodule directory is honored as caller intent and reaches the included set ([review])
- Each domain command that exposes ignore-override flags names them identically to ripgrep: `--no-ignore`, `--no-ignore-vcs`, `--ignore-file <path>` ([review])
- `--no-ignore` causes the git-tracking layer to include entries that any git ignore source would otherwise exclude; `--no-ignore-vcs` causes it to include entries that `.gitignore` and nested `.gitignore` would otherwise exclude while continuing to honor `.git/info/exclude` and global gitignore; `--ignore-file <path>` causes the git-tracking layer to additionally exclude entries matching patterns in the supplied file ([review])

### NEVER

- Exclude an entry from an automatic walk for any reason other than git's view of the working tree, a consumer-supplied domain path filter, or submodule boundary ([review])
- Exclude dot-prefixed entries by default — `.github/`, `.changeset/`, `.husky/`, `.devcontainer/`, and every other dot-prefixed product-content directory is walked unconditionally subject to git's view ([review])
- Expose a `--hidden` flag or any equivalent dotfile-inclusion override — dotfiles are included by default and require no opt-in ([review])
- Maintain an artifact-directory name list, hidden-prefix rule, universal-noise allowlist, or standalone ignore-source file inside spx — the git-tracking layer subsumes every such mechanism ([review])
- Drop, rewrite, or silently filter a caller-supplied explicit path — the override is absolute regardless of git's view, domain filters, or submodule status ([review])
- Apply one domain's path filter to another domain's scope unless that other domain explicitly consumes the same descriptor section ([review])
- Adopt override-flag names other than ripgrep's `--no-ignore`, `--no-ignore-vcs`, and `--ignore-file` — flag-name drift across domains defeats the shared mental model ([review])
