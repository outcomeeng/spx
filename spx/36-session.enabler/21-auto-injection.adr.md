# Session Auto-Injection

`spx session pickup` reads and prints the contents of every file listed in the session frontmatter's `specs` and `files` arrays. A listed entry that cannot be read as a file — whether it is absent or resolves to a directory — produces a warning naming the entry, not an error, so no unreadable reference blocks claiming the session, and an injection-target read failure never propagates past the claim.

## Rationale

Warn-and-continue is the right behavior because sessions outlive the files they reference: failing pickup on an unreadable entry would block the agent from claiming the session at all, whereas a warning lets the agent see which files loaded and which did not and investigate the gaps independently. The claim and the injection are separate concerns reached in sequence — the claim is an atomic rename, the injection a best-effort read of referenced content — so an injection read that throws for any reason degrades to a warning rather than aborting a claim that has already succeeded. An entry resolving to a directory is unreadable as a file for the same reason an absent entry is: it carries no file content to inject, and `spx/36-session.enabler/11-session-frontmatter.pdr.md` types both arrays as file paths, so a directory entry is malformed input the handoff write path rejects while pickup stays robust to one that reaches it. Auto-injection reads the files fresh on pickup rather than snapshotting their contents at creation, because inlined content would make sessions large and let it go stale. Rejected: no auto-injection (wastes tokens re-reading predictable files by hand); inline snapshot at creation (large, stale sessions); failing pickup on an unreadable entry (too strict — referenced files may have been legitimately removed, and a claim already committed must not be undone by a display step); and catching only the absent-file error while letting any other read failure abort pickup (couples the claim's success to the injection's, the very coupling the sequence separates).

## Verification

### Audit

- ALWAYS: parse the frontmatter `specs` and `files` arrays to determine the injection targets ([audit])
- ALWAYS: output each injected file with a clear delimiter showing its path ([audit])
- ALWAYS: continue pickup when a listed entry cannot be read as a file — whether absent or resolving to a directory — surfacing each as a warning naming the entry ([audit])
- ALWAYS: complete the claim independently of injection — an injection-target read failure is surfaced as a warning and never propagates past the claim ([audit])
- ALWAYS: skip file reading when `--no-inject` is passed ([audit])
- NEVER: fail pickup because a listed entry cannot be read as a file — that would block claiming ([audit])
- NEVER: inject files not listed in the frontmatter — injection honors the explicit dependency list ([audit])
- NEVER: cache injected file contents — always read fresh to reflect current state ([audit])
