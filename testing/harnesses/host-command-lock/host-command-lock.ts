/**
 * Harness for the host command lock: one in-memory host.
 *
 * The host stands in for every outside dependency of the guard: a fake monotonic clock that sleeps
 * advance, a scripted load source, an in-memory orchestration lock file and filesystem, a recording
 * lock primitive over a model of open file descriptions, a process spawner whose children the test
 * exits, and the supervisor's signal listeners. Nothing here starts a process, takes a kernel lock,
 * sends a signal, or reads host load. The lock primitive double models the one property the guard
 * relies on, that a slot lasts while any open description of the locked file lives, so the evidence
 * covers the guard's own handling of that property and says nothing about the kernel's.
 *
 * Every member returns handles and observations; the linked tests own every predicate.
 *
 * @module host-command-lock/testing/host-command-lock
 */
import {
  type Environment,
  type HolderRecord,
  type HostCommandLockDeps,
  type HostCommandLockFilesystem,
  type LoadSample,
  LOCK_ENV,
  type LockBinding,
  type Platform,
  RESULT_STATUS,
  SUPPORTED_PLATFORM,
} from "@/lib/host-command-lock";
import {
  createGuardedSupervisor,
  createSignalSuspender,
  GUARDED_DESCRIPTOR_NUMBER,
  GUARDED_SIGNALS,
  type GuardedSpawn,
  type GuardedSupervisionRequest,
  type GuardedSupervisor,
  INHERITED_STDIO,
} from "@/lib/process-lifecycle";
import { arbitraryHostIdentity, type HostIdentity } from "@testing/generators/host-command-lock/host-command-lock";
import { arbitrarySpawnFailureMessage } from "@testing/generators/process-lifecycle/guarded-supervision";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  DeliveringSignalTarget,
  RecordingGuardedChild,
} from "@testing/harnesses/process-lifecycle/guarded-supervision";
import type { SpawnOptions } from "node:child_process";

const SETTLE_TURNS = 2_000;
const UNOPENED_DESCRIPTOR_OFFSET = 10_000;

/** What the host observed, in the order it happened. */
export const EVENT_KIND = {
  ENSURE_DIRECTORY: "ensure-directory",
  OPEN_LOCK_FILE: "open-lock-file",
  LOCK_TAKEN: "lock-taken",
  SAMPLE: "sample",
  RECORD_WRITE: "record-write",
  SPAWN: "spawn",
  CHILD_EXIT: "child-exit",
} as const;

export type EventKind = (typeof EVENT_KIND)[keyof typeof EVENT_KIND];

export interface HostEvent {
  readonly kind: EventKind;
  readonly pid?: number;
}

/** The point at which a supervisor stops forever, as a killed process does. */
export const SUPERVISOR_DEATH = {
  BEFORE_SPAWN: "before-spawn",
  BEFORE_GROUP_RECORD: "before-group-record",
  AFTER_GROUP_RECORD: "after-group-record",
} as const;

export type SupervisorDeath = (typeof SUPERVISOR_DEATH)[keyof typeof SUPERVISOR_DEATH];

/** Thrown inside a supervisor that stops at the point its script names. */
class SupervisorDied extends Error {}

const GROUP_RECORD_WRITE_ORDINAL = 2;

export interface MemoryHostOptions {
  readonly cpuCount: number;
  /** Samples served in order from the first sample after the slot is held; the last repeats. */
  readonly samples: readonly Omit<LoadSample, "atMs">[];
  /** Extra fake-clock milliseconds that pass before the sample at the given index is taken. */
  readonly stallBeforeSampleMs?: Readonly<Record<number, number>>;
  /** Fake-clock reading until which a run outside this host holds the slot; infinity holds it for good. */
  readonly externalHolderUntilMs?: number;
  /** Randomized delays served in order to busy retries; the last repeats. */
  readonly retryJitters?: readonly number[];
  readonly ownerUid?: number;
  readonly regularFile?: boolean;
  readonly localStorage?: boolean;
  /** The failure opening the lock file reports, such as a refused symbolic link. */
  readonly openFailure?: Error;
  /** The lock file at the path becomes a different inode at the moment the lock is taken. */
  readonly pathReplacedOnLock?: boolean;
}

/** What differs from one guarded run to the next on the same host. */
export interface RunScript {
  readonly environment?: Environment;
  readonly platform?: Platform;
  readonly runId?: string;
  /** Children of this run exit at once with this code; without it the test exits them. */
  readonly childExitCode?: number;
  readonly loadFailure?: Error;
  readonly sleepFailure?: Error;
  readonly spawnFailure?: Error;
  readonly supervisorDeath?: SupervisorDeath;
}

export interface SpawnedChild {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions;
  readonly child: RecordingGuardedChild;
}

/** A descriptor an outer guarded command passes down, as a nested call finds it. */
export interface OuterSlot {
  readonly descriptor: number;
  readonly environment: Record<string, string>;
}

export interface OuterSlotOptions {
  /** Whether the outer description still holds the lock; defaults to true. */
  readonly holdsLock?: boolean;
  /** The file the descriptor refers to; defaults to the orchestration lock file. */
  readonly descriptorFileId?: string;
}

interface Description {
  copies: number;
  readonly fileId: string;
}

export class MemoryHost {
  readonly identity: HostIdentity;
  readonly events: HostEvent[] = [];
  readonly sleeps: number[] = [];
  readonly sampleTimesMs: number[] = [];
  readonly lockTakenAtMs: number[] = [];
  readonly busyAttemptsAtMs: number[] = [];
  readonly unlocks: number[] = [];
  readonly directoriesEnsured: string[] = [];
  readonly lockFilesOpened: number[] = [];
  readonly recordWrites: HolderRecord[] = [];
  readonly spawns: SpawnedChild[] = [];
  readonly groupKills: Array<{ readonly pid: number; readonly signal: NodeJS.Signals }> = [];
  readonly signals = new DeliveringSignalTarget();
  /** Called after every sleep with the number of sleeps so far. */
  onSleep: ((count: number) => void) | undefined;
  /** The number of spawned children at the moment a scheduled child exit fired. */
  spawnsAtScheduledExit: number | undefined;

  private clockMs = 0;
  private nextDescriptor: number;
  private nextDescription = 0;
  private slotHolder: number | undefined;
  private pathFileId: string;
  private recordAttempts = 0;
  private dieOnRecordAttempt: number | undefined;
  private jitterIndex = 0;
  private readonly descriptions = new Map<number, Description>();
  private readonly descriptors = new Map<number, number>();
  private readonly supervisorDescriptors = new Set<number>();

  constructor(private readonly options: MemoryHostOptions) {
    this.identity = sampleGeneratedValue(arbitraryHostIdentity());
    this.nextDescriptor = this.identity.firstDescriptor;
    this.pathFileId = this.identity.fileId;
  }

  /** A descriptor number no description holds. */
  get unopenedDescriptor(): number {
    return this.identity.firstDescriptor + UNOPENED_DESCRIPTOR_OFFSET;
  }

  nowMs(): number {
    return this.clockMs;
  }

  /** The kinds of events in order, a run of the same kind counted once. */
  kinds(): EventKind[] {
    return this.events
      .map((event) => event.kind)
      .filter((kind, index, kinds) => index === 0 || kinds[index - 1] !== kind);
  }

  /** The most recent holder record written through a locked descriptor. */
  holderRecord(): HolderRecord | undefined {
    return this.recordWrites[this.recordWrites.length - 1];
  }

  slotHeld(): boolean {
    return this.slotHolder !== undefined;
  }

  /** The number of descriptors the guard itself still holds open. */
  openSupervisorDescriptors(): number {
    return this.supervisorDescriptors.size;
  }

  /** The descriptor numbers of the lock file opens, in order. */
  lockDescriptors(): number[] {
    return [...this.lockFilesOpened];
  }

  /** Dependencies for one guarded run over this host. */
  deps(script: RunScript = {}): Partial<HostCommandLockDeps> {
    this.dieOnRecordAttempt = script.supervisorDeath === SUPERVISOR_DEATH.BEFORE_GROUP_RECORD
      ? GROUP_RECORD_WRITE_ORDINAL
      : this.dieOnRecordAttempt;
    let sampleIndex = 0;
    return {
      lockPath: this.identity.lockPath,
      environment: script.environment ?? {},
      platform: script.platform ?? SUPPORTED_PLATFORM,
      clock: { nowMs: () => this.clockMs },
      wallClockMs: () => this.identity.startedAtMs,
      sleep: async (ms) => {
        if (script.sleepFailure !== undefined) throw script.sleepFailure;
        this.clockMs += ms;
        this.sleeps.push(ms);
        this.onSleep?.(this.sleeps.length);
        await settle();
      },
      randomDelayMs: () => this.nextJitter(),
      loadSource: {
        cpuCount: this.options.cpuCount,
        sample: () => {
          if (script.loadFailure !== undefined) throw script.loadFailure;
          this.clockMs += this.options.stallBeforeSampleMs?.[sampleIndex] ?? 0;
          this.sampleTimesMs.push(this.clockMs);
          this.events.push({ kind: EVENT_KIND.SAMPLE });
          const sample = this.options.samples[Math.min(sampleIndex, this.options.samples.length - 1)];
          sampleIndex += 1;
          return { ...sample, atMs: this.clockMs };
        },
      },
      binding: this.binding,
      filesystem: this.filesystem,
      spawn: this.spawnFor(script),
      createSupervisor: (spawnChild) => this.supervisorFor(script.supervisorDeath, spawnChild),
      generateRunId: () => script.runId ?? this.identity.generatedRunId,
      processId: this.identity.supervisorPid,
      workingDirectory: this.identity.workingDirectory,
    };
  }

  /** Resolves once at least `count` children have been spawned. */
  async untilSpawned(count: number): Promise<void> {
    for (let turn = 0; turn < SETTLE_TURNS; turn += 1) {
      if (this.spawns.length >= count) return;
      await settle();
    }
    throw new Error(`Expected ${count} spawned children, saw ${this.spawns.length}`);
  }

  /** Lets queued work run, so a test can observe a run that has not settled. */
  async settle(turns: number): Promise<void> {
    for (let turn = 0; turn < turns; turn += 1) await settle();
  }

  exitChild(index: number, code: number | null, signal: NodeJS.Signals | null = null): void {
    this.spawns[index].child.emitExit(code, signal);
  }

  /** Exits the child at `index` with `code` when the host has slept `sleeps` more times. */
  scheduleChildExit(index: number, code: number, sleeps: number): void {
    const target = this.sleeps.length + sleeps;
    this.onSleep = (count) => {
      if (count !== target) return;
      this.spawnsAtScheduledExit = this.spawns.length;
      this.exitChild(index, code);
    };
  }

  /** The supervisor process dies: the kernel closes every descriptor it still holds. */
  killSupervisor(): void {
    for (const descriptor of [...this.supervisorDescriptors]) this.closeDescriptor(descriptor);
  }

  /** An outer guarded command's description of the lock file, as a nested call inherits it. */
  holdOuterSlot(options: OuterSlotOptions = {}): OuterSlot {
    const descriptor = this.openDescription(options.descriptorFileId ?? this.identity.fileId);
    this.supervisorDescriptors.delete(descriptor);
    if (options.holdsLock ?? true) this.slotHolder = this.descriptors.get(descriptor);
    return {
      descriptor,
      environment: {
        [LOCK_ENV.FD]: String(descriptor),
        [LOCK_ENV.FILE_ID]: this.identity.fileId,
      },
    };
  }

  private nextJitter(): number {
    const jitters = this.options.retryJitters ?? [0];
    const jitter = jitters[Math.min(this.jitterIndex, jitters.length - 1)];
    this.jitterIndex += 1;
    return jitter;
  }

  private openDescription(fileId: string): number {
    const descriptor = this.nextDescriptor;
    this.nextDescriptor += 1;
    const description = this.nextDescription;
    this.nextDescription += 1;
    this.descriptions.set(description, { copies: 1, fileId });
    this.descriptors.set(descriptor, description);
    this.supervisorDescriptors.add(descriptor);
    return descriptor;
  }

  private descriptionOf(descriptor: number): number {
    const description = this.descriptors.get(descriptor);
    if (description === undefined) throw new Error(`Bad descriptor ${descriptor}`);
    return description;
  }

  private releaseCopy(description: number): void {
    const held = this.descriptions.get(description) as Description;
    held.copies -= 1;
    if (held.copies === 0 && this.slotHolder === description) this.slotHolder = undefined;
  }

  private closeDescriptor(descriptor: number): void {
    const description = this.descriptors.get(descriptor);
    if (description === undefined) return;
    this.descriptors.delete(descriptor);
    this.supervisorDescriptors.delete(descriptor);
    this.releaseCopy(description);
  }

  private readonly binding: LockBinding = {
    tryLock: (descriptor) => {
      const description = this.descriptionOf(descriptor);
      if (this.slotHolder === description) return true;
      const external = this.clockMs < (this.options.externalHolderUntilMs ?? 0);
      if (this.slotHolder !== undefined || external) {
        this.busyAttemptsAtMs.push(this.clockMs);
        return false;
      }
      this.slotHolder = description;
      this.lockTakenAtMs.push(this.clockMs);
      this.events.push({ kind: EVENT_KIND.LOCK_TAKEN });
      if (this.options.pathReplacedOnLock) this.pathFileId = this.identity.otherFileId;
      return true;
    },
    unlock: (descriptor) => {
      this.unlocks.push(descriptor);
    },
  };

  private readonly filesystem: HostCommandLockFilesystem = {
    ensureDirectory: (path) => {
      this.directoriesEnsured.push(path);
      this.events.push({ kind: EVENT_KIND.ENSURE_DIRECTORY });
    },
    openLockFile: () => {
      this.events.push({ kind: EVENT_KIND.OPEN_LOCK_FILE });
      if (this.options.openFailure !== undefined) throw this.options.openFailure;
      const descriptor = this.openDescription(this.pathFileId);
      this.lockFilesOpened.push(descriptor);
      return descriptor;
    },
    openProbe: () => this.openDescription(this.pathFileId),
    close: (descriptor) => {
      this.closeDescriptor(descriptor);
    },
    ownerOf: () => this.options.ownerUid ?? (process.getuid?.() as number),
    isRegularFile: () => this.options.regularFile ?? true,
    fileIdOfDescriptor: (descriptor) => {
      const description = this.descriptions.get(this.descriptionOf(descriptor)) as Description;
      return description.fileId;
    },
    fileIdOfPath: (path) => (path === this.identity.lockPath ? this.pathFileId : undefined),
    isLocalStorage: () => this.options.localStorage ?? true,
    writeHolderRecord: (_descriptor, record) => {
      this.recordAttempts += 1;
      if (this.recordAttempts === this.dieOnRecordAttempt) throw new SupervisorDied();
      this.recordWrites.push(record);
      this.events.push({ kind: EVENT_KIND.RECORD_WRITE });
    },
  };

  private spawnFor(script: RunScript): GuardedSpawn {
    return (command, args, options) => {
      if (script.spawnFailure !== undefined) throw script.spawnFailure;
      const pid = this.identity.childPids[this.spawns.length];
      const child = new RecordingGuardedChild(pid);
      const stdio = Array.isArray(options.stdio) ? options.stdio : [];
      const inherited = stdio[GUARDED_DESCRIPTOR_NUMBER];
      const description = typeof inherited === "number" ? this.descriptors.get(inherited) : undefined;
      if (description !== undefined) (this.descriptions.get(description) as Description).copies += 1;
      child.once("exit", () => {
        this.events.push({ kind: EVENT_KIND.CHILD_EXIT, pid });
        if (description !== undefined) this.releaseCopy(description);
      });
      this.spawns.push({ command, args, options, child });
      this.events.push({ kind: EVENT_KIND.SPAWN, pid });
      if (script.childExitCode !== undefined) {
        const code = script.childExitCode;
        setImmediate(() => child.emitExit(code, null));
      }
      return child;
    };
  }

  private supervisorFor(death: SupervisorDeath | undefined, spawnChild: GuardedSpawn): GuardedSupervisor {
    if (death === undefined) {
      return createGuardedSupervisor({
        spawn: spawnChild,
        signalTarget: this.signals,
        signalSuspender: createSignalSuspender(this.signals, GUARDED_SIGNALS),
        killProcessGroup: (pid, signal) => {
          this.groupKills.push({ pid, signal });
        },
        closeDescriptor: (descriptor) => {
          this.closeDescriptor(descriptor);
        },
      });
    }
    return {
      run: async (request: GuardedSupervisionRequest) => {
        if (death !== SUPERVISOR_DEATH.BEFORE_SPAWN) {
          try {
            spawnChild(request.command, request.args, {
              stdio: [INHERITED_STDIO, INHERITED_STDIO, INHERITED_STDIO, request.descriptor],
              detached: true,
            });
          } catch (error) {
            if (!(error instanceof SupervisorDied)) throw error;
          }
        }
        return new Promise<number>(() => undefined);
      },
    };
  }
}

function settle(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

const OTHER_ACCOUNT_UID_OFFSET = 1;

/** Lock files that violate the discipline, each paired with the host options that model the violation. */
export const VIOLATING_LOCK_FILES: ReadonlyArray<readonly [string, Partial<MemoryHostOptions>]> = [
  ["fails to open", { openFailure: new Error(sampleGeneratedValue(arbitrarySpawnFailureMessage())) }],
  ["is owned by another account", { ownerUid: (process.getuid?.() as number) + OTHER_ACCOUNT_UID_OFFSET }],
  ["is not a regular file", { regularFile: false }],
  ["lies on storage that is not local", { localStorage: false }],
  ["is replaced by a different inode when the lock is taken", { pathReplacedOnLock: true }],
];

/** A nested call's context: a name, the environment it inherits from a host, and the status it fails with. */
export type NestedContextCase = readonly [string, (host: MemoryHost) => Record<string, string>, string];

/** Nested contexts that must never start their command. */
export const UNUSABLE_NESTED_CONTEXTS: readonly NestedContextCase[] = [
  [
    "a descriptor variable that is absent",
    (host) => ({ [LOCK_ENV.FILE_ID]: host.identity.fileId }),
    RESULT_STATUS.NESTED_CONTEXT_INVALID,
  ],
  [
    "a descriptor that is not open",
    (host) => ({ [LOCK_ENV.FD]: String(host.unopenedDescriptor), [LOCK_ENV.FILE_ID]: host.identity.fileId }),
    RESULT_STATUS.NESTED_CONTEXT_INVALID,
  ],
  [
    "a file identity variable that is absent",
    (host) => ({ [LOCK_ENV.FD]: String(host.holdOuterSlot().descriptor) }),
    RESULT_STATUS.NESTED_CONTEXT_INVALID,
  ],
  [
    "a descriptor that refers to another file",
    (host) => host.holdOuterSlot({ descriptorFileId: host.identity.otherFileId }).environment,
    RESULT_STATUS.NESTED_CONTEXT_INVALID,
  ],
  [
    "a descriptor whose description no longer holds the lock",
    (host) => host.holdOuterSlot({ holdsLock: false }).environment,
    RESULT_STATUS.NESTED_CONTEXT_INVALID,
  ],
  [
    "a lock file other than the one it resolves",
    (host) => ({ ...host.holdOuterSlot().environment, [LOCK_ENV.FILE_ID]: host.identity.otherFileId }),
    RESULT_STATUS.NESTED_LOCK_MISMATCH,
  ],
];
