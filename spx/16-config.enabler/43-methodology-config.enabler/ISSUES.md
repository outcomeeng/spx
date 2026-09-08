# Open Issues

## The descriptor treats the methodology declaration as a plugin coordinate

**Evidence:** `src/config/methodology.ts` defaults `source` to
`outcomeeng/spec-tree`, a repository slated for deletion, and `version` to the
sentinel `installed`, which `methodologyVersionIntent` classifies as bootstrap
intent. It carries a `packageDir` field naming where the methodology package
is installed, consumed by `src/commands/spec/context.ts`,
`src/interfaces/hooks/session-start.ts`, and
`src/lib/methodology/compact-recovery.ts`. `methodology-config.md` asserts the
legacy default and the sentinel (lines 11, 21), and asserts that `source` is
path-safe "before any consumer builds a filesystem path from it" (line 22),
an owner/repository identifier being used as a directory name. No field
carries the version the product migrates from.

**Impact:** a product resolving without a `methodology` section points at a
repository that will not exist; a product with no version declared reads as
having one; three consumers locate the methodology through a config field
that names a filesystem location instead of the committed tree spx ships.

**Settlement condition:** the descriptor carries `source` as the
`owner/repository` the methodology is published from with
`outcomeeng/methodology` as its default, `version` as one exact methodology
version with no default and no sentinel, and `migratingFrom` as one exact
version present only while a transition is open; `packageDir` and
`methodologyVersionIntent` are gone and the three consumers read spx's own
`methodology/{MAJOR.MINOR}/{coding-agent}/spec-tree/` tree; the spec's
assertions on lines 11, 21, and 22 are replaced accordingly.
