# Issues

- Benchmark target evidence drift:
  The story and feature declare `<100ms for 50 work items`, but the current E2E tests pass at `CLI_TIMEOUTS_MS.E2E = 10000` wall-clock milliseconds and use `CLI_TIMEOUTS_MS.E2E_BATCH = 45000` for batched cases.
  The current tests prove suite-load-tolerant subprocess timing, not the declared `<100ms` benchmark.
