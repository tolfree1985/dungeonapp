export type PendingReaction = {
  id: string;
  kind: "investigation";
  cause: string;
  sourceTurn: number;
  triggerAtTurn: number;
  locationId: string;
  severity: 1 | 2 | 3;
  resolved?: boolean;
  metadata?: Record<string, unknown>;
};
