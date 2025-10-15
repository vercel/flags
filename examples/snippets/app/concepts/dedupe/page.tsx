import { dedupe } from 'flags/next';

const dedupeExample = dedupe(() => {
  return Math.random().toString().substring(0, 8);
});

export default async function Page() {
  const random1 = await dedupeExample();
  const random2 = await dedupeExample();
  const random3 = await dedupeExample();

  return (
    <div className="bg-slate-200 dark:bg-slate-800 p-4 rounded monospace mt-4">
      {random1} {random2} {random3}
    </div>
  );
}
