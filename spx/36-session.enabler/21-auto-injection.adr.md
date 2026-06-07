# Session Auto-Injection

`spx session pickup` reads and prints the contents of every file listed in the session frontmatter's `specs` and `files` arrays. A listed file that no longer exists produces a warning, not an error, so a missing reference never blocks claiming the session.

## Rationale

Warn-and-continue is the right behavior because sessions outlive the files they reference: failing pickup on a missing file would block the agent from claiming the session at all, whereas a warning lets the agent see which files loaded and which did not and investigate the gaps independently. Auto-injection reads the files fresh on pickup rather than snapshotting their contents at creation, because inlined content would make sessions large and let it go stale. Rejected: no auto-injection (wastes tokens re-reading predictable files by hand); inline snapshot at creation (large, stale sessions); and failing pickup on a missing file (too strict — referenced files may have been legitimately removed).

## Verification

### Audit

- ALWAYS: parse the frontmatter `specs` and `files` arrays to determine the injection targets ([audit])
- ALWAYS: output each injected file with a clear delimiter showing its path ([audit])
- ALWAYS: continue pickup when some listed files do not exist, surfacing each as a warning ([audit])
- ALWAYS: skip file reading when `--no-inject` is passed ([audit])
- NEVER: fail pickup because a listed file does not exist — that would block claiming ([audit])
- NEVER: inject files not listed in the frontmatter — injection honors the explicit dependency list ([audit])
- NEVER: cache injected file contents — always read fresh to reflect current state ([audit])
