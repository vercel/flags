import { nanoid } from 'nanoid';
import { dedupe } from '@vercel/flags/next';
import type { ReadonlyRequestCookies } from '@vercel/flags';
import type { NextRequest } from 'next/server';

const generateId = dedupe(async () => nanoid());

// This function is not deduplicated, as it is called with
// two different cookies objects, so it can not be deduplicated.
//
// However, the generateId function will always generate the same id of the
// same request, so it is safe to call it multiple times within the same runtime.
export const getOrGenerateVisitorId = async (
  cookies: ReadonlyRequestCookies | NextRequest['cookies'],
) => {
  const visitorId = cookies.get('marketing-visitor-id')?.value;
  return visitorId ?? generateId();
};
