/**
 * The one comparison of spec-tree indices, a leaf module so assembly and context selection
 * share it without importing each other.
 *
 * @module lib/spec-tree/order
 */

const ORDER_EQUAL = 0;

/**
 * Compares two indices segment by segment, numerically, with a prefix before every index it
 * prefixes. A negative result places `left` as the provider of `right`, zero means the same
 * index, and a positive result places `left` as the consumer.
 */
export function compareSpecTreeOrder(left: readonly number[], right: readonly number[]): number {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== ORDER_EQUAL) return difference;
  }
  return left.length - right.length;
}
