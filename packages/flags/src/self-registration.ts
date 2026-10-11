/**
 * The code which a framework plugin appends to a module with the
 * `'use flags'` directive: the module registers its own exports with
 * `registerFlags`, so that nobody calls it by hand.
 *
 * The call is at the end, because the exports are initialized there. The
 * imports are hoisted, so their position does not matter.
 */
export function addSelfRegistration(source: string, fileName: string): string {
  const self = JSON.stringify(`./${fileName}`);
  return `${source}
;import * as __flagsSelf from ${self};
import { registerFlags as __flagsRegisterFlags } from 'flags';
__flagsRegisterFlags(__flagsSelf);
`;
}
