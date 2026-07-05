# Review

PROVIDES the review verification-type boundary for platform-neutral formal review evidence
SO THAT review producers, GitHub backends, local renderers, and other delivery surfaces
CAN persist formal-review-shaped evidence under `--verification-type review` without exposing provider-specific command vocabulary

## Assertions

### Compliance

- NEVER: review command vocabulary exposes GitHub review subcommands or provider-specific review comment verbs; provider handling stays in payloads and backend projection ([test](tests/review-command-surface.compliance.l1.test.ts))
