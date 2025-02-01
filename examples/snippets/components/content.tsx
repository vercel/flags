export function Content({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 prose lg:prose-lg dark:prose-invert mb-32 !text-foreground">
      {children}
    </div>
  );
}
