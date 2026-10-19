---
id: 01a152e8-d9fc-708a-8664-650667febc09
---

# Verification Input

PROVIDES the content identity of one product file — its canonical product-relative path, the SHA-256 of its raw bytes, and the SHA-256 of its text under universal-newline normalization — resolved from a caller-supplied operand before any verification run exists
SO THAT verification launchers, verification skills, and the run lifecycle
CAN name a verification input by its content, confirm the content a run starts over is the content the caller inspected, and detect later edits to a candidate byte for byte or modulo line-ending style, without hashing the file by any means outside spx

## Assertions

### Scenario

- Inspecting a product file maps it to its canonical product-relative path and to `contentDigests`, an object holding `none`, the lowercase hexadecimal SHA-256 of its raw bytes as `{ "sha256": <digest> }`, and `utf8-universal-newlines`, the SHA-256 of the UTF-8 encoding of its text after each CRLF and each lone CR becomes LF, as `{ "version": 1, "sha256": <digest> }` ([test](tests/inspection.scenario.l1.test.ts))

### Property

- For every byte sequence, the `none` digest equals the SHA-256 of those bytes; for every valid UTF-8 text, texts that differ only in CRLF, CR, and LF line endings share one `utf8-universal-newlines` digest; and no digest depends on the file's name or location ([test](tests/digests.property.l1.test.ts))

### Mapping

- An operand maps to one product file per [`spx/29-verification-path-scope.pdr.md`](spx/29-verification-path-scope.pdr.md): an absolute operand as written, and a relative operand to the candidates its join with the effective invocation directory and with the local worktree root yield, plus its complete-path-component suffix matches over the files `git ls-files --cached --others --exclude-standard` lists from that root; candidates are normalized, resolved through symbolic links, discarded outside the root, and collapsed, and exactly one remaining identity is accepted ([test](tests/operand-resolution.mapping.l1.test.ts))

### Compliance

- ALWAYS: inspection rejects, with a structured diagnostic naming the operand, an operand that resolves to no file or to several, that is not a regular file, that is unreadable, that resolves outside the local worktree root through lexical traversal or a symbolic link, or whose bytes fail strict UTF-8 decoding; a byte-order mark is text and is kept ([test](tests/rejection.compliance.l1.test.ts))
- NEVER: inspection opens a verification run, appends a journal event, or writes a file ([test](tests/inspection-effects.compliance.l1.test.ts))

### Audit

- ALWAYS: content normalization, content digesting, and operand resolution live in `src/lib/verification-input/` behind its `index.ts`, and inspection, `start`, and recorded-input replay consume them there ([audit:verification-input-module-home])
