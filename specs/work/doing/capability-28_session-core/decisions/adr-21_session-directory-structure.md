# ADR: Session Directory Structure

## Problem

The current /pickup and /handoff skills use filename prefixes (`TODO_`, `DOING_`) to track session status. This approach mixes status metadata with file identity, makes directory listings cluttered, and complicates config-driven path customization.

## Context

- **Business**: AI agents need fast, deterministic session management. The current skill-based approach takes 1-2 minutes; the CLI target is <100ms.
- **Technical**: SPX platform uses `.spx/` for local state. Sessions are markdown files with YAML front matter and XML content sections.

## Decision

**Use subdirectories to represent session status instead of filename prefixes.**

```
.spx/sessions/
├── todo/           # Available sessions (previously TODO_*)
│   └── 2026-01-13_08-01-05.md
├── doing/          # Claimed sessions (previously DOING_*)
│   └── 2026-01-13_14-23-47.md
└── archive/        # Archived sessions (optional)
    └── 2026-01-12_10-30-00.md
```

## Rationale

**Alternatives considered:**

1. **Keep filename prefixes** (`TODO_timestamp.md`, `DOING_timestamp.md`)
   - Rejected: Clutters listings, harder to glob by status, mixes concerns

2. **Single directory with status in YAML front matter**
   - Rejected: Requires parsing every file to determine status, slower

3. **Database (SQLite) for session index**
   - Rejected: Over-engineering for simple file-based workflow

**Why subdirectories:**

- **Clean filenames**: Session ID is just the timestamp, no prefix parsing needed
- **Fast status queries**: `ls todo/` vs. parsing prefixes from mixed listing
- **Configurable paths**: Each directory can be independently configured via `.spx/config.json`
- **Natural CLI operations**: `mv todo/session.md doing/` for claiming
- **Familiar pattern**: Similar to git's approach with `.git/objects/`

## Trade-offs Accepted

- **Migration required**: Existing `TODO_*.md` and `DOING_*.md` files need migration
  - Mitigation: Provide `spx session migrate` command or automatic detection
- **More directories**: Three directories instead of one flat listing
  - Mitigation: Directories are shallow, single-level; archive is optional

## Testing Strategy

### Level Coverage

| Level           | Question Answered                            | Scope                               |
| --------------- | -------------------------------------------- | ----------------------------------- |
| 1 (Unit)        | Can we parse directory paths correctly?      | Path construction, config loading   |
| 2 (Integration) | Do fs operations work with real directories? | mkdir, mv, ls across subdirectories |

### Escalation Rationale

- **1 → 2**: Unit tests verify path logic; integration verifies real filesystem behavior with temp directories

### Behaviors Verified

**Level 1 (Unit):**

- Config returns correct paths for `sessions.todo_dir`, `sessions.doing_dir`, `sessions.archive_dir`
- Default paths resolve to `.spx/sessions/todo`, `.spx/sessions/doing`, `.spx/sessions/archive`

**Level 2 (Integration):**

- Directory creation succeeds when parent `.spx/sessions/` exists
- Directory creation creates parents when needed (`mkdir -p` equivalent)
- Session files can be moved between directories atomically

## Validation

### How to Recognize Compliance

You're following this decision if:

- Session files are stored in `{status}/timestamp.md` not `{STATUS}_timestamp.md`
- Status is determined by which directory contains the file, not by parsing filename
- Config keys `sessions.todo_dir`, `sessions.doing_dir`, `sessions.archive_dir` are used for path resolution

### MUST

- Store available sessions in `todo/` directory
- Store claimed sessions in `doing/` directory
- Use `mv` (rename) between directories for status transitions
- Support configurable directory paths via `.spx/config.json`

### NEVER

- Use filename prefixes for status (`TODO_`, `DOING_`)
- Mix sessions of different statuses in the same directory
- Parse filenames to determine session status
- Hardcode path strings (`.spx`, `sessions`, `todo`, etc.) outside of `DEFAULT_CONFIG`
- Duplicate path definitions across multiple files

---

## Git Root Anchoring

### Problem

Session paths resolve relative to current working directory. Running `spx session handoff` from `/repo/src/components` creates `.spx/` there instead of at `/repo/.spx/`.

### Decision

**When no `--sessions-dir` is provided, resolve `.spx/` relative to the git repository root.**

### Detection Strategy

1. Run `git rev-parse --show-toplevel` to find git root
2. If not in a git repo, use cwd and emit warning to stderr
3. All session paths resolve from this anchor

### Rationale

- Sessions are project-scoped, not directory-scoped
- Agents may run from different subdirectories
- Consistent location enables cross-agent session discovery

### Testing Strategy

#### Level Coverage

| Level           | Question Answered                       | Scope                               |
| --------------- | --------------------------------------- | ----------------------------------- |
| 1 (Unit)        | Is path construction from root correct? | Pure function: root + config → path |
| 2 (Integration) | Does git root detection work reliably?  | Real git repos, subdirectories      |

#### Test Harness

| Level | Harness      | Location                        |
| ----- | ------------ | ------------------------------- |
| 2     | `withGitEnv` | `@test/harness/with-git-env.ts` |

#### Behaviors Verified

**Level 1 (Unit):**

- Given git root and config, path construction returns correct absolute path
- Path components derived from `DEFAULT_CONFIG`, never hardcoded

**Level 2 (Integration):**

- In git repo subdirectory → `.spx/` created at repo root
- Not in git repo → `.spx/` created at cwd with warning to stderr

### Validation

#### MUST

- Use `git rev-parse --show-toplevel` to find git root
- Emit warning to stderr when not in git repo
- Derive all path components from `DEFAULT_CONFIG`
- Use `@test/harness/constants` and `@test/harness/with-git-env` in tests

#### NEVER

- Create `.spx/` relative to cwd when inside a git repo
- Hardcode path strings in tests (use config constants)
- Use deep relative imports (`../../../`) - use path aliases (`@/`, `@test/`)
- Shell out to `mkdir`, `ls`, etc. when Node.js `fs` functions exist

---

## Single Source of Truth for Paths

### Problem

Path components (`.spx`, `sessions`, `todo`, `doing`, `archive`) are duplicated across:

- `src/config/defaults.ts` (`DEFAULT_CONFIG.sessions.dir`)
- `src/session/show.ts` (`DEFAULT_SESSION_CONFIG`)
- Test files (hardcoded strings)

This violates DRY and causes drift.

### Decision

**All session path components MUST be defined in `DEFAULT_CONFIG` and derived elsewhere.**

### Required Structure

`src/config/defaults.ts`:

```typescript
sessions: {
  dir: ".spx/sessions",
  statusDirs: {
    todo: "todo",
    doing: "doing",
    archive: "archive",
  },
},
```

`src/session/show.ts` MUST derive from config:

```typescript
import { DEFAULT_CONFIG } from "@/config/defaults";
import { join } from "node:path";

const { dir, statusDirs } = DEFAULT_CONFIG.sessions;

export const DEFAULT_SESSION_CONFIG: SessionDirectoryConfig = {
  todoDir: join(dir, statusDirs.todo),
  doingDir: join(dir, statusDirs.doing),
  archiveDir: join(dir, statusDirs.archive),
};
```

### Validation

#### MUST

- Define all path components in `DEFAULT_CONFIG`
- Derive `DEFAULT_SESSION_CONFIG` from `DEFAULT_CONFIG`
- Import path constants in tests from `@/config/defaults`

#### NEVER

- Duplicate path strings across files
- Hardcode `.spx`, `sessions`, `todo`, `doing`, `archive` outside `DEFAULT_CONFIG`
