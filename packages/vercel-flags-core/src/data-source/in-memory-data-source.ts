import type { Packed } from '../types';
import type { DataSource } from './interface';

export class InMemoryDataSource implements DataSource {
  private data: Packed.Data;
  public projectId?: string;

  constructor(data: Packed.Data, projectId?: string) {
    this.data = data;
    this.projectId = projectId;
  }

  async getData() {
    return this.data;
  }
}
