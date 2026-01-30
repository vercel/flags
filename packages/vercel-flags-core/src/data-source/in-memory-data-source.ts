import type {
  Datafile,
  DataSource,
  DataSourceInfo,
  Packed,
  ReadResult,
} from '../types';

export class InMemoryDataSource implements DataSource {
  dataSourceData: Datafile;

  constructor({
    data,
    projectId,
    environment,
  }: { data: Packed.Data; projectId: string; environment: string }) {
    this.dataSourceData = {
      ...data,
      projectId,
      environment,
    };
  }

  async getInfo(): Promise<DataSourceInfo> {
    return { projectId: this.dataSourceData.projectId };
  }

  async getDatafile(): Promise<Datafile> {
    return this.dataSourceData;
  }

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async read(): Promise<ReadResult> {
    return {
      data: this.dataSourceData,
      metadata: {
        durationMs: 0,
        source: 'in-memory',
        cacheStatus: 'HIT',
      },
    };
  }
}
