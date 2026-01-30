import type {
  DataSource,
  DataSourceData,
  DataSourceInfo,
  Packed,
  ReadResult,
} from '../types';

export class InMemoryDataSource implements DataSource {
  dataSourceData: DataSourceData;

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
