import type {
  DataSource,
  DataSourceData,
  DataSourceInfo,
  GetDataResult,
  Packed,
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

  async getMetadata(): Promise<DataSourceInfo> {
    return { projectId: this.dataSourceData.projectId };
  }

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async getData(): Promise<GetDataResult> {
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
