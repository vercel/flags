import type { ControllerInterface } from './types';

export type ControllerInstance = {
  controller: ControllerInterface;
  initialized: boolean;
  initPromise: Promise<void> | null;
};

export const controllerInstanceMap = new Map<number, ControllerInstance>();
