# Content Projection

PROVIDES opt-in exact document content for the read class — strict UTF-8 bodies, raw-byte digests naming the hash algorithm, and byte counts — with atomic failure on any unreadable or undecodable document
SO THAT machine consumers of `spx/31-spec-domain.enabler/43-context-ingestion.enabler` output
CAN load every read-required byte from one response without agent-side file orchestration or partial context

## Assertions

### Scenarios

- Given the machine output mode requests document content, when the manifest is built, then every read entry carries the document's exact UTF-8 content, its raw-byte digest naming the hash algorithm, and its byte count, and no listed entry carries content, digest, or byte count ([test](tests/content.scenario.l1.test.ts))
- Given a read document whose bytes are not valid UTF-8, when document content is requested, then the command fails naming the exact document path ([test](tests/content.scenario.l1.test.ts))
- Given a read document that cannot be read, when document content is requested, then the command fails naming the exact document path ([test](tests/content.scenario.l1.test.ts))
- Given a citation-scanned structural document that cannot be read, when document content is not requested, then the document stays a read entry and the command succeeds ([test](tests/content.scenario.l1.test.ts))
- Given the machine output mode does not request document content, when the manifest is built, then no entry carries content, digest, or byte count ([test](tests/content.scenario.l1.test.ts))
