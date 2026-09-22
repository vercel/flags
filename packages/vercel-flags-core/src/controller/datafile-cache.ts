import type { TaggedData } from './tagged-data';

/** The authoritative tagged snapshot, shared by every controller mode. */
export class DatafileCache {
  private data: TaggedData | undefined;

  get(): TaggedData | undefined {
    return this.data;
  }

  set(data: TaggedData): TaggedData {
    this.data = data;
    return data;
  }

  clear(): void {
    this.data = undefined;
  }
}
