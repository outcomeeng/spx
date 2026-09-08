# Issues

## The producer overclaims on a large release range and the faithfulness audit rejects every attempt

The release-notes producer receives the release version and the commit subjects and is instructed to describe user-visible behavior and omit spec-only, test-only, release-mechanics, and internal implementation changes. On a range of roughly two hundred commits since the previous tag, four consecutive `spx release notes` runs for `0.6.27` each produced a section the faithfulness auditor rejected, every time for a different entry that inferred a user-visible effect from a subject that carries none:

- an "Added" entry claiming the property harness gained a capability its subjects do not name;
- a "Fixed" entry claiming literal detection "no longer" does something the subject does not state;
- a "Changed" entry claiming release command help "now describes" an option, from `refactor(cli): name the release changelog-path option descriptions`, which only names an existing description constant;
- a "Changed" entry claiming documentation "now covers" the publication workflow, from `docs(release)` and `docs(agent)` subjects about the product's own release procedure and agent instructions.

The audit is correct each time, so nothing is promoted and the release cannot proceed past its notes step.

**Impact:** a release whose range is dominated by spec, test, refactor, and docs commits has no path through `spx release notes`; the operator sees a rejection per attempt and no changelog section.

**Resolution condition:** the producer's input or instruction excludes the classes the spec already declares omitted — a subject whose conventional type is `spec`, `test`, `refactor`, `docs`, `style`, `ci`, or `build` describes no user-visible behavior unless its body says otherwise — so an inference from such a subject is not available to the producer, and the audit's rule and the producer's rule agree. Declare the exclusion in `spx/26-release.enabler/32-release-notes.enabler/release-notes.md`, cover it with the prompt-assembly compliance evidence, and confirm a release over a comparable range promotes on the first attempt.
