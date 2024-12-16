import { policies } from '@/app/data';

export function Policies() {
  return (
    <section aria-labelledby="policies-heading" className="mt-10">
      <h2 id="policies-heading" className="sr-only">
        Our Policies
      </h2>

      <dl className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {policies.map((policy) => (
          <div
            key={policy.name}
            className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center"
          >
            <dt>
              <policy.icon
                className="mx-auto h-6 w-6 flex-shrink-0 text-gray-400"
                aria-hidden="true"
              />
              <span className="mt-4 text-sm font-medium text-gray-900">
                {policy.name}
              </span>
            </dt>
            <dd className="mt-1 text-sm text-gray-500">{policy.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
