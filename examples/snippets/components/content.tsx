export function Content({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 prose lg:prose-lg mb-32 dark:prose-invert">
      {children}
    </div>
  );
}
