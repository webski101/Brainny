export type PathHop = {
  from: string;
  rel: string;
  to: string;
  detail?: string;
};

export type SourceRef = {
  id: string;
  kind: string;
  title: string;
  status: "active" | "superseded" | "stale" | "left";
  date?: string;
};

export type AgentAnswer = {
  status: "ok" | "abstain" | "partial";
  intent: string;
  answer: string;
  path: PathHop[];
  sources: SourceRef[];
  cypher: string[];
  highlights?: string[];
  busFactor?: BusFactorHit[];
  people?: ExpertiseHit[];
  decision?: DecisionHit | null;
};

export type ExpertiseHit = {
  name: string;
  role: string;
  team: string;
  score: number;
  reasons: string[];
  active: boolean;
};

export type BusFactorHit = {
  service: string;
  criticalPeople: string[];
  score: number;
  risk: "critical" | "high" | "medium" | "low";
};

export type DecisionHit = {
  id: string;
  title: string;
  summary: string;
  decidedAt: string;
  status: "active" | "superseded";
  supersededBy?: string;
  owners: string[];
  cites: string[];
};

export type GraphPayload = {
  nodes: { id: string; label: string; type: string; meta?: string }[];
  edges: { id: string; source: string; target: string; rel: string }[];
};
