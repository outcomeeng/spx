# Plan: decompose the context-ingestion contract

This node's spec carries 17 assertions across four typed headings — past the
`>7` decompose trigger in the root routing guide. A `/decompose` pass should
split the contract into child enablers (candidate boundaries: read-set
projection, citation provenance, content projection) with the operator
choosing indices.

Run the decomposition only after the open target-resolution changeset for this
node (PR #402, `work/spec-context-prefixes`) reaches the default branch — it
edits this node's spec and tests, and restructuring under it would force a
conflicting rebase of in-flight work.
