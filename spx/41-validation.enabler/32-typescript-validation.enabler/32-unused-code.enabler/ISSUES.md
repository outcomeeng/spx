# Known Issues: unused-code

## The unused-code harness owns the spawn verdict through a throwing runner

**Evidence:** `ExpectedExecutableRunner` at `testing/harnesses/validation/knip-support.ts` lines 82-95 takes the expected Knip executable in its constructor, and its `spawn` throws `Knip spawned ... instead of discovered executable ...` when any other command is spawned. `testing/harnesses/validation/unused-code.ts` imports it at line 33 and constructs it at line 284 with `discoveredToolPath` inside the `unusedCodePropertyCases` property case "spawns every executable path returned by discovery" (line 267), then asserts `runner.commands` equals `[discoveredToolPath]` at line 297. [`tests/unused-code.property.l1.test.ts`](tests/unused-code.property.l1.test.ts) imports `unusedCodePropertyCases` from that harness. [`tests/unused-code.scenario.l1.test.ts`](tests/unused-code.scenario.l1.test.ts) and [`tests/unused-code.compliance.l1.test.ts`](tests/unused-code.compliance.l1.test.ts) import `unusedCodeScenarioCases` and `unusedCodeComplianceCases` from the same harness and do not construct the runner.

**Impact:** The collaborator accepts the expected outcome as an input and decides acceptance by throwing, so the harness owns a verdict that the linked test owns. A mismatch surfaces as a thrown error inside the stage under test rather than as an assertion on observed spawns, and the trailing assertion on `runner.commands` repeats the check the runner already made.

**Settlement condition:** The runner records the observed executable, argv, and spawn options without accepting an expected outcome, and the linked test asserts those observations.
