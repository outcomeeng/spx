import type { ActionsArtifactClient, ActionsArtifactSummary } from "@/lib/artifact-journal-store";

interface StoredArtifact {
  readonly body: string;
  readonly expired: boolean;
}

/**
 * In-memory {@link ActionsArtifactClient} for artifact-journal-store tests,
 * exercised through dependency injection. Records every upload and serves
 * list-by-prefix and download from the same in-memory map a real Actions
 * artifact store would, so a sealed run round-trips through it without a network.
 */
export class InMemoryActionsArtifactClient implements ActionsArtifactClient {
  private readonly store = new Map<string, StoredArtifact>();
  readonly uploads: Array<{ name: string; body: string }> = [];

  /** Seed a prior run's artifact, optionally already expired, before a hydration. */
  seed(args: { name: string; body: string; expired: boolean }): void {
    this.store.set(args.name, { body: args.body, expired: args.expired });
  }

  async uploadArtifact(args: { name: string; body: string }): Promise<void> {
    this.uploads.push(args);
    this.store.set(args.name, { body: args.body, expired: false });
  }

  async listArtifacts(args: { namePrefix: string }): Promise<readonly ActionsArtifactSummary[]> {
    return [...this.store.entries()]
      .filter(([name]) => name.startsWith(args.namePrefix))
      .map(([name, artifact]) => ({ name, expired: artifact.expired }));
  }

  async downloadArtifact(args: { name: string }): Promise<string> {
    const artifact = this.store.get(args.name);
    if (artifact === undefined) throw new Error(`actions artifact not found: ${args.name}`);
    // The real Actions API rejects an expired artifact's download; modelling that
    // here makes any caller that skips the expiry guard fail in tests, not only in production.
    if (artifact.expired) throw new Error(`actions artifact is expired and cannot be downloaded: ${args.name}`);
    return artifact.body;
  }
}
