import type { DataSource } from './types';

export type ClientInstance = {
  dataSource: DataSource;
  initialized: boolean;
  initPromise: Promise<void> | null;
};

export const clientMap = new Map<number, ClientInstance>();
