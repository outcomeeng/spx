# Run Payload Directory

CONSTRAINS where a verification run's staged payloads live and when their directory exists
TO one payload directory per run that the command layer addresses through the state module's branch scope under the run's opening namespace, creates at `start` after the run's journal, sweeps at each `start`, and removes when `finish` seals the run
SO THAT every worktree that continues a run resolves the same payload directory, a run-relative payload name never reads outside it, and no sealed run's payloads remain on disk

## Verification

### Audit: payload directory

- payload-directory-addressing: ALWAYS: the command layer obtains a run's payload directory from the state module's branch scope addressing under the run's opening namespace, keyed by the verification type and the run token, creates it at `start` after the run's journal exists for every run whichever party drives it, and resolves every run-relative payload name against it, rejecting a name whose path, resolved through symbolic links by the injected filesystem, lies outside it before any read.
- payload-directory-sweep: ALWAYS: the command layer sweeps at `start`, before its own run's directory exists: it lists the payload directories under every verification type's payload root, finds each run token's journal across every branch scope of the repository-shared store, and removes through the injected filesystem only the directories whose journal carries a terminal-completion event or a seal.
- seal-removes-payload-directory: ALWAYS: `finish` removes the run's payload directory through the injected filesystem after it seals the run journal, and removes nothing when it records no terminal completion; a removal that fails leaves the run sealed, leaves the directory for the next `start` sweep, and returns the failure, naming the directory, in `finish`'s result.
