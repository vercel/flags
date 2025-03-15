import { getProviderData } from './provider';
export * from './provider';

/**
 * Default adapter that uses environment variables for configuration
 */
export const devunusAdapter = {
  getFeature: () => ({
    provider: 'devunus',
    getProviderData: () =>
      getProviderData({
        envKey: process.env.DEVUNUS_ENV_KEY || '',
      }),
  }),
};

export default devunusAdapter;
