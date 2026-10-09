# Issues: CLI surface

## The verification command-surface property blurs the `--run` count per command path

**Evidence:** Product property 1 of [`spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md`](spx/60-surfaces.enabler/21-cli-surface.enabler/13-verify-command-surface.pdr.md) states: "run token option grammar is `--run <run-token>`, which each existing-run command path requires once and `compare` requires twice, each value naming a run of the Change `--change` names". `compare` is itself an existing-run command path, so the sentence reads as requiring `--run` once on every path and twice on `compare` at once. A PDR audit of that decision raised the ambiguity as a WARNING.

**Impact:** a reader of the property cannot tell from it alone that `compare` takes exactly two `--run` values and every other existing-run command path exactly one; only the decision's Testing rule on existing-run command paths states that split.

**Settlement condition:** Product property 1 states the count of `--run` values per command path unambiguously, and a PDR audit of the decision raises no finding on it.
