# Known Issues: 87-spec-tree-projection.enabler

## f-001: The projected order reverses the dependency order for multi-segment indices

`projectedOrder()` in `src/lib/spec-tree/index.ts` computes `Number.parseFloat(orderSegments.join('.'))`, so a segment of two digits is read as a decimal fraction. The index paths [20,2] and [20,10] project to 20.2 and 20.1, and the index paths [20,9] and [20,10] project to 20.9 and 20.1. `compareSpecTreeOrder` in `src/lib/spec-tree/order.ts` compares the same paths segment by segment, numerically, and places [20,2] before [20,10] and [20,9] before [20,10]. The projected order places each pair in the reverse sequence.

**Impact:** A consumer that orders by the projected order disagrees with the tree's dependency order.

**Settlement condition:** The projected order agrees with `compareSpecTreeOrder` for multi-segment indices.
