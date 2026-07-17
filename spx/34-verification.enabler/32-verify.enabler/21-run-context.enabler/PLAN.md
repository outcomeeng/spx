# Plan: decompose run context

Run `/decompose` before the next change that adds, removes, or materially rewrites a run-context assertion. The node carries thirteen assertions across run startup, scope resolution, locator reporting, recorded-input replay, and drive-mode recording; `/decompose` owns the resulting child boundaries, dependency edges, and indices.

## Revisit condition

Re-enter this plan before an implementation slice changes the assertion set or adds another scope type. Remove the plan after the resulting structure reaches the default branch.
