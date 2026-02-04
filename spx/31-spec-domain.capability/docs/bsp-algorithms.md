# BSP Algorithms

BSP (Binary Space Partitioning) encodes dependency order among siblings. Lower BSP = dependency that higher BSP may rely on.

## Fundamentals

### Number Space

| Property            | Value                                   |
| ------------------- | --------------------------------------- |
| Range               | 10-99 (two digits)                      |
| First item          | Start at 21 (room for ~10 items before) |
| Recursion delimiter | `@`                                     |
| Recursive range     | Each `@` opens a new 10-99 space        |

### Semantics

| Relationship | Meaning                                       |
| ------------ | --------------------------------------------- |
| A < B        | A is a dependency; B may rely on A            |
| A = B        | A and B are independent; can work in parallel |
| A > B        | A depends on B completing first               |

## Insertion Algorithms

### Append (After Last Sibling)

Add a new item after the highest existing BSP.

```
newBSP = floor((lastBSP + 99) / 2)
```

**Example**: Append after `54`

```
floor((54 + 99) / 2) = floor(153 / 2) = 76
```

Result: `76-new-item`

### Insert (Between Two Siblings)

Add a new item between two existing BSPs.

```
newBSP = floor((lowerBSP + higherBSP) / 2)
```

**Example**: Insert between `21` and `54`

```
floor((21 + 54) / 2) = floor(75 / 2) = 37
```

Result: `37-new-item`

### Prepend (Before First Sibling)

Add a new item before the lowest existing BSP.

```
newBSP = floor((10 + firstBSP) / 2)
```

**Example**: Prepend before `21`

```
floor((10 + 21) / 2) = floor(31 / 2) = 15
```

Result: `15-new-item`

### Recursive Insert (No Integer Space)

When there's no integer between adjacent BSPs, recurse into the lower number.

**Example**: Insert between `20` and `21`

No integer between 20 and 21, so recurse into 20:

```
20 @ floor((10 + 99) / 2) = 20@54
```

Result: `20@54-new-item`

### Deep Recursion

Continue recursing as needed.

**Example**: Insert between `20@54` and `20@55`

```
20@54 @ floor((10 + 99) / 2) = 20@54@54
```

Result: `20@54@54-new-item`

## Sorting Algorithm

BSP values sort lexicographically with special handling for `@`.

### Sort Key Generation

Convert BSP to a sortable key by padding each segment:

```typescript
function bspSortKey(bsp: string): string {
  return bsp
    .split("@")
    .map(segment => segment.padStart(2, "0"))
    .join("@");
}
```

### Sort Order

```typescript
function compareBsp(a: string, b: string): number {
  const keyA = bspSortKey(a);
  const keyB = bspSortKey(b);
  return keyA.localeCompare(keyB);
}
```

### Example Sort

Input: `['32', '21', '20@54', '20', '20@54@32']`

Keys: `['32', '21', '20@54', '20', '20@54@32']`

Sorted: `['20', '20@54', '20@54@32', '21', '32']`

## Implementation

```typescript
const BSP_MIN = 10;
const BSP_MAX = 99;
const BSP_START = 21;

interface BspContext {
  siblings: string[]; // Existing BSP values at this level
}

function nextBsp(context: BspContext): string {
  if (context.siblings.length === 0) {
    return String(BSP_START);
  }

  const sorted = [...context.siblings].sort(compareBsp);
  const last = sorted[sorted.length - 1];
  const lastNum = parseTopLevel(last);

  if (lastNum < BSP_MAX - 1) {
    return String(Math.floor((lastNum + BSP_MAX) / 2));
  }

  // No room at top level, need to recurse
  return `${lastNum}@${BSP_START}`;
}

function insertBspBetween(lower: string, higher: string): string {
  const lowerNum = parseTopLevel(lower);
  const higherNum = parseTopLevel(higher);

  const mid = Math.floor((lowerNum + higherNum) / 2);

  if (mid > lowerNum && mid < higherNum) {
    return String(mid);
  }

  // No room, recurse into lower
  return `${lowerNum}@${BSP_START}`;
}

function parseTopLevel(bsp: string): number {
  const firstSegment = bsp.split("@")[0];
  return parseInt(firstSegment, 10);
}
```

## Parallel Work

Items with the **same BSP** can be worked on in parallel:

```
21-setup/           ← Must complete first
37-auth/            ← All three depend on 21
37-profile/         ← but NOT on each other
37-settings/        ← can work in parallel
54-integration/     ← Depends on ALL 37s completing
```

## Rebalancing

When recursion depth exceeds 3 levels (`20@50@50@50`), consider rebalancing:

1. Identify the congested range
2. Redistribute items across available BSP space
3. Rename directories (requires `spx` CLI support)

**Rebalancing is rare** — the 10-99 range per level provides ~89 insertion points before recursion is needed.

## Edge Cases

### First Item in Empty Container

```typescript
function firstBsp(): string {
  return String(BSP_START); // "21"
}
```

### Collision Detection

Before inserting, verify the BSP doesn't already exist:

```typescript
function isAvailable(bsp: string, existing: string[]): boolean {
  return !existing.includes(bsp);
}
```

### Maximum Depth Warning

```typescript
function recursionDepth(bsp: string): number {
  return bsp.split("@").length;
}

function shouldWarnRebalance(bsp: string): boolean {
  return recursionDepth(bsp) >= 3;
}
```
