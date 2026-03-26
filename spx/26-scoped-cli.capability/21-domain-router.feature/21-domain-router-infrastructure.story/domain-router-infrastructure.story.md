# Story: Domain Router Infrastructure

## Functional Requirements

### FR1: Define domain type and interface

```gherkin
GIVEN CLI architecture
WHEN defining domain structure
THEN create type-safe domain registration interface
```

#### Files created/modified

1. `src/types.ts` [modify]: Add `Domain` and `DomainCommand` types
2. `src/domains/types.ts` [new]: Domain-specific type definitions

**Type Definition**:

```typescript
// src/domains/types.ts
import type { Command } from "commander";

/**
 * Represents a CLI domain (e.g., spec, claude, marketplace)
 */
export interface Domain {
  /** Domain name (singular, lowercase) */
  name: string;
  /** Description shown in help text */
  description: string;
  /** Function to register commands for this domain */
  register: (program: Command) => void;
}

/**
 * Configuration for a domain command
 */
export interface DomainCommand {
  /** Command name (e.g., "status", "next") */
  name: string;
  /** Description shown in help text */
  description: string;
  /** Whether this command is deprecated */
  deprecated?: boolean;
  /** Deprecation message if applicable */
  deprecationMessage?: string;
}
```

### FR2: Create domain registry pattern

```gherkin
GIVEN domain definitions
WHEN registering domains
THEN provide centralized domain management
```

#### Files created/modified

1. `src/domains/registry.ts` [new]: Domain registration and lookup

**Implementation**:

```typescript
// src/domains/registry.ts
import type { Domain } from "./types.js";

const domains = new Map<string, Domain>();

/**
 * Register a domain
 *
 * @param domain - Domain to register
 * @throws Error if domain name already registered
 */
export function registerDomain(domain: Domain): void {
  if (domains.has(domain.name)) {
    throw new Error(`Domain "${domain.name}" already registered`);
  }
  domains.set(domain.name, domain);
}

/**
 * Get registered domain by name
 *
 * @param name - Domain name
 * @returns Domain if found, undefined otherwise
 */
export function getDomain(name: string): Domain | undefined {
  return domains.get(name);
}

/**
 * Get all registered domains
 *
 * @returns Array of all registered domains
 */
export function getAllDomains(): Domain[] {
  return Array.from(domains.values());
}

/**
 * Clear all registered domains (for testing)
 */
export function clearDomains(): void {
  domains.clear();
}
```

### FR3: Create spec domain stub

```gherkin
GIVEN domain registry
WHEN defining spec domain
THEN create stub that will be implemented in story-32
```

#### Files created/modified

1. `src/domains/spec/index.ts` [new]: Spec domain definition (stub for story-32)

**Stub Implementation**:

```typescript
// src/domains/spec/index.ts
import type { Command } from "commander";
import type { Domain } from "../types.js";

/**
 * Spec domain - Manage spec workflow
 *
 * Commands will be implemented in story-32
 */
export const specDomain: Domain = {
  name: "spec",
  description: "Manage spec workflow",
  register: (program: Command) => {
    // TODO: Implement in story-32
    // Will add: status, next commands
  },
};
```

## Testing Strategy

### Level Assignment

| Component        | Level | Justification                                      |
| ---------------- | ----- | -------------------------------------------------- |
| Type definitions | 1     | Pure TypeScript types, compile-time verification   |
| Domain registry  | 1     | Pure functions with Map data structure, no I/O     |
| Domain lookup    | 1     | Pure function logic, testable without Commander.js |

### No Escalation Needed

Level 1 is sufficient because:

- Type definitions are verified at compile time
- Registry is pure in-memory data structure
- No filesystem, no external dependencies
- Logic is simple CRUD operations on a Map

## Unit Tests (Level 1)

```typescript
// specs/doing/capability-26_scoped-cli/feature-21_domain-router/story-21_domain-router-infrastructure/tests/domain-registry.test.ts
import { clearDomains, getAllDomains, getDomain, registerDomain } from "@/domains/registry";
import type { Domain } from "@/domains/types";
import { beforeEach, describe, expect, it } from "vitest";

describe("Domain Registry", () => {
  beforeEach(() => {
    clearDomains();
  });

  describe("registerDomain", () => {
    it("GIVEN domain definition WHEN registering THEN domain is stored", () => {
      // Given: A domain definition
      const domain: Domain = {
        name: "spec",
        description: "Manage spec workflow",
        register: () => {},
      };

      // When: Registering the domain
      registerDomain(domain);

      // Then: Domain can be retrieved
      const retrieved = getDomain("spec");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("spec");
      expect(retrieved?.description).toBe("Manage spec workflow");
    });

    it("GIVEN existing domain WHEN registering duplicate THEN throws error", () => {
      // Given: A registered domain
      const domain: Domain = {
        name: "spec",
        description: "Manage spec workflow",
        register: () => {},
      };
      registerDomain(domain);

      // When/Then: Registering duplicate throws
      expect(() => registerDomain(domain)).toThrow(
        "Domain \"spec\" already registered",
      );
    });

    it("GIVEN multiple domains WHEN registering THEN all are stored", () => {
      // Given: Multiple domain definitions
      const spec: Domain = {
        name: "spec",
        description: "Manage spec workflow",
        register: () => {},
      };
      const claude: Domain = {
        name: "claude",
        description: "Manage Claude Code plugins",
        register: () => {},
      };

      // When: Registering both domains
      registerDomain(spec);
      registerDomain(claude);

      // Then: Both can be retrieved
      expect(getDomain("spec")).toBeDefined();
      expect(getDomain("claude")).toBeDefined();
      expect(getAllDomains()).toHaveLength(2);
    });
  });

  describe("getDomain", () => {
    it("GIVEN registered domain WHEN getting by name THEN returns domain", () => {
      // Given: A registered domain
      const domain: Domain = {
        name: "spec",
        description: "Manage spec workflow",
        register: () => {},
      };
      registerDomain(domain);

      // When: Getting domain by name
      const retrieved = getDomain("spec");

      // Then: Returns correct domain
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("spec");
    });

    it("GIVEN no registered domain WHEN getting by name THEN returns undefined", () => {
      // Given: Empty registry
      // When: Getting non-existent domain
      const retrieved = getDomain("nonexistent");

      // Then: Returns undefined
      expect(retrieved).toBeUndefined();
    });
  });

  describe("getAllDomains", () => {
    it("GIVEN empty registry WHEN getting all domains THEN returns empty array", () => {
      // Given: Empty registry
      // When: Getting all domains
      const domains = getAllDomains();

      // Then: Returns empty array
      expect(domains).toEqual([]);
    });

    it("GIVEN multiple domains WHEN getting all THEN returns all in array", () => {
      // Given: Multiple registered domains
      const spec: Domain = {
        name: "spec",
        description: "Manage spec workflow",
        register: () => {},
      };
      const claude: Domain = {
        name: "claude",
        description: "Manage Claude Code plugins",
        register: () => {},
      };
      registerDomain(spec);
      registerDomain(claude);

      // When: Getting all domains
      const domains = getAllDomains();

      // Then: Returns array with both domains
      expect(domains).toHaveLength(2);
      expect(domains.map((d) => d.name)).toEqual(
        expect.arrayContaining(["spec", "claude"]),
      );
    });
  });

  describe("clearDomains", () => {
    it("GIVEN registered domains WHEN clearing THEN registry is empty", () => {
      // Given: Registered domain
      const domain: Domain = {
        name: "spec",
        description: "Manage spec workflow",
        register: () => {},
      };
      registerDomain(domain);
      expect(getAllDomains()).toHaveLength(1);

      // When: Clearing domains
      clearDomains();

      // Then: Registry is empty
      expect(getAllDomains()).toHaveLength(0);
      expect(getDomain("spec")).toBeUndefined();
    });
  });
});
```

```typescript
// specs/doing/capability-26_scoped-cli/feature-21_domain-router/story-21_domain-router-infrastructure/tests/spec-domain.test.ts
import { specDomain } from "@/domains/spec/index";
import { describe, expect, it } from "vitest";

describe("Spec Domain Stub", () => {
  it("GIVEN spec domain WHEN accessing properties THEN has correct metadata", () => {
    // Given: Spec domain definition
    // When: Accessing properties
    // Then: Has correct name and description
    expect(specDomain.name).toBe("spec");
    expect(specDomain.description).toBe("Manage spec workflow");
    expect(specDomain.register).toBeDefined();
    expect(typeof specDomain.register).toBe("function");
  });
});
```

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] Domain types defined in `src/domains/types.ts`
- [ ] Domain registry implemented in `src/domains/registry.ts`
- [ ] Spec domain stub created in `src/domains/spec/index.ts`
- [ ] All exports use `.js` extensions (TypeScript ESM requirement)
- [ ] 100% type coverage
- [ ] No runtime dependencies (pure TypeScript)

## Implementation Notes

### Why No Level 2?

This story focuses on **data structures and pure functions**:

- Domain registry is an in-memory Map
- All functions are synchronous and pure
- No external dependencies (filesystem, Commander.js, etc.)
- Logic can be fully tested at Level 1

**Commander.js integration** happens in story-32, which requires Level 2 tests.

### Design Decisions

1. **Map over Array**: Domain registry uses `Map<string, Domain>` for O(1) lookup by name
2. **Function-based API**: Registry uses functions instead of class for simplicity and testability
3. **Clear separation**: Domain definitions (story-21) vs command implementation (story-32)

### TypeScript ESM Requirements

All imports must use `.js` extensions per TypeScript ESM spec:

```typescript
// ✅ Correct
import type { Domain } from "./types.js";

// ❌ Wrong
import type { Domain } from "./types";
```
