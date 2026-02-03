import type { Datafile, DataSource, DataSourceInfo, Packed } from '../types';

const RESOLVED_VOID = Promise.resolve();

export class InMemoryDataSource implements DataSource {
  private data: Omit<Datafile, 'metrics'>;
  private cachedDatafile: Datafile | undefined;

  constructor({
    data,
    projectId,
    environment,
  }: { data: Packed.Data; projectId: string; environment: string }) {
    this.data = {
      ...data,
      projectId,
      environment,
    };
  }

  getInfo(): Promise<DataSourceInfo> {
    return Promise.resolve({ projectId: this.data.projectId });
  }

  getDatafile(): Promise<Datafile> {
    return Promise.resolve(this.getDatafileSync());
  }

  initialize(): Promise<void> {
    return RESOLVED_VOID;
  }

  shutdown(): void {}

  read(): Promise<Datafile> {
    return Promise.resolve(this.getDatafileSync());
  }

  private getDatafileSync(): Datafile {
    if (!this.cachedDatafile) {
      this.cachedDatafile = Object.assign(this.data, {
        metrics: {
          readMs: 0,
          source: 'in-memory' as const,
          cacheStatus: 'HIT' as const,
          connectionState: 'connected' as const,
        },
      }) satisfies Datafile;
    }
    return this.cachedDatafile;
  }
}
