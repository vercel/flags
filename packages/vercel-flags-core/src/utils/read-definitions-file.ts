import type { BundledDefinitions } from '../types';

type Snapshot = {
  version: 1;
  entries: Record<string, BundledDefinitions>;
};

const snapshots = new Map<string, Promise<Snapshot | undefined>>();

async function readSnapshot(path: string): Promise<Snapshot | undefined> {
  const { readFile } = await import('node:fs/promises');
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return;
    }
    throw error;
  }

  const snapshot: unknown = JSON.parse(contents);
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    !('version' in snapshot) ||
    snapshot.version !== 1 ||
    !('entries' in snapshot) ||
    !snapshot.entries ||
    typeof snapshot.entries !== 'object' ||
    Array.isArray(snapshot.entries)
  ) {
    throw new Error('Invalid embedded Flags snapshot');
  }
  return snapshot as Snapshot;
}

export async function readDefinitionsFile(): Promise<Snapshot | undefined> {
  let path = process.env.VERCEL_FLAGS_DEFINITIONS_PATH;
  if (!path && process.env.VERCEL === '1') {
    path = '/var/task/.vc-flags-definitions.json';
  }
  if (!path) {
    return;
  }

  let snapshot = snapshots.get(path);
  if (!snapshot) {
    snapshot = readSnapshot(path);
    snapshots.set(path, snapshot);
  }
  return snapshot;
}
