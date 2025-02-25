import { nanoid } from 'nanoid';
import { dedupe } from 'flags/next';
import type { ReadonlyHeaders, ReadonlyRequestCookies } from 'flags';
import type { NextRequest } from 'next/server';

const generateId = dedupe(async () => nanoid());

// This function is not deduplicated, as it is called with
// two different cookies objects, so it can not be deduplicated.
//
// However, the generateId function will always generate the same id for the
// same request, so it is safe to call it multiple times within the same runtime.
export const getOrGenerateVisitorId = async (
  cookies: ReadonlyRequestCookies | NextRequest['cookies'],
  headers: ReadonlyHeaders | NextRequest['headers'],
) => {
  // check cookies first
  const cookieVisitorId = cookies.get('marketing-visitor-id')?.value;
  if (cookieVisitorId) return cookieVisitorId;

  // check headers in case middleware set a cookie on the response, as it will
  // not be present on the initial request
  const headerVisitorId = headers.get('x-marketing-visitor-id');
  if (headerVisitorId) return headerVisitorId;

  // if no visitor id is found, generate a new one
  return generateId();
};
