'use client';

import { removeFromCart } from '@/utils/actions';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

function Spinner() {
  return (
    <motion.div
      initial={{ scale: 0, x: 0, opacity: 0 }}
      animate={{ scale: 1, x: 0, opacity: 1 }}
      exit={{ scale: 0, x: 0, opacity: 0 }}
      className="inline-block size-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
    />
  );
}

export function ShoppingCartRemoveButton({ index }: { index: number }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleRemove = async () => {
    setIsLoading(true);
    await removeFromCart(index);
  };

  return (
    <button
      type="button"
      onClick={handleRemove}
      disabled={isLoading}
      className="cursor-pointer font-medium text-blue-600 hover:text-blue-500 disabled:opacity-70 flex items-center gap-2"
    >
      <AnimatePresence mode="popLayout">
        {isLoading && <Spinner />}
        <motion.span
          layout
          key="text"
          initial={{ x: isLoading ? 12 : 0 }}
          animate={{ x: 0 }}
          transition={{ type: 'spring', bounce: 0.3 }}
        >
          Remove
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
