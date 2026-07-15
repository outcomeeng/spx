/**
 * Domain type definitions for the CLI router
 */
import type { Command } from "commander";

import type { CliInvocation } from "@/interfaces/cli/product-context";

/**
 * Represents a CLI domain (e.g., spec, config, test)
 */
export interface Domain {
  /** Domain name (singular, lowercase) */
  name: string;
  /** Description shown in help text */
  description: string;
  /** Function to register commands for this domain */
  register: (program: Command, invocation: CliInvocation) => void;
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
