export interface IngestEvent {
  type: string;
  ts: number;
  payload: object;
}

export interface UsageEvent {
  ingestEvent(): IngestEvent;
}
