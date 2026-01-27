import type { DataSourceData, Packed } from '../types';
import type { DataSource, DataSourceMetadata } from './interface';

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

  async getMetadata(): Promise<DataSourceMetadata> {
    return { projectId: this.dataSourceData.projectId };
  }

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}
  async getData() {
    return this.dataSourceData;
  }
}
