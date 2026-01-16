import type { Origin } from 'flags';
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

  async getOrigin(): Promise<Origin> {
    return {
      projectId: this.dataSourceData.projectId,
      provider: 'flags',
    };
  }

  async getData() {
    return this.dataSourceData;
  }
}
