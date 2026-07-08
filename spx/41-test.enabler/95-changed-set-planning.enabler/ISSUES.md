# Issues: Changed-Set Planning

## Related-test resolution misses changed source files

Evidence command: `tsx src/cli.ts test --changed --base origin/main`

Result: the command exited 0 after running 335 files and 2070 tests, but stderr reported that no related-test capability resolved these changed source files:

- `src/commands/agent/search.ts`
- `src/domains/agent/transcript-json.ts`
- `testing/harnesses/precommit/deps-install-gate.ts`
- `testing/harnesses/precommit/entrypoint.ts`
- `testing/harnesses/precommit/hook-install.ts`
- `testing/harnesses/precommit/main-checkout-gate.ts`
- `testing/harnesses/precommit/scenarios.ts`
- `testing/harnesses/precommit/subprocess-env.ts`

Revisit condition: when extending `spx/41-test.enabler/95-changed-set-planning.enabler`, add related-test resolution coverage so these source and harness paths resolve to owning spec tests without broad fallback selection.
