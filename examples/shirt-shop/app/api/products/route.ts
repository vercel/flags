import { NextResponse } from 'next/server';
import { products } from '@/utils/products';

export async function GET() {
  return NextResponse.json({ products });
}
