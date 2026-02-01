import type { DataSource } from './types';

export const clientMap = new Map<
  number,
  { dataSource: DataSource; initialized: boolean }
>();
