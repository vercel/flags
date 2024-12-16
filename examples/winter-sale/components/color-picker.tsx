'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { RadioGroup } from '@headlessui/react';
import { product } from '@/app/data';

export function ColorPicker() {
  const [selectedColor, setSelectedColor] = useState(product.colors[0]);

  return (
    <div>
      <h2 className="text-sm font-medium text-gray-900">Color</h2>

      <RadioGroup
        value={selectedColor}
        onChange={setSelectedColor}
        className="mt-2"
      >
        <RadioGroup.Label className="sr-only">Choose a color</RadioGroup.Label>
        <div className="flex items-center space-x-3">
          {product.colors.map((color) => (
            <RadioGroup.Option
              key={color.name}
              value={color}
              className={({ active, checked }) =>
                clsx(
                  color.selectedColor,
                  active && checked ? 'ring ring-offset-1' : '',
                  !active && checked ? 'ring-2' : '',
                  'relative -m-0.5 flex cursor-pointer items-center justify-center rounded-full p-0.5 focus:outline-none',
                )
              }
            >
              <RadioGroup.Label as="span" className="sr-only">
                {color.name}
              </RadioGroup.Label>
              <span
                aria-hidden="true"
                className={clsx(
                  color.bgColor,
                  'h-8 w-8 rounded-full border border-black border-opacity-10',
                )}
              />
            </RadioGroup.Option>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
}
