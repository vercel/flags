export function TopBanner({ children }: { children?: string }) {
  return (
    <div className="px-4 py-2 bg-gray-950 text-white text-center text text-sm font-medium">
      {children ? children : 'Get free delivery on orders over $100'}
    </div>
  );
}
