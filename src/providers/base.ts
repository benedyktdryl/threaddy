import type {
  AppConfig,
  CandidateSource,
  DiscoveredRoot,
  ExistingSourceRecord,
  NormalizedThreadBundle,
  ProviderId,
} from "../core/types/domain";

export interface ProviderAdapter {
  id: ProviderId;
  displayName: string;
  discover(config: AppConfig): Promise<DiscoveredRoot[]>;
  listCandidates(root: DiscoveredRoot): Promise<CandidateSource[]>;
  shouldReparse(candidate: CandidateSource, existing: ExistingSourceRecord | null): Promise<boolean>;
  parse(candidate: CandidateSource): Promise<NormalizedThreadBundle[]>;
}

