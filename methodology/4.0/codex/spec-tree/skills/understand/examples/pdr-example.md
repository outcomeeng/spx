# Product Offering

The open-source tier includes the complete CLI toolchain — spec authoring, tree operations, test integration, and status derivation — positioned as a complete, production-ready toolchain, not a limited trial. Commercial tiers add collaboration, hosting, and analytics.

## Rationale

Developers adopt tools that solve their immediate problem without friction, and a complete CLI creates bottom-up demand within organizations. A free tier that feels incomplete sends developers to alternatives instead of upgrading. Rejected alternatives: freemium with feature gates (creates resentment) and open-core with a plugin architecture (complexity without a clear value boundary).

## Product properties

1. The CLI toolchain is always fully functional without authentication or license keys.
2. Every feature documented in the open-source docs works without a commercial account.

## Verification

### Testing

- ALWAYS: present the OSS tier as the full core toolchain — users can do all individual work without paying ([compliance])
- ALWAYS: document all CLI features in the open-source documentation ([conformance])
- NEVER: gate CLI functionality behind authentication — breaks trust positioning ([property])
- NEVER: reference commercial-only features in CLI help text — creates confusion about what's available ([compliance])
