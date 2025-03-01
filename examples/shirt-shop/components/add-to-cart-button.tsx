'use client';

import { track } from '@vercel/analytics';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { addToCart } from '@/utils/actions';
import { useProductDetailPageContext } from '@/utils/product-detail-page';

function Spinner() {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0.1, rotate: 0 }}
      animate={{
        scale: 1,
        opacity: 1,
        rotate: 360,
      }}
      transition={{
        rotate: {
          duration: 1,
          ease: 'linear',
          repeat: Infinity,
        },
      }}
      exit={{ scale: 0, opacity: 0.1 }}
      className="inline-block size-4 rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em]"
    />
  );
}

export function AddToCartButton() {
  const { color, size } = useProductDetailPageContext();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    track('add_to_cart:viewed');
  }, []);

  const handleAddToCart = async () => {
    setIsLoading(true);
    track('add_to_cart:clicked');
    await addToCart({ id: 'shirt', color, size, quantity: 1 });
    router.push('/cart');
  };

  return (
    <button
      type="button"
      className="cursor-pointer mt-8 flex w-full items-center justify-center gap-2 rounded-full border border-transparent bg-blue-600 px-8 py-3 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-blue-700"
      onClick={handleAddToCart}
      disabled={isLoading}
    >
      <AnimatePresence mode="popLayout">
        {isLoading && <Spinner />}
        <motion.span
          layout
          key="text"
          initial={{ x: isLoading ? 12 : 0 }}
          animate={{ x: 0 }}
          transition={{ type: 'tween', ease: 'anticipate' }}
        >
          Add to cart
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
