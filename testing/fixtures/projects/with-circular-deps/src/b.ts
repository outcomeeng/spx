// Intentional circular dependency: b.ts imports a.ts, a.ts imports b.ts
import { functionA } from "./a";

export function functionB(): string {
  return `B calls ${functionA()}`;
}
