import { NextResponse } from 'next/server';
import { flagsClient } from '@/lib/flags-client';

export async function GET() {
  const [freeDelivery, summerSale] = await Promise.all([
    flagsClient.evaluate('free-delivery'),
    flagsClient.evaluate('summer-sale'),
    flagsClient.evaluate('a'),
    flagsClient.evaluate('b'),
    flagsClient.evaluate('c'),
  ]);
  return NextResponse.json({ freeDelivery, summerSale });
}
