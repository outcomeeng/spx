# Known Issues: type-check

## The type-check harness owns the spawn verdict through a throwing double

**Evidence:** Two drivers in `testing/harnesses/validation/type-check.ts` construct `RejectingUnexpectedValidationSpawnRunner` (imported at line 43) with the expected executable and argv: the driver at line 251 passes `command: toolPath` and `stdio: EXPECTED_PIPED_STDIO`, and the driver at line 278 passes `command: toolPath` and `stdio: EXPECTED_PIPED_STDIO` for the product-first executable returned by discovery. The double is defined at `testing/harnesses/validation/subprocess.ts` lines 68-88; its `spawn` throws `Unexpected validation executable`, `Unexpected validation arguments`, or `Unexpected validation stdio` when the observed spawn differs from the required one. Both drivers sit inside `registerTypeCheckComplianceTests` (line 176), which [`tests/type-check.compliance.l1.test.ts`](tests/type-check.compliance.l1.test.ts) imports and calls. [`tests/type-check.scenario.l2.test.ts`](tests/type-check.scenario.l2.test.ts) imports `registerTypeCheckScenarios` from `testing/harnesses/validation/type-check-scenarios.ts` and does not reach the double.

**Impact:** The collaborator accepts the expected outcome as an input and decides acceptance by throwing, so the harness owns a verdict that the linked test owns. A mismatch surfaces as a thrown error inside the stage under test rather than as an assertion on observed spawns, and the trailing assertions on `runner.commands` and `runner.spawnOptions` repeat a check the double already made.

**Settlement condition:** The runner records the observed executable, argv, and spawn options without accepting an expected outcome, and the linked test asserts those observations.
