import { randomBytes } from 'crypto';
import { dedupe } from 'flags/next';
import type { Entity } from './types';

export const identify = dedupe((): Entity => {
  return {
    visitor: {
      id: generateRandomId(),
    },
  };
});

export function generateRandomId(length = 16) {
  return randomBytes(length)
    .toString('base64') // Convert to base64
    .replace(/\+/g, '0') // Replace '+' with '0' to make it alphanumeric
    .replace(/\//g, '1') // Replace '/' with '1'
    .substring(0, length); // Trim to the desired length
}
