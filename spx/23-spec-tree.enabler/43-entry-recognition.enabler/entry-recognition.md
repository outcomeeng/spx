# Entry Recognition

PROVIDES registry-backed recognition of spec-tree product files, node directories, and decision files
SO THAT source adapters for filesystems, issue trackers, ORMs, and paper-ledger transcriptions
CAN convert raw backend records into typed source entries without owning kind vocabulary

## Assertions

### Mappings

- `{NN}-{slug}{nodeSuffix}` directory names map to node kind, order, and slug when `nodeSuffix` belongs to a registered node kind ([test](tests/entry-recognition.mapping.l1.test.ts))
- `{NN}-{slug}{decisionSuffix}` filenames map to decision kind, order, and slug when `decisionSuffix` belongs to a registered decision kind ([test](tests/entry-recognition.mapping.l1.test.ts))
- Product filenames ending in `.product.md` map to product entries with the product title derived from the filename slug ([test](tests/entry-recognition.mapping.l1.test.ts))
- Directory and file suffixes absent from the semantic registry map to no current spec-tree entry ([test](tests/entry-recognition.mapping.l1.test.ts))

### Compliance

- ALWAYS: entry recognition derives categories, suffixes, and labels from the semantic registry ([test](tests/entry-recognition.mapping.l1.test.ts))
- NEVER: entry recognition contains compatibility branches for `.capability`, `.feature`, or `.story` suffixes ([test](tests/entry-recognition.mapping.l1.test.ts))
