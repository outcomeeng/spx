# Issues

- Performance target evidence drift:
  The story declares `<5ms per work item (excluding first filesystem access)` in `status-edge-cases.story.md`, but `tests/state.integration.test.ts` currently passes at `CLI_TIMEOUTS_MS.STATUS_CHECK_AVG = 15`.
  The current test proves a weaker threshold than the node declares.
