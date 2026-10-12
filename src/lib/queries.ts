import { runQuery } from "./falkordb";
import type {
  BusFactorHit,
  DecisionHit,
  ExpertiseHit,
  GraphPayload,
  PathHop,
  SourceRef,
} from "./types";

function asString(v: unknown, fallback = "") {
  if (v == null) return fallback;
  return String(v);
}

function asNumber(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Expand casual words into graph-friendly tokens */
export function expandTopic(topic: string): string[] {
  const t = topic.toLowerCase();
  const tokens = new Set<string>();
  for (const part of t.split(/[^a-z0-9]+/).filter(Boolean)) {
    tokens.add(part);
  }
  if (t.includes("payment") || t.includes("psp") || t.includes("card")) {
    tokens.add("rails");
    tokens.add("card");
    tokens.add("ledger");
    tokens.add("settle");
    tokens.add("payment");
  }
  if (t.includes("refactor")) tokens.add("rails");
  if (t.includes("fraud") || t.includes("aml")) tokens.add("fraud");
  if (t.includes("adyen") || t.includes("stripe")) {
    tokens.add("rails");
    tokens.add("adyen");
    tokens.add("stripe");
  }
  return [...tokens];
}

export async function findExperts(topic: string) {
  const tokens = expandTopic(topic);
  const cypher = `
    MATCH (p:Person)-[k:KNOWS]->(s:Service)
    WHERE ANY(token IN $tokens WHERE
      toLower(s.name) CONTAINS token OR
      toLower(s.desc) CONTAINS token
    )
    OPTIONAL MATCH (p)-[:WROTE|REVIEWED]->(pr:PR)-[:TOUCHES]->(s)
    OPTIONAL MATCH (p)-[:FIXED|PAGED_FOR]->(inc:Incident)-[:IN]->(s)
    OPTIONAL MATCH (p)-[:FIXED|ASSIGNED]->(tk:Ticket)-[:AFFECTS]->(s)
    OPTIONAL MATCH (p)-[:MEMBER_OF]->(t:Team)
    WITH p, t,
      sum(coalesce(k.weight,1)) + count(DISTINCT pr) * 2 +
      count(DISTINCT inc) * 3 + count(DISTINCT tk) AS score,
      collect(DISTINCT s.name) AS services,
      collect(DISTINCT pr.title) AS prs,
      collect(DISTINCT inc.title) AS incs
    WHERE score > 0
    RETURN p.name AS name, p.role AS role, p.active AS active,
           coalesce(t.name,'') AS team, score, services, prs, incs
    ORDER BY p.active DESC, score DESC
    LIMIT 5
  `;
  const { rows, cypher: used } = await runQuery<{
    name: string;
    role: string;
    active: boolean;
    team: string;
    score: number;
    services: string[];
    prs: (string | null)[];
    incs: (string | null)[];
  }>(cypher, { tokens });

  const people: ExpertiseHit[] = rows.map((r) => {
    const reasons = [
      ...(r.services || []).slice(0, 2).map((s) => `knows ${s}`),
      ...(r.prs || []).filter(Boolean).slice(0, 1).map((p) => `PR: ${p}`),
      ...(r.incs || []).filter(Boolean).slice(0, 1).map((i) => `incident: ${i}`),
    ];
    return {
      name: asString(r.name),
      role: asString(r.role),
      team: asString(r.team),
      score: asNumber(r.score),
      active: Boolean(r.active),
      reasons,
    };
  });

  const path: PathHop[] = people.slice(0, 3).flatMap((p) =>
    p.reasons.slice(0, 2).map((reason) => ({
      from: p.name,
      rel: "EVIDENCE",
      to: reason,
    })),
  );

  const sources: SourceRef[] = people.map((p) => ({
    id: p.name,
    kind: "Person",
    title: `${p.name} · ${p.role}`,
    status: p.active ? "active" : "left",
  }));

  return { people, path, sources, cypher: [used] };
}

export async function busFactor(personName?: string) {
  const cypher = personName
    ? `
      MATCH (p:Person)
      WHERE toLower(p.name) CONTAINS toLower($name)
      MATCH (p)-[k:KNOWS]->(s:Service)
      OPTIONAL MATCH (other:Person)-[ok:KNOWS]->(s)
      WHERE other.active = true AND other <> p
      WITH p, s, coalesce(k.weight,1) AS myWeight,
           collect(DISTINCT other.name) AS others,
           sum(CASE WHEN other IS NOT NULL THEN coalesce(ok.weight,1) ELSE 0 END) AS otherWeight
      WITH p, s, myWeight, others, otherWeight,
           CASE WHEN otherWeight = 0 THEN 1.0
                ELSE toFloat(myWeight) / (myWeight + otherWeight) END AS concentration
      RETURN p.name AS person, s.name AS service, s.criticality AS criticality,
             others AS people, concentration
      ORDER BY concentration DESC
    `
    : `
      MATCH (s:Service)
      OPTIONAL MATCH (p:Person)-[k:KNOWS]->(s)
      WHERE p.active = true
      WITH s, collect(p.name) AS people, collect(coalesce(k.weight,1)) AS weights
      WITH s, [x IN people WHERE x IS NOT NULL] AS people, weights,
           reduce(total = 0, w IN weights | total + w) AS totalW,
           reduce(mx = 0, w IN weights | CASE WHEN w > mx THEN w ELSE mx END) AS maxW
      WITH s, people, totalW, maxW,
           CASE WHEN totalW = 0 THEN 1.0 ELSE toFloat(maxW) / totalW END AS concentration
      RETURN s.name AS service, s.criticality AS criticality, people, concentration
      ORDER BY concentration DESC
    `;

  const { rows, cypher: used } = await runQuery<Record<string, unknown>>(
    cypher,
    { name: personName || "" },
  );

  const busFactorHits: BusFactorHit[] = rows.map((r) => {
    const concentration = asNumber(r.concentration);
    const criticality = asString(r.criticality);
    const people = (Array.isArray(r.people) ? r.people : []).filter(Boolean).map(String);
    let risk: BusFactorHit["risk"] = "low";
    if (
      concentration >= 0.75 &&
      (criticality === "critical" || criticality === "high" || people.length <= 1)
    ) {
      risk = "critical";
    } else if (concentration >= 0.6) {
      risk = "high";
    } else if (concentration >= 0.4) {
      risk = "medium";
    }
    return {
      service: asString(r.service),
      criticalPeople: people.slice(0, 3),
      score: Math.round(concentration * 100),
      risk,
    };
  });

  const path: PathHop[] = busFactorHits.slice(0, 5).map((b) => ({
    from: b.criticalPeople[0] || "unknown",
    rel: "BUS_FACTOR",
    to: b.service,
    detail: `${b.score}% concentration · ${b.risk}`,
  }));

  const sources: SourceRef[] = busFactorHits.slice(0, 6).map((b) => ({
    id: b.service,
    kind: "Service",
    title: `${b.service} (${b.risk})`,
    status: b.risk === "critical" || b.risk === "high" ? "stale" : "active",
  }));

  return { busFactor: busFactorHits, path, sources, cypher: [used], person: personName };
}

export async function decisionAutopsy(topic: string) {
  const tokens = expandTopic(topic);
  const cypher = `
    MATCH (d:Decision)
    WHERE ANY(token IN $tokens WHERE
      toLower(d.title) CONTAINS token OR
      toLower(d.summary) CONTAINS token
    )
    OPTIONAL MATCH (newer:Decision)-[:SUPERSEDES]->(d)
    OPTIONAL MATCH (owner:Person)-[:DECIDED]->(d)
    OPTIONAL MATCH (d)-[:CITES]->(src)
    RETURN d.id AS id, d.title AS title, d.summary AS summary,
           d.decidedAt AS decidedAt, d.status AS status,
           newer.id AS supersededBy,
           collect(DISTINCT owner.name) AS owners,
           collect(DISTINCT coalesce(src.title, src.id)) AS cites
    ORDER BY d.decidedAt DESC
    LIMIT 5
  `;
  const { rows, cypher: used } = await runQuery<Record<string, unknown>>(cypher, {
    tokens,
  });

  if (!rows.length) {
    return {
      decision: null as DecisionHit | null,
      path: [] as PathHop[],
      sources: [] as SourceRef[],
      cypher: [used],
      abstain: true as const,
      reason: `No decision in the company graph matches “${topic}”.`,
    };
  }

  // Prefer an active decision when the topic hits both old + new
  const preferred =
    rows.find((r) => asString(r.status) === "active" && !r.supersededBy) || rows[0];

  const status = asString(preferred.status, "active") as DecisionHit["status"];
  const supersededBy = preferred.supersededBy
    ? asString(preferred.supersededBy)
    : undefined;

  const decision: DecisionHit = {
    id: asString(preferred.id),
    title: asString(preferred.title),
    summary: asString(preferred.summary),
    decidedAt: asString(preferred.decidedAt),
    status: supersededBy || status === "superseded" ? "superseded" : "active",
    supersededBy,
    owners: (Array.isArray(preferred.owners) ? preferred.owners : [])
      .filter(Boolean)
      .map(String),
    cites: (Array.isArray(preferred.cites) ? preferred.cites : [])
      .filter(Boolean)
      .map(String),
  };

  const path: PathHop[] = [
    ...decision.owners.map((o) => ({
      from: o,
      rel: "DECIDED",
      to: decision.title,
    })),
    ...decision.cites.map((c) => ({
      from: decision.title,
      rel: "CITES",
      to: c,
    })),
  ];

  if (decision.status === "superseded") {
    path.push({
      from: decision.supersededBy || "newer decision",
      rel: "SUPERSEDES",
      to: decision.id,
      detail: "This decision is no longer active",
    });
  }

  const sources: SourceRef[] = [
    {
      id: decision.id,
      kind: "Decision",
      title: decision.title,
      status: decision.status === "superseded" ? "superseded" : "active",
      date: decision.decidedAt,
    },
    ...decision.cites.map((c) => ({
      id: c,
      kind: "Evidence",
      title: c,
      status: "active" as const,
    })),
  ];

  const abstain = decision.status === "superseded";

  return {
    decision,
    path,
    sources,
    cypher: [used],
    abstain,
    reason: abstain
      ? `Decision “${decision.title}” is superseded${decision.supersededBy ? ` by ${decision.supersededBy}` : ""}. Citing it as current policy would be wrong.`
      : undefined,
  };
}

export async function whoOwns(serviceHint: string) {
  const tokens = expandTopic(serviceHint);
  const cypher = `
    MATCH (s:Service)
    WHERE ANY(token IN $tokens WHERE
      toLower(s.name) CONTAINS token OR
      toLower(s.desc) CONTAINS token
    )
    OPTIONAL MATCH (declared:Person)-[:OWNS {declared:true}]->(s)
    OPTIONAL MATCH (knower:Person)-[k:KNOWS]->(s)
    WHERE knower.active = true
    OPTIONAL MATCH (knower)-[:MEMBER_OF]->(t:Team)
    RETURN s.name AS service, s.desc AS desc, s.criticality AS criticality,
           collect(DISTINCT declared.name) AS declaredOwners,
           collect(DISTINCT knower.name) AS knowerNames,
           collect(DISTINCT k.weight) AS knowerWeights,
           collect(DISTINCT knower.role) AS knowerRoles
    LIMIT 5
  `;
  const { rows, cypher: used } = await runQuery<Record<string, unknown>>(cypher, {
    tokens,
  });
  return { rows, cypher: [used] };
}

export async function companyOverview() {
  const cypher = `
    MATCH (c:Company {id:'company'})
    OPTIONAL MATCH (p:Person) WHERE p.active = true
    OPTIONAL MATCH (s:Service)
    OPTIONAL MATCH (d:Decision {status:'active'})
    RETURN c.name AS company, c.tagline AS tagline,
           count(DISTINCT p) AS people,
           count(DISTINCT s) AS services,
           count(DISTINCT d) AS activeDecisions
  `;
  return runQuery(cypher);
}

export async function recordDecision(input: {
  title: string;
  summary: string;
  ownerNames: string[];
  citeIds?: string[];
}) {
  const id = `dec_${Date.now().toString(36)}`;
  const decidedAt = new Date().toISOString().slice(0, 10);
  const create = `
    CREATE (d:Decision {
      id:$id, title:$title, summary:$summary,
      decidedAt:$decidedAt, status:'active'
    })
    RETURN d.id AS id
  `;
  const { cypher: c1 } = await runQuery(create, {
    id,
    title: input.title,
    summary: input.summary,
    decidedAt,
  });

  const cyphers = [c1];
  for (const name of input.ownerNames) {
    const { cypher } = await runQuery(
      `MATCH (p:Person), (d:Decision {id:$id})
       WHERE toLower(p.name) CONTAINS toLower($name)
       CREATE (p)-[:DECIDED]->(d)`,
      { id, name },
    );
    cyphers.push(cypher);
  }

  for (const cite of input.citeIds || []) {
    const { cypher } = await runQuery(
      `MATCH (d:Decision {id:$id})
       OPTIONAL MATCH (doc:Doc {id:$cite})
       OPTIONAL MATCH (tk:Ticket {id:$cite})
       OPTIONAL MATCH (pr:PR {id:$cite})
       OPTIONAL MATCH (inc:Incident {id:$cite})
       OPTIONAL MATCH (svc:Service {id:$cite})
       WITH d, coalesce(doc, tk, pr, inc, svc) AS src
       WHERE src IS NOT NULL
       CREATE (d)-[:CITES]->(src)`,
      { id, cite },
    );
    cyphers.push(cypher);
  }

  return { id, decidedAt, cypher: cyphers };
}

export async function fetchGraphPayload(limit = 80): Promise<GraphPayload> {
  const { rows: nodeRows } = await runQuery<{
    id: string;
    label: string;
    type: string;
    meta: string;
  }>(
    `
    MATCH (n)
    WHERE n:Person OR n:Service OR n:Decision OR n:Doc OR n:Team OR n:Incident
    RETURN coalesce(n.id, n.name) AS id,
           coalesce(n.name, n.title, n.id) AS label,
           labels(n)[0] AS type,
           coalesce(n.role, n.criticality, n.status, n.severity, '') AS meta
    LIMIT $limit
  `,
    { limit },
  );

  const ids = new Set(nodeRows.map((n) => asString(n.id)));

  const { rows: edgeRows } = await runQuery<{
    source: string;
    target: string;
    rel: string;
  }>(`
    MATCH (a)-[r]->(b)
    WHERE (a:Person OR a:Service OR a:Decision OR a:Doc OR a:Team OR a:Incident)
      AND (b:Person OR b:Service OR b:Decision OR b:Doc OR b:Team OR b:Incident OR b:PR OR b:Ticket)
      AND type(r) IN ['KNOWS','OWNS','DECIDED','CITES','SUPERSEDES','DEPENDS_ON','MEMBER_OF','IN','FIXED','PAGED_FOR','PART_OF','RUNS_AT']
    RETURN coalesce(a.id, a.name) AS source,
           coalesce(b.id, b.name, b.title) AS target,
           type(r) AS rel
    LIMIT 120
  `);

  const nodes = nodeRows.map((n) => ({
    id: asString(n.id),
    label: asString(n.label),
    type: asString(n.type),
    meta: asString(n.meta) || undefined,
  }));

  const edges = edgeRows
    .map((e, i) => ({
      id: `e${i}`,
      source: asString(e.source),
      target: asString(e.target),
      rel: asString(e.rel),
    }))
    .filter((e) => ids.has(e.source));

  return { nodes, edges };
}
