import type { Datafile, DataSource, DataSourceInfo, Packed } from '../types';

export class InMemoryDataSource implements DataSource {
  private data: Omit<Datafile, 'metrics'>;

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

  async getInfo(): Promise<DataSourceInfo> {
    return { projectId: this.data.projectId };
  }

  async getDatafile(): Promise<Datafile> {
    return Object.assign(this.data, {
      metrics: {
        readMs: 0,
        source: 'in-memory' as const,
        cacheStatus: 'HIT' as const,
        connectionState: 'connected' as const,
      },
    }) satisfies Datafile;
  }

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async read(): Promise<Datafile> {
    return Object.assign(this.data, {
      metrics: {
        readMs: 0,
        source: 'in-memory' as const,
        cacheStatus: 'HIT' as const,
        connectionState: 'connected' as const,
      },
    }) satisfies Datafile;
  }
}
