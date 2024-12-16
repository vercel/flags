'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { RadioGroup } from '@headlessui/react';
import { product } from '@/app/data';

export function SizePicker() {
  const [selectedSize, setSelectedSize] = useState(product.sizes[2]);

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900">Size</h2>
        <a
          href="#"
          className="text-sm font-medium text-slate-600 hover:text-slate-500"
        >
          See sizing chart
        </a>
      </div>

      <RadioGroup
        value={selectedSize}
        onChange={setSelectedSize}
        className="mt-2"
      >
        <RadioGroup.Label className="sr-only">Choose a size</RadioGroup.Label>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {product.sizes.map((size) => (
            <RadioGroup.Option
              key={size.name}
              value={size}
              className={({ active, checked }) =>
                clsx(
                  size.inStock
                    ? 'cursor-pointer focus:outline-none'
                    : 'cursor-not-allowed opacity-25',
                  active ? 'ring-2 ring-slate-500 ring-offset-2' : '',
                  checked
                    ? 'border-transparent bg-slate-600 text-white hover:bg-slate-700'
                    : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50',
                  'flex items-center justify-center rounded-md border py-3 px-3 text-sm font-medium uppercase sm:flex-1',
                )
              }
              disabled={!size.inStock}
            >
              <RadioGroup.Label as="span">{size.name}</RadioGroup.Label>
            </RadioGroup.Option>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
}
