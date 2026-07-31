import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('x-flags-sdk-version', '4.2.4');
  res.status(200).json({});
}
