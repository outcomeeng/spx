/**
 * Domain registry for managing CLI domains
 */
import type { Domain } from "./types";

const domains = new Map<string, Domain>();

/**
 * Register a domain
 *
 * @param domain - Domain to register
 * @throws Error if domain name already registered
 *
 * @example
 * ```typescript
 * registerDomain({
 *   name: "spec",
 *   description: "Manage spec workflow",
 *   register: (program) => {
 *     // Register commands...
 *   }
 * });
 * ```
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
 *
 * @example
 * ```typescript
 * const specDomain = getDomain("spec");
 * if (specDomain) {
 *   specDomain.register(program);
 * }
 * ```
 */
export function getDomain(name: string): Domain | undefined {
  return domains.get(name);
}

/**
 * Get all registered domains
 *
 * @returns Array of all registered domains
 *
 * @example
 * ```typescript
 * const allDomains = getAllDomains();
 * console.log(`Registered domains: ${allDomains.map(d => d.name).join(", ")}`);
 * ```
 */
export function getAllDomains(): Domain[] {
  return Array.from(domains.values());
}

/**
 * Clear all registered domains (for testing)
 *
 * @example
 * ```typescript
 * // In test setup
 * beforeEach(() => {
 *   clearDomains();
 * });
 * ```
 */
export function clearDomains(): void {
  domains.clear();
}
