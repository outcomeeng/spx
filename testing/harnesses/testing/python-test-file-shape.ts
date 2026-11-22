// The pytest target basename shape the harness spec names (`test_*.py`), held independently of the
// python descriptor and of the test-path generator, so a generated path of another shape fails the test.
export const EXPECTED_PYTEST_TEST_FILE_BASENAME = /^test_[^/]+\.py$/;
