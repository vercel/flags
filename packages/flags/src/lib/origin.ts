import { FlagDeclaration, Origin } from '../types';

export function getOrigin<ValueType, EntitiesType>(
  definition: Pick<
    FlagDeclaration<ValueType, EntitiesType>,
    'origin' | 'adapter' | 'key'
  >,
): string | Origin | undefined {
  if (definition.origin) return definition.origin;
  if (typeof definition.adapter?.origin === 'function')
    return definition.adapter.origin(definition.key);
  return definition.adapter?.origin;
}
