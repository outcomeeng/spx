# Open Issues

## The artifact journal store ADR cites the offline guarantee at the Product spec

**Evidence:** [21-artifact-journal-store-architecture.adr.md](21-artifact-journal-store-architecture.adr.md) cites the product's offline-first core as `spx/spx.product.md`: never require network access for core operations. The Product spec states no guarantee; the rule is `offline-core` of [spx/11-command-guarantees.pdr.md](spx/11-command-guarantees.pdr.md).

**Impact:** a reader who follows the citation finds no offline rule in the Product spec.

**Settlement condition:** the ADR cites `offline-core` of [spx/11-command-guarantees.pdr.md](spx/11-command-guarantees.pdr.md), or cites nothing for it.
