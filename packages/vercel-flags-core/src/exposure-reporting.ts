import type { Exposure, Packed, ReportExposures } from './types';

type WebAnalyticsExposure = {
  experimentId: string;
  variantId: string;
  unitKey: 'user' | 'session' | 'device' | 'group' | `event_data.${string}`;
  unitValue: string;
  rampId?: string;
  rampPercentage?: number;
};

const FAKE_DEVICE_ID = 'fake-device-id';

function getProperty(
  entity: Readonly<Record<string, unknown>>,
  path: Packed.EntityAccessor,
): unknown {
  return path.reduce<unknown>((value, key) => {
    if (typeof value !== 'object' || value === null || !(key in value)) {
      return undefined;
    }
    return (value as Record<string | number, unknown>)[key];
  }, entity);
}

function isBase(base: Packed.EntityAccessor, kind: string): boolean {
  return base.length === 2 && base[0] === kind && base[1] === 'key';
}

function flattenBase(base: Packed.EntityAccessor): string {
  return base
    .map(String)
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

function mapExposure(
  exposure: Exposure,
  entity: Readonly<Record<string, unknown>>,
): WebAnalyticsExposure | null {
  let unitKey: WebAnalyticsExposure['unitKey'];
  let unitValue: unknown;

  if (isBase(exposure.base, 'user')) {
    unitKey = 'user';
    unitValue = getProperty(entity, exposure.base);
  } else if (isBase(exposure.base, 'session')) {
    unitKey = 'session';
    unitValue = getProperty(entity, exposure.base);
  } else if (isBase(exposure.base, 'device')) {
    unitKey = 'device';
    unitValue = FAKE_DEVICE_ID;
  } else if (isBase(exposure.base, 'team')) {
    unitKey = 'group';
    unitValue = getProperty(entity, exposure.base);
  } else {
    const flattenedBase = flattenBase(exposure.base);
    if (!flattenedBase) return null;
    unitKey = `event_data.${flattenedBase}`;
    unitValue = getProperty(entity, exposure.base);
  }

  if (typeof unitValue !== 'string') return null;

  return {
    experimentId: exposure.experimentId,
    variantId: exposure.variantId,
    unitKey,
    unitValue,
    ...(exposure.rampId === undefined ? {} : { rampId: exposure.rampId }),
    ...(exposure.rampPercentage === undefined
      ? {}
      : { rampPercentage: exposure.rampPercentage }),
  };
}

/**
 * Temporary stand-in for the Vercel Web Analytics exposure API.
 */
function trackExposure(exposure: WebAnalyticsExposure): void {
  console.log('@vercel/flags-core: trackExposure', exposure);
}

/**
 * Default exposure reporter. It maps Vercel Flags entity paths to the current
 * Vercel Web Analytics exposure format and calls a temporary console-backed
 * `trackExposure` implementation.
 */
export const defaultReportExposures: ReportExposures<
  Record<string, unknown>
> = (exposures, entity) => {
  for (const exposure of exposures) {
    const mapped = mapExposure(exposure, entity);
    if (mapped) trackExposure(mapped);
  }
};
