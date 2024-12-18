export function Content({
  children,
}: {
  children: React.ReactNode;
  crumbs: string[];
}) {
  return (
    <>
      <div className="p-4 pt-0 prose lg:prose-lg mb-32">{children}</div>
    </>
  );
}
