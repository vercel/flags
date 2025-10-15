// adapted from https://github.com/microlinkhq/async-memoize-one
// and https://github.com/alexreardon/memoize-one

type MemoizeOneOptions = {
	cachePromiseRejection?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MemoizedFn<TFunc extends (this: any, ...args: any[]) => any> = (
	this: ThisParameterType<TFunc>,
	...args: Parameters<TFunc>
) => ReturnType<TFunc>;

/**
 * Memoizes an async function, but only keeps the latest result
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function memoizeOne<TFunc extends (this: any, ...newArgs: any[]) => any>(
	fn: TFunc,
	isEqual: (a: Parameters<TFunc>, b: Parameters<TFunc>) => boolean,
	{ cachePromiseRejection = false }: MemoizeOneOptions = {},
): MemoizedFn<TFunc> {
	let calledOnce = false;
	let oldArgs: Parameters<TFunc>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let lastResult: any;

	function memoized(
		this: ThisParameterType<TFunc>,
		...newArgs: Parameters<TFunc>
	) {
		if (calledOnce && isEqual(newArgs, oldArgs)) return lastResult;

		lastResult = fn.apply(this, newArgs);

		if (!cachePromiseRejection && lastResult.catch) {
			lastResult.catch(() => {
				calledOnce = false;
			});
		}

		calledOnce = true;
		oldArgs = newArgs;

		return lastResult;
	}

	return memoized;
}
