# Known Issues

## Process-exit removal evidence declares l2 above its floor `spx/13-temp-directory.substrate/tests/run-root.scenario.l2.test.ts` `Given a process that created a root, when it exits normally, then the root and everything inside it is removed` `evidence uses the lowest level that proves the assertion`

The file `spx/13-temp-directory.substrate/tests/run-root.scenario.l2.test.ts` carries the `l2` level in its name while its child process runs checkout source through the dev-environment tsx runner and a standard subprocess. Under the executable discriminator both executables are supplied by the declared development environment or the checkout, which classifies the evidence `l1`. The level-selection rule that evidence uses the lowest level that proves the assertion therefore places the file at `l1`.

**Impact:** the filename declares a heavier level than the evidence needs, so level-based test selection treats this evidence as heavier than it is. The evidence still proves the assertion that a process which created a root removes the root and everything inside it on normal exit.

**Settlement condition:** the filename level equals the level the executable discriminator assigns to the executables the evidence exercises, and the spec assertion's test link names the file at that level.

## Git-ceiling evidence declares l2 above its floor `spx/13-temp-directory.substrate/tests/git-ceiling.scenario.l2.test.ts` `Given a directory inside a run root that holds no repository of its own, when git runs there under the environment the primitive exports, then git finds no repository` `evidence uses the lowest level that proves the assertion`

The file `spx/13-temp-directory.substrate/tests/git-ceiling.scenario.l2.test.ts` carries the `l2` level in its name while its child process uses the tsx runner and standard git. Under the executable discriminator both executables are supplied by the declared development environment or the checkout, which classifies the evidence `l1`. The level-selection rule that evidence uses the lowest level that proves the assertion therefore places the file at `l1`.

**Impact:** the filename declares a heavier level than the evidence needs, so level-based test selection treats this evidence as heavier than it is. The evidence still fails when the ceiling export is removed, so it proves the assertion that git finds no repository in a run-root directory under the exported environment.

**Settlement condition:** the filename level equals the level the executable discriminator assigns to the executables the evidence exercises, and the spec assertion's test link names the file at that level.
