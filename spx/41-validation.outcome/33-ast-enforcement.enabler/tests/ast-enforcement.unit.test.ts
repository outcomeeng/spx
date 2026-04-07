import noBddTryCatchAntiPattern from "@eslint-rules/no-bdd-try-catch-anti-pattern";
import noSpecReferences from "@eslint-rules/no-spec-references";
import { testRestrictedSyntax, tsRestrictedSyntax } from "@eslint-rules/restricted-syntax";
import { RuleTester } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import tseslint from "typescript-eslint";
import { beforeEach, describe, expect, it } from "vitest";

const noRestrictedSyntax = builtinRules.get("no-restricted-syntax")!;

// Prevent RuleTester from calling vitest's global describe/it (globals: true conflict)
RuleTester.describe = (_text, method) => method();
RuleTester.it = (_text, method) => method();
(RuleTester as unknown as Record<string, unknown>).afterAll = () => {};

/**
 * Evidence: RuleTester exercises ESLint selectors and custom rule modules
 * with genuine coupling — importing the actual config arrays and rule modules,
 * running them through the real ESLint rule engine.
 */

// ---------------------------------------------------------------------------
// Global TypeScript conventions (tsRestrictedSyntax)
// ---------------------------------------------------------------------------

describe("tsRestrictedSyntax selectors", () => {
  let ruleTester: RuleTester;

  beforeEach(() => {
    ruleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        parser: tseslint.parser,
      },
    });
  });

  it("TSEnumDeclaration maps to lint error", () => {
    expect(() => {
      ruleTester.run(
        "no-restricted-syntax",
        noRestrictedSyntax,
        {
          valid: [
            {
              code: "const Direction = { Up: 'up', Down: 'down' } as const;",
              options: tsRestrictedSyntax,
            },
          ],
          invalid: [
            {
              code: "enum Direction { Up, Down }",
              options: tsRestrictedSyntax,
              errors: [{ message: tsRestrictedSyntax[0].message }],
            },
          ],
        },
      );
    }).not.toThrow();
  });

  it("as any type assertion maps to lint error", () => {
    expect(() => {
      ruleTester.run(
        "no-restricted-syntax",
        noRestrictedSyntax,
        {
          valid: [
            {
              code: "const x = value as unknown;",
              options: tsRestrictedSyntax,
            },
          ],
          invalid: [
            {
              code: "const x = value as any;",
              options: tsRestrictedSyntax,
              errors: [{ message: tsRestrictedSyntax[1].message }],
            },
          ],
        },
      );
    }).not.toThrow();
  });

  it("<any> type assertion maps to lint error", () => {
    expect(() => {
      ruleTester.run(
        "no-restricted-syntax",
        noRestrictedSyntax,
        {
          valid: [
            {
              code: "const x = value as unknown;",
              options: tsRestrictedSyntax,
            },
          ],
          invalid: [
            {
              code: "const x = <any>value;",
              options: tsRestrictedSyntax,
              errors: [{ message: tsRestrictedSyntax[2].message }],
            },
          ],
        },
      );
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Test evidence quality (testRestrictedSyntax)
// ---------------------------------------------------------------------------

describe("testRestrictedSyntax selectors", () => {
  let ruleTester: RuleTester;

  beforeEach(() => {
    ruleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
      },
    });
  });

  it("vi.mock() maps to lint error", () => {
    expect(() => {
      ruleTester.run(
        "no-restricted-syntax",
        noRestrictedSyntax,
        {
          valid: [
            {
              code: "const deps = { fetch: async () => new Response() };",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            },
          ],
          invalid: [
            {
              code: "vi.mock(\"../src/database\");",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
              errors: [{ message: testRestrictedSyntax[0].message }],
            },
          ],
        },
      );
    }).not.toThrow();
  });

  it("vi.fn() maps to lint error", () => {
    expect(() => {
      ruleTester.run(
        "no-restricted-syntax",
        noRestrictedSyntax,
        {
          valid: [
            {
              code: "const stub = { call: async () => ({ ok: true }) };",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            },
          ],
          invalid: [
            {
              code: "const fn = vi.fn();",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
              errors: [{ message: testRestrictedSyntax[1].message }],
            },
          ],
        },
      );
    }).not.toThrow();
  });

  it("skipIf maps to lint error", () => {
    expect(() => {
      ruleTester.run(
        "no-restricted-syntax",
        noRestrictedSyntax,
        {
          valid: [
            {
              code: "it('always runs', () => { expect(true).toBe(true); });",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            },
          ],
          invalid: [
            {
              code: "it.skipIf(process.env.CI)('skipped', () => {});",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
              errors: [{ message: testRestrictedSyntax[3].message }],
            },
          ],
        },
      );
    }).not.toThrow();
  });

  it("string literal in assertion maps to lint error", () => {
    expect(() => {
      ruleTester.run(
        "no-restricted-syntax",
        noRestrictedSyntax,
        {
          valid: [
            {
              code: "expect(typeof value).toBe(\"string\");",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            },
          ],
          invalid: [
            {
              code: "expect(name).toBe(\"alice\");",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
              errors: [{ message: testRestrictedSyntax[2].message }],
            },
          ],
        },
      );
    }).not.toThrow();
  });

  it("readFileSync import maps to lint error", () => {
    expect(() => {
      ruleTester.run(
        "no-restricted-syntax",
        noRestrictedSyntax,
        {
          valid: [
            {
              code: "import { resolve } from 'node:path';",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
            },
          ],
          invalid: [
            {
              code: "import { readFileSync } from 'node:fs';",
              options: [...tsRestrictedSyntax, ...testRestrictedSyntax],
              errors: [{ message: testRestrictedSyntax[4].message }],
            },
          ],
        },
      );
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Custom rule module: no-spec-references
// ---------------------------------------------------------------------------

describe("no-spec-references", () => {
  let ruleTester: RuleTester;

  beforeEach(() => {
    ruleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
      },
    });
  });

  describe("valid cases — no violations", () => {
    it("allows non-spec string literals", () => {
      expect(() => {
        ruleTester.run(
          "no-spec-references",
          noSpecReferences,
          {
            valid: [
              "const name = \"authentication module\";",
              "const desc = \"handles data retrieval\";",
              "const version = `v2.0.0`;",
            ],
            invalid: [],
          },
        );
      }).not.toThrow();
    });

    it("allows spec references in the exempt rule file", () => {
      expect(() => {
        ruleTester.run(
          "no-spec-references",
          noSpecReferences,
          {
            valid: [
              {
                code: "const PATTERN = /ADR-15/;",
                filename: "eslint-rules/no-spec-references.ts",
              },
            ],
            invalid: [],
          },
        );
      }).not.toThrow();
    });
  });

  describe("invalid cases — detects violations", () => {
    it("detects numbered ADR reference with hyphen", () => {
      expect(() => {
        ruleTester.run(
          "no-spec-references",
          noSpecReferences,
          {
            valid: [],
            invalid: [
              {
                code: "const ref = \"See ADR-21 for details\";",
                errors: [{ messageId: "specReference" }],
              },
            ],
          },
        );
      }).not.toThrow();
    });

    it("detects numbered PDR reference", () => {
      expect(() => {
        ruleTester.run(
          "no-spec-references",
          noSpecReferences,
          {
            valid: [],
            invalid: [
              {
                code: "const ref = \"Per PDR-15\";",
                errors: [{ messageId: "specReference" }],
              },
            ],
          },
        );
      }).not.toThrow();
    });

    it("detects ADR reference with space separator", () => {
      expect(() => {
        ruleTester.run(
          "no-spec-references",
          noSpecReferences,
          {
            valid: [],
            invalid: [
              {
                code: "const ref = \"ADR 21 compliance\";",
                errors: [{ messageId: "specReference" }],
              },
            ],
          },
        );
      }).not.toThrow();
    });

    it("detects spec reference in template literals", () => {
      expect(() => {
        ruleTester.run(
          "no-spec-references",
          noSpecReferences,
          {
            valid: [],
            invalid: [
              {
                code: "const msg = `Per ADR-32 requirements`;",
                errors: [{ messageId: "specReference" }],
              },
            ],
          },
        );
      }).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Custom rule module: no-bdd-try-catch-anti-pattern
// ---------------------------------------------------------------------------

describe("no-bdd-try-catch-anti-pattern", () => {
  let ruleTester: RuleTester;

  beforeEach(() => {
    ruleTester = new RuleTester({
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
      },
    });
  });

  it("allows try-catch with re-throw", () => {
    expect(() => {
      ruleTester.run(
        "no-bdd-try-catch-anti-pattern",
        noBddTryCatchAntiPattern,
        {
          valid: [
            "try { expect(x).toBe(y); } catch (e) { throw e; }",
          ],
          invalid: [],
        },
      );
    }).not.toThrow();
  });

  it("allows try-catch without expect calls", () => {
    expect(() => {
      ruleTester.run(
        "no-bdd-try-catch-anti-pattern",
        noBddTryCatchAntiPattern,
        {
          valid: [
            "try { doSomething(); } catch (e) { console.log(e); }",
          ],
          invalid: [],
        },
      );
    }).not.toThrow();
  });

  it("detects empty catch swallowing assertion failures", () => {
    expect(() => {
      ruleTester.run(
        "no-bdd-try-catch-anti-pattern",
        noBddTryCatchAntiPattern,
        {
          valid: [],
          invalid: [
            {
              code: "try { expect(x).toBe(y); } catch (e) {}",
              errors: [{ messageId: "emptySwallowing" }],
            },
          ],
        },
      );
    }).not.toThrow();
  });

  it("detects non-rethrowing catch hiding assertions", () => {
    expect(() => {
      ruleTester.run(
        "no-bdd-try-catch-anti-pattern",
        noBddTryCatchAntiPattern,
        {
          valid: [],
          invalid: [
            {
              code: "try { expect(x).toBe(y); } catch (e) { console.log(\"swallowed\"); }",
              errors: [{ messageId: "hiddenAssertions" }],
            },
          ],
        },
      );
    }).not.toThrow();
  });
});
