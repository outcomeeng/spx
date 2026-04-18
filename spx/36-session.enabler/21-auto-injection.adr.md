# Session Auto-Injection

## Purpose

This decision governs how session pickup loads context files. YAML front matter lists files that are automatically read and printed to stdout on pickup.

## Context

**Business impact:** Agents need context from multiple files after picking up a session. Auto-injection eliminates repetitive file-reading operations, reducing time-to-productivity.

**Technical constraints:** Session YAML front matter supports `specs:` and `files:` arrays listing paths relative to the repository root. Files may have been renamed or deleted since session creation.

## Decision

`spx session pickup` reads and prints the contents of all files listed in the session's `specs:` and `files:` YAML front matter arrays. Missing files produce warnings, not errors.

## Rationale

Warn-and-continue is the right behavior because sessions may outlive the files they reference. Failing pickup on a missing file would block the agent from claiming the session at all. The agent sees which files loaded and which did not, and can investigate missing files independently. Storing file contents inline at creation time would make sessions large and stale.

Alternatives rejected:

- **No auto-injection** (manual file reads): wastes tokens on predictable operations
- **Inline content at creation** (snapshot): sessions become large, contents go stale
- **Fail on missing files**: too strict — files may have been legitimately removed

## Trade-offs accepted

| Trade-off                                      | Mitigation / reasoning                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Injected content may differ from creation time | Acceptable — agent sees current state; session body describes original context |
| Large output when many files listed            | `--no-inject` flag skips file reading when not needed                          |
| Missing files are warnings only                | Warning is prominent; agent can investigate                                    |

## Compliance

### Recognized by

`spx session pickup` output includes an "Injected Files" section with file contents delimited by path headers. Missing files appear as warnings in the output.

### MUST

- Parse YAML front matter `specs:` and `files:` arrays to determine injection targets ([review])
- Output each file with a clear delimiter showing its path ([review])
- Continue pickup even if some listed files do not exist ([review])

### NEVER

- Fail pickup because a listed file does not exist — blocks session claiming ([review])
- Inject files not listed in front matter — violates explicit dependency listing ([review])
- Cache file contents — always read fresh to reflect current state ([review])
