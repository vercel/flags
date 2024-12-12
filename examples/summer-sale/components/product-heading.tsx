import { product } from '@/app/data';

export function ProductHeading() {
  return (
    <div className="flex justify-between">
      <h1 className="text-xl font-medium text-gray-900">{product.name}</h1>
      <p className="text-xl font-medium text-gray-900">{product.price}</p>
    </div>
  );
}
