# Plan: Verify Command Surface

1. Add the `spx/34-verification.enabler/32-verify.enabler` tests that lock the `start`, `input`, `append-scope`, `append-finding`, `finish`, `status`, and `render` lifecycle.
2. Implement `src/domains/verify/`, `src/commands/verify/`, and `src/interfaces/cli/verify.ts` per `spx/34-verification.enabler/32-verify.enabler/13-verify-module-structure.adr.md`.
3. Wire review-run callers to `spx verify --verification-type review --scope-type changeset --scope <base>..<head> --input stdin [--run <run-token>] <verb>` and remove wrapper-owned journal-event construction.
4. Keep prompt wording changes separate from the CLI-interface slice; the command contract is the durable interface that prompt cleanup consumes.
