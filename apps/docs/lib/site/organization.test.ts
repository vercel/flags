import { describe, expect, it } from 'vitest';
import {
  getOrganizationStructuredData,
  serializeStructuredData,
} from './organization';

describe('getOrganizationStructuredData', () => {
  const data = getOrganizationStructuredData({
    siteUrl: 'https://flags-sdk.dev/',
  });

  it('is a schema.org Organization', () => {
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('Organization');
    expect(data.name).toBe('Vercel Inc.');
    expect(data.url).toMatch(/^https:\/\//);
  });

  it('includes contact points with a contactType and a way to reach them', () => {
    expect(data.contactPoint.length).toBeGreaterThan(0);
    for (const point of data.contactPoint) {
      expect(point['@type']).toBe('ContactPoint');
      expect(point.contactType).toBeTruthy();
      expect(Boolean(point.url || ('email' in point && point.email))).toBe(
        true,
      );
    }
    expect(data.contactPoint.some((point) => 'email' in point)).toBe(true);
  });

  it('includes a complete postal address', () => {
    expect(data.address['@type']).toBe('PostalAddress');
    expect(data.address.streetAddress).toBeTruthy();
    expect(data.address.addressLocality).toBeTruthy();
    expect(data.address.addressRegion).toBeTruthy();
    expect(data.address.postalCode).toBeTruthy();
    expect(data.address.addressCountry).toBe('US');
  });

  it('links the organization to the Flags SDK site', () => {
    expect(data.owns.url).toBe('https://flags-sdk.dev/');
    expect(data.owns.name).toBe('Flags SDK');
  });
});

describe('serializeStructuredData', () => {
  it('escapes < so the JSON cannot close the script tag', () => {
    expect(serializeStructuredData({ a: '</script>' })).toBe(
      '{"a":"\\u003c/script>"}',
    );
  });
});
