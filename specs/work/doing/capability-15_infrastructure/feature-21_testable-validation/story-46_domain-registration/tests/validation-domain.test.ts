/**
 * Unit tests for the validation domain.
 *
 * Level 1 tests verifying the domain structure and interface compliance.
 */
import { describe, expect, it } from "vitest";

import type { Domain } from "@/domains/types";
import { validationDomain } from "@/domains/validation";

describe("Validation Domain", () => {
  describe("GIVEN the validation domain export", () => {
    it("THEN it implements the Domain interface", () => {
      // Verify the domain has all required properties
      const domain: Domain = validationDomain;

      expect(domain).toHaveProperty("name");
      expect(domain).toHaveProperty("description");
      expect(domain).toHaveProperty("register");
      expect(typeof domain.name).toBe("string");
      expect(typeof domain.description).toBe("string");
      expect(typeof domain.register).toBe("function");
    });

    it("THEN it has the correct name", () => {
      expect(validationDomain.name).toBe("validation");
    });

    it("THEN it has a meaningful description", () => {
      expect(validationDomain.description).toBe("Run code validation tools");
    });
  });

  describe("GIVEN the register function", () => {
    it("WHEN called with a Commander program THEN it registers the validation command", () => {
      // Create a mock program to verify registration
      const registeredCommands: string[] = [];
      const mockCommand = {
        command: (name: string) => {
          registeredCommands.push(name);
          return mockCommand;
        },
        alias: () => mockCommand,
        description: () => mockCommand,
        addHelpText: () => mockCommand,
        option: () => mockCommand,
        action: () => mockCommand,
      };
      const mockProgram = {
        command: (name: string) => {
          registeredCommands.push(name);
          return mockCommand;
        },
      };

      // Register the domain
      validationDomain.register(mockProgram as never);

      // Verify the validation command was registered
      expect(registeredCommands).toContain("validation");
    });
  });
});
