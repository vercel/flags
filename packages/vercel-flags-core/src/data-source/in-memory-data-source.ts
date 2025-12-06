import type { DataSourceData, Packed } from '../types';
import type { DataSource } from './interface';

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

  async getData() {
    return this.dataSourceData;
  }
}
