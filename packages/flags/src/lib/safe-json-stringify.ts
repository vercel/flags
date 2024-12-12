/**
 * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.
 *
 * This function is just like JSON.stringify but also escapes the resulting string to prevent XSS.
 *
 * @see https://pragmaticwebsecurity.com/articles/spasecurity/json-stringify-xss
 * @param value A JavaScript value, usually an object or array, to be converted.
 * @param replacer A function that transforms the results.
 * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
 */
export function safeJsonStringify(
  value: any,
  replacer?: (this: any, key: string, value: any) => any,
  space?: string | number,
): string;
/**
 * Converts a JavaScript value to a JavaScript Object Notation (JSON) string.
 *
 * This function is just like JSON.stringify but also escapes the resulting string to prevent XSS.
 *
 * @see https://pragmaticwebsecurity.com/articles/spasecurity/json-stringify-xss
 * @param value A JavaScript value, usually an object or array, to be converted.
 * @param replacer An array of strings and numbers that acts as an approved list for selecting the object properties that will be stringified.
 * @param space Adds indentation, white space, and line break characters to the return-value JSON text to make it easier to read.
 */
export function safeJsonStringify(
  value: any,
  replacer?: (number | string)[] | null,
  space?: string | number,
): string;

export function safeJsonStringify(
  value: any,
  replacer: any,
  space: any,
): string {
  return JSON.stringify(value, replacer, space).replace(/</g, '\\u003c');
}
