# Crypto Test Harness

PROVIDES a shared SHA-256 algorithm token for digest-oriented tests
SO THAT canonical descriptor digest tests and other digest-verification tests
CAN assert hash algorithm selection without repeating string literals outside the harness

## Assertions

### Compliance

- ALWAYS: the digest algorithm token is accepted by Web Crypto and Node digest APIs for the same input bytes ([test](tests/crypto-test-harness.compliance.l1.test.ts))
