# Story: Validate BSP Numbers

## Functional Requirements

### FR1: Validate BSP range (10-99)

```gherkin
GIVEN a work item number
WHEN validating the BSP number
THEN accept numbers in range [10, 99] and reject others
```

#### Files created/modified

1. `src/scanner/validation.ts` [new]: Implement `isValidBSPNumber()` function
2. `src/scanner/patterns.ts` [modify]: Integrate BSP validation into parsing

### FR2: Reject numbers outside range with clear errors

```gherkin
GIVEN an invalid BSP number (< 10 or > 99)
WHEN parsing a work item name
THEN throw descriptive error indicating the valid range
```

#### Files created/modified

1. `src/scanner/validation.ts` [modify]: Add error message generation
2. `src/scanner/patterns.ts` [modify]: Use validation and propagate errors

### FR3: Detect BSP numbering violations (optional for this story)

```gherkin
GIVEN a list of work items with BSP numbers
WHEN checking for numbering violations
THEN identify duplicates and out-of-order sequences
```

**Note**: This FR is optional for the minimal implementation. It may be deferred to a future story if checking entire trees is out of scope for pattern matching.

#### Files created/modified

1. `src/scanner/validation.ts` [modify]: Add `checkBSPOrdering()` function (optional)

## Testing Strategy

> Use `/testing-typescript` skill to understn

### Level Assignment

| Component                | Level | Justification                  |
| ------------------------ | ----- | ------------------------------ |
| BSP range validation     | 1     | Pure function, number checking |
| Error message generation | 1     | Pure function                  |
| Duplicate detection      | 1     | Pure function (if implemented) |

### When to Escalate

This story stays at Level 1 because:

- Number validation is pure logic
- No external dependencies
- Range checking is deterministic

## Unit Tests (Level 1)

```typescript
// test/unit/scanner/validation.test.ts
import { describe, expect, it } from "vitest";
import { isValidBSPNumber, validateBSPNumber } from "../../../src/scanner/validation";

describe("isValidBSPNumber", () => {
  /**
   * Level 1: Pure function tests for BSP number validation
   */

  it("GIVEN number 10 WHEN validating THEN returns true", () => {
    // Given/When
    const result = isValidBSPNumber(10);

    // Then
    expect(result).toBe(true);
  });

  it("GIVEN number 99 WHEN validating THEN returns true", () => {
    // Given/When
    const result = isValidBSPNumber(99);

    // Then
    expect(result).toBe(true);
  });

  it("GIVEN number 50 WHEN validating THEN returns true", () => {
    // Given/When
    const result = isValidBSPNumber(50);

    // Then
    expect(result).toBe(true);
  });

  it("GIVEN number 9 WHEN validating THEN returns false", () => {
    // Given/When
    const result = isValidBSPNumber(9);

    // Then
    expect(result).toBe(false);
  });

  it("GIVEN number 100 WHEN validating THEN returns false", () => {
    // Given/When
    const result = isValidBSPNumber(100);

    // Then
    expect(result).toBe(false);
  });

  it("GIVEN number 0 WHEN validating THEN returns false", () => {
    // Given/When
    const result = isValidBSPNumber(0);

    // Then
    expect(result).toBe(false);
  });

  it("GIVEN negative number WHEN validating THEN returns false", () => {
    // Given/When
    const result = isValidBSPNumber(-1);

    // Then
    expect(result).toBe(false);
  });
});

describe("validateBSPNumber", () => {
  it("GIVEN valid BSP number WHEN validating THEN returns number", () => {
    // Given
    const number = 20;

    // When
    const result = validateBSPNumber(number);

    // Then
    expect(result).toBe(20);
  });

  it("GIVEN number too low WHEN validating THEN throws descriptive error", () => {
    // Given
    const number = 5;

    // When/Then
    expect(() => validateBSPNumber(number)).toThrow(
      "BSP number must be between 10 and 99, got 5",
    );
  });

  it("GIVEN number too high WHEN validating THEN throws descriptive error", () => {
    // Given
    const number = 100;

    // When/Then
    expect(() => validateBSPNumber(number)).toThrow(
      "BSP number must be between 10 and 99, got 100",
    );
  });
});
```

```typescript
// test/unit/scanner/patterns.test.ts (integration with validation)
describe("parseWorkItemName - BSP Validation Integration", () => {
  it("GIVEN work item with valid BSP number WHEN parsing THEN succeeds", () => {
    // Given
    const dirName = "capability-50_test";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result.number).toBe(50);
  });

  it("GIVEN work item with BSP number too low WHEN parsing THEN throws error", () => {
    // Given
    const dirName = "capability-09_test";

    // When/Then
    expect(() => parseWorkItemName(dirName)).toThrow(
      "BSP number must be between 10 and 99",
    );
  });

  it("GIVEN work item with BSP number too high WHEN parsing THEN throws error", () => {
    // Given
    const dirName = "feature-100_test";

    // When/Then
    expect(() => parseWorkItemName(dirName)).toThrow(
      "BSP number must be between 10 and 99",
    );
  });
});
```

## Quality Requirements

### QR1: Type Safety

**Requirement:** Validation functions have strict type signatures
**Target:** `isValidBSPNumber(n: number): boolean` and `validateBSPNumber(n: number): number`
**Validation:** TypeScript enforces types

### QR2: Error Messages

**Requirement:** Error messages include the invalid value and valid range
**Target:** Format: "BSP number must be between 10 and 99, got {value}"
**Validation:** Unit tests verify error message format

### QR3: Integration

**Requirement:** `parseWorkItemName` uses validation automatically
**Target:** No need to call validation separately
**Validation:** Parsing tests verify validation is applied

## Completion Criteria

- [ ] All Level 1 unit tests pass
- [ ] BSP range [10, 99] enforced
- [ ] Error messages are descriptive and include actual value
- [ ] `parseWorkItemName` integrates validation
- [ ] BDD structure (GIVEN/WHEN/THEN) in all tests

## Documentation

1. JSDoc comments on validation functions
2. Examples of error messages in documentation
3. BSP range documented in function comments
