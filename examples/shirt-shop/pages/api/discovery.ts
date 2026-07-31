import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('x-flags-sdk-version', '4.2.4');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'application/json');
  res.status(200).json({});
}
