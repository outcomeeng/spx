# Issues: Python Runner Test Harness

## The recording-runner property draws its product directory outside its seeded arbitrary

The property "A recording command runner reports its configured language presence, appends every `runCommand` invocation to its `calls` in order, and returns its configured exit code for each call" links `tests/test-harness.property.l1.test.ts`, whose test samples `productDir` once through `sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir())` before `assertProperty` runs. The tuple arbitrary handed to `assertProperty` holds the presence, exit code, and invocations only, and the predicate reads the sampled `productDir` from the enclosing scope.

**Impact:** The product directory is a value the predicate uses that the property harness's seed and replay never produce or reproduce, so a failure that depends on the directory cannot be replayed from `SPX_PROPERTY_SEED`, and the property quantifies over fewer values than its claim names.

**Scope:** One property of this node's property test file; the test-path generator property in the same file is a separate entry.

**Resolution:** draw the product directory from the arbitrary passed to `assertProperty`, so the predicate receives every value it uses from the seeded draw, then re-run this node's tests and its test-evidence audit.

## The non-empty test-paths property leaves the `test_*.py` shape unobserved and its distinctness check cannot fail

The property "`PYTHON_RUNNER_TEST_GENERATOR.nonEmptyTestPaths()` yields a non-empty list of distinct python test paths" links `tests/test-harness.property.l1.test.ts`, whose test asserts `paths.length` is greater than zero and that `new Set(paths).size` equals `paths.length`. The generator builds the list with `fc.uniqueArray(arbitraryPythonTestFilePath(), { minLength: MIN_NON_EMPTY_TEST_PATHS, ... })` in `testing/generators/testing/python-runner.ts`, so uniqueness and the minimum length hold by construction of the arbitrary under observation. No assertion observes that each path has the `test_*.py` shape the harness spec names as the generator's target.

**Impact:** The distinctness assertion passes for every generator that applies `uniqueArray`, and a generator that yields paths of another shape passes the same predicate, so a divergence of the generated paths from the python test pattern fails no assertion of this node.

**Scope:** One property of this node's property test file; the recording-runner property in the same file is a separate entry.

**Resolution:** assert the `test_*.py` shape of every generated path against a pattern stated independently of the generator and the descriptor, and replace the distinctness check with a predicate a non-distinct list fails, then re-run this node's tests and its test-evidence audit.
