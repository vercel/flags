import type { StaticImageData } from 'next/image';
import black from '@/public/images/product/shirt-black.png';
import blue from '@/public/images/product/shirt-blue.png';
import white from '@/public/images/product/shirt-white.png';

export const images = [black, white, blue];

export const colorToImage: Record<string, StaticImageData> = {
  Black: black,
  White: white,
  Blue: blue,
};
