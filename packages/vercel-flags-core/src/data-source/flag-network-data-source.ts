import { version } from '../../package.json';
import type { BundledDefinitions, DataSourceData } from '../types';
import type { DataSource, DataSourceMetadata } from './interface';

async function fetchData(
  host: string,
  sdkKey: string,
): Promise<BundledDefinitions> {
  const res = await fetch(`${host}/v1/datafile`, {
    headers: {
      Authorization: `Bearer ${sdkKey}`,
      'User-Agent': `VercelFlagsCore/${version}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch data: ${res.statusText}`);
  }

  return res.json() as Promise<BundledDefinitions>;
}

/**
 * Implements the DataSource interface for flags.vercel.com.
 */
export class FlagNetworkDataSource implements DataSource {
  public sdkKey: string;
  readonly host = 'https://flags.vercel.com';
  private dataSourceData: DataSourceData | undefined = undefined;

  constructor(options: { sdkKey: string }) {
    if (
      !options.sdkKey ||
      typeof options.sdkKey !== 'string' ||
      !options.sdkKey.startsWith('vf_')
    ) {
      throw new Error(
        '@vercel/flags-core: SDK key must be a string starting with "vf_"',
      );
    }
    console.log('CREATED CLIENT', options.sdkKey);
    this.sdkKey = options.sdkKey;
  }

  async initialize(): Promise<void> {
    console.log('DURING INIT2222');
    this.dataSourceData = await fetchData(this.host, this.sdkKey);
  }

  async getData(): Promise<DataSourceData> {
    if (!this.dataSourceData) throw new Error('Data not initialized');
    return this.dataSourceData;
  }

  async shutdown(): Promise<void> {
    // free up memory
    this.dataSourceData = undefined;
  }

  async getMetadata(): Promise<DataSourceMetadata> {
    const data =
      this.dataSourceData ?? (await fetchData(this.host, this.sdkKey));
    return { projectId: data.projectId };
  }

  async ensureFallback(): Promise<void> {
    throw new Error('not implemented');
  }
}
