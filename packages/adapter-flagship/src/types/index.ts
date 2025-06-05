import type {
  BucketingDTO,
  DecisionMode,
  IBucketingConfig as FsIBucketingConfig,
  IDecisionApiConfig as FsIDecisionApiConfig,
  IFlagshipConfig,
} from '@flagship.io/js-sdk';

export interface InternalConfig {
  connectionString?: string;
  edgeConfigItemKey?: string;
}
export interface BucketingConfig extends FsIBucketingConfig, InternalConfig {}

export interface DecisionApiConfig
  extends FsIDecisionApiConfig,
    InternalConfig {}

export interface EdgeConfig extends IFlagshipConfig, InternalConfig {
  decisionMode: DecisionMode.BUCKETING_EDGE;
  /**
   * This is a set of flag data provided to avoid the SDK to have an empty cache during the first initialization.
   */
  initialBucketing?: BucketingDTO;
}

export type AdapterConfig = BucketingConfig | DecisionApiConfig | EdgeConfig;
