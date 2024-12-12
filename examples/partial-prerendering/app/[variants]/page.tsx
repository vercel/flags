import { Suspense } from 'react';
import {
  RecommendedProducts,
  RecommendedProductsSkeleton,
} from '#/components/recommended-products';
import { Reviews, ReviewsSkeleton } from '#/components/reviews';
import { SingleProduct } from '#/components/single-product';
import { Ping } from '#/components/ping';
import { precomputeFlags, showRatingFlag } from '#/middleware-flags';

export async function generateStaticParams() {
  return [];
}

export default async function Page(props: {
  params: Promise<{ variants: string }>;
}) {
  const params = await props.params;
  const showRating = await showRatingFlag(params.variants, precomputeFlags);

  return (
    <div className="space-y-8 lg:space-y-14">
      <SingleProduct showRating={showRating} />

      <Ping />

      <Suspense fallback={<RecommendedProductsSkeleton />}>
        <RecommendedProducts showRating={showRating} />
      </Suspense>

      <Ping />

      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews showRating={showRating} />
      </Suspense>
    </div>
  );
}
