<overview>

When a spec and its tests are authored before the implementation exists, the node is in **specified** state. Tests import from modules that don't exist yet, so they break type checkers (unresolved imports) and test runners (ImportError). The `spx/EXCLUDE` file lists these nodes. The `spx` CLI reads this file and filters excluded nodes at invocation time.

</overview>

<spx_exclude_file>

`spx/EXCLUDE` is a visible, version-controlled file listing node paths in specified state. Paths are relative to `spx/`.

```text
# Nodes excluded from the quality gate.
# Specs and tests exist. Implementation does not.
# spx test passing skips these nodes.
# Linting still runs — style is checked regardless.
#
# Remove entries when implementation begins.

57-subsystems.outcome/32-risc-v.outcome
```

**Why visible, not hidden:** The file shows where specified nodes exist. Agents and humans discover it by reading the `spx/` directory — no hunting required.

**Why in `spx/`, not product root:** The file describes spec tree state. It belongs with the tree, not as product-root cruft.

</spx_exclude_file>

<quality_gate_integration>

The `spx` CLI reads `spx/EXCLUDE` and filters paths at invocation time. It never writes to product configuration files (`pyproject.toml`, `package.json`, `tsconfig.json`). The product's own tools always run against all files — `spx` handles scoping.

`spx` discovers tests by walking `spx/**/tests/`, groups files by extension, and dispatches to the correct runner per group. A single tree can contain tests in multiple languages.

| Tool category    | `spx test`                 | `spx test passing`                   |
| ---------------- | -------------------------- | ------------------------------------ |
| **Test runner**  | Runs all discovered tests  | Skips EXCLUDE entries                |
| **Type checker** | Checks all spec-tree files | Skips EXCLUDE entries                |
| **Linter**       | Checks all spec-tree files | Checks all — style is always checked |

**Linters always check.** A specified test file is still valid code with correct style. Excluding it from linting would mask real quality issues.

**No config manipulation.** `spx` passes exclusion flags to each tool at invocation time (e.g., `--ignore` for pytest, `--exclude` for vitest). The product's own `pyproject.toml` or `tsconfig.json` is never touched by spec-tree tooling.

</quality_gate_integration>

<lifecycle>

| Event                        | Action                                         |
| ---------------------------- | ---------------------------------------------- |
| Author spec + tests          | Add node path to `spx/EXCLUDE`                 |
| Begin implementation         | Remove node from `spx/EXCLUDE`                 |
| Tests start passing          | Node transitions from failing → passing        |
| Implementation removed later | Add node back to `spx/EXCLUDE` if tests remain |

Exclusion is not permanent. It declares "specs and tests exist, implementation does not." When the implementation arrives, the exclusion is removed and the tests join the quality gate.

</lifecycle>

<not_cheating>

Exclusion is fundamentally different from suppressing errors:

| Suppressing errors (wrong)       | Exclusion (correct)                              |
| -------------------------------- | ------------------------------------------------ |
| `# noqa` / `# type: ignore`      | `spx/EXCLUDE` lists nodes without implementation |
| Hides real bugs in existing code | Declares that implementation does not exist yet  |
| Stays forever unless removed     | Removed when implementation begins               |
| Per-line, scattered, invisible   | Per-node, centralized, visible                   |
| Cheating the quality gate        | Defining the quality gate's scope                |

</not_cheating>
