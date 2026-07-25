/**
 * Domain descriptor for the CLI router.
 */
import type { Command } from "commander";

import type { CliInvocation } from "@/interfaces/cli/product-context";

/** Represents a CLI domain such as spec, config, or test. */
export interface Domain {
  /** Domain name (singular, lowercase) */
  name: string;
  /** Description shown in help text */
  description: string;
  /** Function to register commands for this domain */
  register: (program: Command, invocation: CliInvocation) => void;
}
