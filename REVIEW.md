# Code Review Instructions

Every review finding must be classified by required receiver action. Use only these four classes as finding headings:

| Class          | Receiver action              | Use when                                                                                                                                                                                                    |
| -------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKING`     | Fix in this PR before merge. | The PR introduces a correctness bug, security risk, data-loss risk, production-safety risk, broken required validation, secret exposure, or direct repo-policy violation that affects the changed behavior. |
| `NEEDS-ANSWER` | Answer before merge.         | A required fact is missing from the diff or PR context, and the answer can clear the concern or convert it to `BLOCKING`.                                                                                   |
| `FOLLOW-UP`    | Track outside this PR.       | The concern is valid, but fixing it would widen the PR or does not affect merge safety for this change.                                                                                                     |
| `NOTE`         | No action expected.          | Context, praise, explanation, or an observation that does not create work.                                                                                                                                  |

Do not use `P0`, `P1`, `P2`, `P3`, `critical`, `high`, `medium`, `low`, `minor`, or `nit` as finding headings. Risk words may appear inside the rationale only when they add concrete evidence.

`BLOCKING` and `NEEDS-ANSWER` are the only classes that enter the active PR loop. `FOLLOW-UP` items belong in a short summary and must name the owning tracking location when retention is useful. `NOTE` items are optional and must be omitted when they add noise.

Use this finding shape:

```text
BLOCKING [correctness]: path/to/file.py:42
Evidence: The changed branch now raises on an empty profile list because ...
Required before merge: Preserve the previous no-op behavior or add evidence that the new failure is intended.
```

```text
FOLLOW-UP [test-evidence]: spx/.../tests/test_x.py
Evidence: The test covers the happy path but not rollback.
Track under: spx/.../ISSUES.md.
```

If a review has no `BLOCKING` or `NEEDS-ANSWER` items, say so directly. Do not manufacture lower-priority findings to prove that review happened.
