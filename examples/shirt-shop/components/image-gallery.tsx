import { images } from '@/utils/images';
import clsx from 'clsx';
import Image from 'next/image';

export function ImageGallery() {
  return (
    <div className="mt-8 lg:col-span-7 lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:mt-0">
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-3 lg:gap-8">
        {images.map((image, index) => (
          <Image
            key={index}
            alt="Product Image"
            src={image}
            className={clsx(
              index === 0 ? 'lg:col-span-2 lg:row-span-2' : 'hidden lg:block',
              'rounded-xl border border-gray-200',
            )}
          />
        ))}
      </div>
    </div>
  );
}
