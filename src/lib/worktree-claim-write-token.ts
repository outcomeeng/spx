/**
 * Claim-write token generator for atomic worktree occupancy writes.
 *
 * @module lib/worktree-claim-write-token
 */

import { randomBytes as nodeRandomBytes } from "node:crypto";

const CLAIM_WRITE_TOKEN_BYTES = 8;

export type RandomBytes = (size: number) => Buffer;

export function createClaimWriteToken(randomBytes: RandomBytes = nodeRandomBytes): string {
  return randomBytes(CLAIM_WRITE_TOKEN_BYTES).toString("hex");
}
