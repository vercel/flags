import type * as upstream from './store';

export const store: typeof upstream.store = {
  disable() {},
  enterWith(store) {},
  exit(callback, ...args) {
    return callback(...args);
  },
  getStore() {
    return undefined;
  },
  run() {},
};
