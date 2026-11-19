import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DatafileInput } from '@vercel/flags-core';
import { catalogFromDatafile } from './sources/site/catalog.ts';
import { streamDatafiles } from './sources/site/stream.ts';

function datafile(revision: number): DatafileInput {
  return {
    projectId: 'project',
    environment: 'development',
    revision,
    definitions: {},
  } as DatafileInput;
}

function message(revision: number) {
  return `${JSON.stringify({ type: 'datafile', data: datafile(revision) })}\n`;
}

function response(chunks: string[], options: { close?: boolean } = {}) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      if (options.close) {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return { response: new Response(body), cancelled: () => cancelled };
}

test('catalog stream handles split lines, pings, and duplicate or older revisions', async () => {
  const initial = message(1);
  const remote = response([
    initial.slice(0, 30),
    initial.slice(30),
    '\n{"type":"ping"}\n',
    message(1) + message(0) + message(2),
  ]);
  const controller = new AbortController();
  const stream = streamDatafiles({
    signal: controller.signal,
    getToken: async () => 'test-token',
    fetch: async (url, init) => {
      assert.equal(url, 'https://flags.vercel.com/v1/stream');
      assert.equal(
        new Headers(init?.headers).get('Authorization'),
        'Bearer test-token',
      );
      assert.equal(new Headers(init?.headers).has('X-Revision'), false);
      return remote.response;
    },
  });
  try {
    assert.equal((await stream.next()).value?.revision, 1);
    assert.equal((await stream.next()).value?.revision, 2);
  } finally {
    await stream.return(undefined);
  }
  assert.equal(remote.cancelled(), true);
});

test('disconnect reconnects with a fresh token and supplies new snapshots', async () => {
  const controller = new AbortController();
  const tokens: string[] = [];
  let credentials = 0;
  const remote = response([message(2)]);
  const stream = streamDatafiles({
    signal: controller.signal,
    getToken: async () => `token-${++credentials}`,
    fetch: async (_url, init) => {
      tokens.push(new Headers(init?.headers).get('Authorization')!);
      if (tokens.length === 1) {
        return response([message(1)], { close: true }).response;
      }
      return remote.response;
    },
  });
  try {
    assert.equal((await stream.next()).value?.revision, 1);
    assert.equal((await stream.next()).value?.revision, 2);
    assert.deepEqual(tokens, ['Bearer token-1', 'Bearer token-2']);
  } finally {
    controller.abort();
    await stream.return(undefined);
  }
  assert.equal(remote.cancelled(), true);
});

test('abort cancels an idle subscription', async () => {
  const controller = new AbortController();
  const remote = response([message(1)]);
  const stream = streamDatafiles({
    signal: controller.signal,
    getToken: async () => 'test-token',
    fetch: async () => remote.response,
  });
  await stream.next();
  const waiting = stream.next();
  controller.abort();
  assert.equal((await waiting).done, true);
  assert.equal(remote.cancelled(), true);
});

test('abort stops reconnect backoff', async () => {
  const controller = new AbortController();
  let requests = 0;
  const stream = streamDatafiles({
    signal: controller.signal,
    getToken: async () => 'test-token',
    fetch: async () => {
      requests += 1;
      return response([message(1)], { close: true }).response;
    },
  });
  await stream.next();
  const waiting = stream.next();
  setTimeout(() => controller.abort(), 10);
  assert.equal((await waiting).done, true);
  assert.equal(requests, 1);
});

test('authentication failures stop the subscription with a useful error', async () => {
  const stream = streamDatafiles({
    signal: new AbortController().signal,
    getToken: async () => 'test-token',
    fetch: async () => new Response(null, { status: 401 }),
  });
  await assert.rejects(stream.next(), /authentication failed.*401/);
});

test('datafile snapshots supply new keys, descriptions, and variants', () => {
  const input = {
    ...datafile(2),
    definitions: {
      'new-feature': { variants: [true, false] },
      offer: { variants: ['small', 'large'] },
    },
  } as unknown as DatafileInput;
  const catalog = catalogFromDatafile(input);
  assert.equal(catalog.revision, 2);
  assert.deepEqual(catalog.flags.offer.variants, ['small', 'large']);
  assert.match(catalog.flags['new-feature'].description!, /new-feature/);
});
