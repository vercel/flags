export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  availableColors: string[];
  availableSizes: string[];
  imageUrl: string;
}

// Sample products data
export const products: Product[] = [
  {
    id: 'classic-tee',
    name: 'Classic T-Shirt',
    description: 'A comfortable and stylish classic t-shirt',
    price: 29.99,
    availableColors: ['white', 'black', 'navy', 'gray'],
    availableSizes: ['S', 'M', 'L', 'XL'],
    imageUrl: '/images/classic-tee.jpg',
  },
  {
    id: 'premium-polo',
    name: 'Premium Polo',
    description: 'High-quality polo shirt for a smart casual look',
    price: 49.99,
    availableColors: ['white', 'black', 'navy', 'burgundy'],
    availableSizes: ['S', 'M', 'L', 'XL'],
    imageUrl: '/images/premium-polo.jpg',
  },
];
