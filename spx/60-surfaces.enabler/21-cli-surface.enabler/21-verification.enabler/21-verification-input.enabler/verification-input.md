---
id: 01a17b23-8271-7065-94ce-5ea828403613
---

# Verification Input

PROVIDES the `spx verification input inspect <path>` command path that reports one product file's canonical product-relative path and content digests before any verification run exists
SO THAT verification launchers, verification skills, and agents
CAN name a verification input by its content, and learn the digests that `spx verification run start --expect-content-sha256` and `spx verification run input --check-file` compare, by calling spx directly

## Assertions

- Given a product file, when `spx verification input inspect <path>` runs, then it writes one JSON result carrying `path`, the canonical product-relative path, and `contentDigests` to standard output through the terminal-text JSON composition and exits 0
- ALWAYS: an operand inspection rejects exits 1 with a diagnostic on standard error naming the operand, escaped through terminal text, and empty standard output
- NEVER: `spx verification input inspect` opens a verification run or writes a file
