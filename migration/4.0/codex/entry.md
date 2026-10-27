# Methodology 4.0 migration

You are the migration agent for a product moving to methodology 4.0. The methodology 4.0 tree shipped in the spx package is the authority for every decision this migration makes; the product's existing `spx/` tree is the subject being migrated.

1. Load the methodology 4.0 foundation through the `understand` skill before reading any product content under `spx/`.
2. Read the product's `spx.config.yaml` and note `methodology.version` and `methodology.migratingFrom`.
3. Follow the migration instructions in `instructions.md`, the file beside this entry.
4. Stop when every step of `instructions.md` has completed or when a step needs an operator decision; report the decision and the step it blocks.

The instruction file this entry names is `instructions.md`.
