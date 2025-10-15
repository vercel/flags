export function DemoFlag({ value, name }: { value: boolean; name: string }) {
  return (
    <div
      className={`rounded-md ${value ? 'bg-green-100 dark:bg-green-800' : 'bg-fuchsia-100 dark:bg-fuchsia-800'}`}
    >
      <p
        className={`p-4 text-sm font-medium ${value ? 'text-green-800 dark:text-green-100' : 'text-fuchsia-800 dark:text-fuchsia-100'}`}
      >
        The feature flag <span className="font-semibold">{name}</span> evaluated
        to <span className="font-semibold">{JSON.stringify(value)}</span>.
      </p>
    </div>
  );
}
