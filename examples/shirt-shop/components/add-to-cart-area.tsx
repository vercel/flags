'use client';

import { useState } from 'react';
import { AddToCartButton } from './add-to-cart-button';
import { ColorPicker } from './color-picker';
import { SizePicker } from './size-picker';

export function AddToCartArea() {
  const [state, setState] = useState({
    color: 'Black',
    size: 'S',
  });

  return (
    <>
      <ColorPicker
        color={state.color}
        setColor={(newColor) =>
          setState((prev) => ({
            ...prev,
            color: newColor,
          }))
        }
      />
      <SizePicker
        size={state.size}
        setSize={(newSize) =>
          setState((prev) => ({
            ...prev,
            size: newSize,
          }))
        }
      />
      <AddToCartButton color={state.color} size={state.size} />
    </>
  );
}
