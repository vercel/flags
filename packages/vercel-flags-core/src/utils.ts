/**
 * This function is used to check for exhaustiveness in switch statements.
 *
 * @param _ - The value to check.
 *
 * @example
 * Given `type Union = 'a' | 'b' | 'c'`, the following code will not compile:
 * ```ts
 * switch (union) {
 *   case 'a':
 *     return 'a';
 *   case 'b':
 *     return 'b';
 *   default:
 *     exhaustivenessCheck(union); // This will throw an error
 * }
 * ```
 * This is because `value` has been narrowed to `'c'` by the `default` arm,
 * which is not assignable to `never`. If we covered the `'c'` case, the type
 * would narrow to `never`, which is assignable to `never` and would not cause an error.
 */
export function exhaustivenessCheck(_: never): never {
  throw new Error('Exhaustiveness check failed');
}
