import type { ProviderData } from 'flags';
export declare function getProviderData(options: {
  /**
   * GrowthBook API Key or Personal Access Token
   */
  apiKey: string;
  /**
   * Override the application API host for self-hosted users
   */
  appApiHost?: string;
  /**
   * Override the application URL for self-hosted users
   */
  appOrigin?: string;
}): Promise<ProviderData>;
//# sourceMappingURL=index.d.ts.map
