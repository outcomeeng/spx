// Intentional circular dependency: a.ts imports b.ts, b.ts imports a.ts
import { functionB } from "./b";

export function functionA(): string {
  return `A calls ${functionB()}`;
}
