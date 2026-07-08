# Issues: Changed-Set Planning

## Related-test resolution misses changed source files

Evidence command: `tsx src/cli.ts test --changed --base origin/main`

Result: the command exited 0 after running 282 files and 1788 tests, but stderr reported that no related-test capability resolved these changed source files:

- `src/commands/agent/search.ts`
- `src/domains/agent/transcript-json.ts`

Revisit condition: when extending `spx/41-test.enabler/95-changed-set-planning.enabler`, add related-test resolution coverage so these source paths resolve to owning spec tests without broad fallback selection.
