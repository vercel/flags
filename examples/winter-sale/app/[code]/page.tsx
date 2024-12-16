import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StarIcon } from 'lucide-react';
import { getPrecomputed } from '@vercel/flags/next';
import { precomputeFlags, winterSaleLanchDarkly } from '@/flags';

export default async function DetailsPage(props: {
  params: Promise<{ code: string }>;
}) {
  const params = await props.params;
  const [showWinterSale] = await getPrecomputed(
    [winterSaleLanchDarkly],
    precomputeFlags,
    params.code,
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Winter Sale Banner */}
      {showWinterSale ? (
        <div className="bg-red-600 text-white py-3 px-4 text-center">
          <p className="text-lg font-semibold">
            Winter Sale! 30% off on this Pea Coat
          </p>
        </div>
      ) : null}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-8">
              {/* Product Image */}
              <div className="relative aspect-square">
                <Image
                  src="/placeholder.svg?height=600&width=600"
                  alt="Classic Pea Coat"
                  fill
                  className="object-cover rounded-lg"
                />
              </div>

              {/* Product Details */}
              <div className="flex flex-col justify-between">
                <div>
                  <h1 className="text-3xl font-bold mb-2">
                    Classic Wool Pea Coat
                  </h1>
                  <div className="flex items-center mb-4">
                    {[...Array(5)].map((_, i) => (
                      <StarIcon
                        key={i}
                        className="w-5 h-5 fill-yellow-400 text-yellow-400"
                      />
                    ))}
                    <span className="ml-2 text-sm text-gray-600">
                      (128 reviews)
                    </span>
                  </div>
                  <p className="text-gray-600 mb-4">
                    Stay warm and stylish with our classic wool pea coat.
                    Perfect for chilly days and formal occasions.
                  </p>
                  <ul className="list-disc list-inside mb-4 text-gray-600">
                    <li>100% premium wool</li>
                    <li>Double-breasted design</li>
                    <li>Fully lined interior</li>
                    <li>Available in navy blue and charcoal gray</li>
                  </ul>
                </div>
                <div>
                  {showWinterSale ? (
                    <div className="flex items-baseline mb-4">
                      <span className="text-3xl font-bold text-red-600">
                        $139.99
                      </span>
                      <span className="ml-2 text-lg text-gray-500 line-through">
                        $199.99
                      </span>
                      <span className="ml-2 text-sm text-red-600 font-semibold">
                        Save 30%
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-baseline mb-4">
                      <span className="ml-2 text-lg text-gray-500">
                        $199.99
                      </span>
                    </div>
                  )}
                  <div className="flex space-x-4 mb-4">
                    <Button className="flex-1">Add to Cart</Button>
                    <Button variant="outline" className="flex-1">
                      Add to Wishlist
                    </Button>
                  </div>
                  <p className="text-sm text-gray-600">
                    Free shipping on orders over $100. 30-day return policy.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
