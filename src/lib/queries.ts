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

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "on",
  "for",
  "in",
  "at",
  "by",
  "or",
  "and",
  "vs",
  "versus",
  "who",
  "what",
  "why",
  "how",
  "did",
  "do",
  "we",
  "our",
  "us",
  "it",
  "its",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "as",
  "if",
  "when",
  "with",
  "from",
  "into",
  "about",
  "actually",
  "knows",
  "know",
  "own",
  "owns",
  "ownership",
  "decide",
  "decided",
  "decision",
  "pick",
  "chose",
  "choose",
  "select",
  "should",
  "review",
  "refactor",
  "change",
  "pr",
  "over",
  "than",
  "that",
  "this",
  "those",
  "these",
  "their",
  "them",
  "they",
  "i",
  "me",
  "my",
  "you",
  "your",
  "no",
  "not",
  "such",
  "service",
  "services",
  "goes",
  "down",
  "outage",
  "fails",
  "dies",
]);

/** Expand casual words into graph-friendly tokens (stopwords stripped). */
export function expandTopic(topic: string): string[] {
  const t = topic.toLowerCase().trim();
  const tokens = new Set<string>();
  for (const part of t.split(/[^a-z0-9-]+/).filter(Boolean)) {
    // Require 3+ chars so "no" cannot match "notify-hub"
    if (part.length < 3 || STOPWORDS.has(part)) continue;
    tokens.add(part);
    // settlements → settle, card-rails kept as whole + parts
    if (part.endsWith("s") && part.length > 4) tokens.add(part.slice(0, -1));
    if (part.includes("-")) {
      for (const bit of part.split("-")) {
        if (bit.length >= 3 && !STOPWORDS.has(bit)) tokens.add(bit);
      }
    }
  }
  // Only broaden when the topic is clearly about payments broadly — not a named service
  const namedService =
    /card-rails|ledger-core|settlement|fraud-engine|webhooks|partner-sdk|identity|billing-ui|notify-hub/.test(
      t,
    );
  if (
    !namedService &&
    (t.includes("payment") || t.includes("psp") || /\bcards?\b/.test(t))
  ) {
    tokens.add("rails");
    tokens.add("card");
    tokens.add("ledger");
    tokens.add("settle");
    tokens.add("payment");
  }
  if (!namedService && t.includes("refactor")) tokens.add("rails");
  if (t.includes("fraud") || t.includes("aml")) tokens.add("fraud");
  if (t.includes("adyen") || t.includes("stripe")) {
    tokens.add("adyen");
    tokens.add("stripe");
    tokens.add("psp");
  }
  if (t.includes("freeze") || t.includes("imbalance")) {
    tokens.add("freeze");
    tokens.add("settlement");
    tokens.add("ledger");
    tokens.add("imbalance");
  }
  return [...tokens];
}

/** Display name with (left) for inactive people */
export function personLabel(name: string, active?: boolean | null) {
  if (active === false) return `${name} (left)`;
  return name;
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
    const active = Boolean(r.active);
    const name = asString(r.name);
    const reasons = [
      ...(r.services || []).slice(0, 2).map((s) => `knows ${s}`),
      ...(r.prs || []).filter(Boolean).slice(0, 1).map((p) => `PR: ${p}`),
      ...(r.incs || []).filter(Boolean).slice(0, 1).map((i) => `incident: ${i}`),
    ];
    return {
      name: personLabel(name, active),
      role: asString(r.role),
      team: asString(r.team),
      score: asNumber(r.score),
      active,
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
      RETURN p.name AS person, p.active AS personActive,
             s.name AS service, s.criticality AS criticality,
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
    const rawPeople = (Array.isArray(r.people) ? r.people : [])
      .filter(Boolean)
      .map(String);
    const peopleActive = (Array.isArray(r.peopleActive)
      ? r.peopleActive
      : []) as boolean[];
    const focusActive =
      r.personActive === undefined ? true : Boolean(r.personActive);
    const focusName = r.person ? asString(r.person) : undefined;
    const people = rawPeople.map((n, i) =>
      personLabel(n, peopleActive[i] ?? true),
    );
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
      focusPerson: focusName
        ? personLabel(focusName, focusActive)
        : undefined,
      focusActive,
    };
  });

  const path: PathHop[] = busFactorHits.slice(0, 5).map((b) => ({
    from: b.focusPerson || b.criticalPeople[0] || "unknown",
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

  const person =
    busFactorHits[0]?.focusPerson ||
    (personName ? personLabel(personName, true) : undefined);

  return { busFactor: busFactorHits, path, sources, cypher: [used], person };
}

function scoreDecisionMatch(
  title: string,
  summary: string,
  tokens: string[],
  hint: string,
): number {
  const t = title.toLowerCase();
  const s = summary.toLowerCase();
  const h = hint.toLowerCase();
  let score = 0;
  if (h && t.includes(h)) score += 50;
  if (h && s.includes(h)) score += 20;
  for (const token of tokens) {
    if (t.includes(token)) score += 10;
    else if (s.includes(token)) score += 4;
  }
  return score;
}

export async function decisionAutopsy(topic: string) {
  const tokens = expandTopic(topic);
  const hint = topic.toLowerCase().replace(/[^a-z0-9\s-]+/g, " ").trim();
  if (!tokens.length) {
    return {
      decision: null as DecisionHit | null,
      path: [] as PathHop[],
      sources: [] as SourceRef[],
      cypher: [] as string[],
      abstain: true as const,
      reason: `No decision in the company graph matches “${topic}”.`,
    };
  }
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
           newer.id AS supersededById,
           newer.title AS supersededByTitle,
           collect(DISTINCT owner.name) AS owners,
           collect(DISTINCT owner.active) AS ownerActive,
           collect(DISTINCT coalesce(src.title, src.id)) AS cites
    ORDER BY d.decidedAt DESC
    LIMIT 10
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

  const ranked = [...rows].sort((a, b) => {
    const sa = scoreDecisionMatch(
      asString(a.title),
      asString(a.summary),
      tokens,
      hint,
    );
    const sb = scoreDecisionMatch(
      asString(b.title),
      asString(b.summary),
      tokens,
      hint,
    );
    if (sb !== sa) return sb - sa;
    const aActive = asString(a.status) === "active" && !a.supersededById ? 1 : 0;
    const bActive = asString(b.status) === "active" && !b.supersededById ? 1 : 0;
    return bActive - aActive;
  });
  const preferred = ranked[0];

  const status = asString(preferred.status, "active") as DecisionHit["status"];
  const supersededByTitle = preferred.supersededByTitle
    ? asString(preferred.supersededByTitle)
    : undefined;
  const supersededById = preferred.supersededById
    ? asString(preferred.supersededById)
    : undefined;

  const ownerNames = (Array.isArray(preferred.owners) ? preferred.owners : [])
    .filter(Boolean)
    .map(String);
  const ownerActive = (Array.isArray(preferred.ownerActive)
    ? preferred.ownerActive
    : []) as boolean[];

  const decision: DecisionHit = {
    id: asString(preferred.id),
    title: asString(preferred.title),
    summary: asString(preferred.summary),
    decidedAt: asString(preferred.decidedAt),
    status:
      supersededById || status === "superseded" ? "superseded" : "active",
    supersededBy: supersededByTitle || supersededById,
    owners: ownerNames.map((n, i) => personLabel(n, ownerActive[i])),
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

  if (decision.status === "superseded" && supersededByTitle) {
    path.push({
      from: supersededByTitle,
      rel: "SUPERSEDES",
      to: decision.title,
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
      ? `Decision “${decision.title}” is superseded${supersededByTitle ? ` by “${supersededByTitle}”` : ""}. Citing it as current policy would be wrong.`
      : undefined,
  };
}

export async function whoOwns(serviceHint: string) {
  const tokens = expandTopic(serviceHint);
  const hint = serviceHint
    .toLowerCase()
    .replace(/\bvs\b.*$/i, "")
    .replace(/[^a-z0-9-]+/g, " ")
    .trim();
  const cypher = `
    MATCH (s:Service)
    WHERE toLower(s.name) CONTAINS $hint
       OR ANY(token IN $tokens WHERE
            toLower(s.name) CONTAINS token OR
            toLower(s.desc) CONTAINS token)
    WITH s,
      CASE
        WHEN toLower(s.name) = $hint THEN 0
        WHEN toLower(s.name) CONTAINS $hint THEN 1
        WHEN ANY(token IN $tokens WHERE toLower(s.name) CONTAINS token) THEN 2
        ELSE 3
      END AS rank
    ORDER BY rank ASC
    WITH s LIMIT 1
    OPTIONAL MATCH (declared:Person)-[:OWNS {declared:true}]->(s)
    OPTIONAL MATCH (knower:Person)-[k:KNOWS]->(s)
    WHERE knower.active = true
    WITH s,
      collect(DISTINCT declared) AS declaredNodes,
      collect(DISTINCT knower) AS knowerNodes,
      collect(DISTINCT k) AS knowRels
    RETURN s.name AS service, s.desc AS desc, s.criticality AS criticality,
           [d IN declaredNodes WHERE d IS NOT NULL | d.name] AS declaredOwners,
           [d IN declaredNodes WHERE d IS NOT NULL | d.active] AS declaredActive,
           [k IN knowerNodes WHERE k IS NOT NULL | k.name] AS knowerNames,
           [k IN knowerNodes WHERE k IS NOT NULL | k.role] AS knowerRoles,
           [r IN knowRels WHERE r IS NOT NULL | coalesce(r.weight, 1)] AS knowerWeights
  `;
  const { rows, cypher: used } = await runQuery<Record<string, unknown>>(cypher, {
    tokens,
    hint,
  });
  return { rows, cypher: [used], found: rows.length > 0 };
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

/**
 * Multi-hop blast radius: services that DEPENDS_ON* a target (1–4 hops).
 * A flat table cannot answer "who is affected three hops upstream" without joins.
 */
export async function blastRadius(serviceHint: string) {
  const tokens = expandTopic(serviceHint);
  const hint = serviceHint.toLowerCase().replace(/[^a-z0-9-]+/g, " ").trim();
  const cypher = `
    MATCH (target:Service)
    WHERE toLower(target.name) CONTAINS $hint
       OR ANY(token IN $tokens WHERE
            toLower(target.name) CONTAINS token OR
            toLower(target.desc) CONTAINS token)
    WITH target,
      CASE
        WHEN toLower(target.name) = $hint THEN 0
        WHEN toLower(target.name) CONTAINS $hint THEN 1
        WHEN ANY(token IN $tokens WHERE toLower(target.name) CONTAINS token) THEN 2
        ELSE 3
      END AS rank
    ORDER BY rank ASC
    WITH target LIMIT 1
    MATCH path = (upstream:Service)-[:DEPENDS_ON*1..4]->(target)
    WITH target, upstream, length(path) AS hops
    OPTIONAL MATCH (knower:Person)-[k:KNOWS]->(upstream)
    WHERE knower.active = true
    WITH target, upstream, hops, upstream.criticality AS criticality,
         collect(DISTINCT knower.name)[0..3] AS knowers
    RETURN target.name AS target,
           upstream.name AS affected,
           hops,
           criticality,
           knowers
    ORDER BY hops ASC, criticality DESC
  `;
  // Resolve target first so we can distinguish unknown vs no dependents
  const resolveCypher = `
    MATCH (target:Service)
    WHERE toLower(target.name) CONTAINS $hint
       OR ANY(token IN $tokens WHERE
            toLower(target.name) CONTAINS token OR
            toLower(target.desc) CONTAINS token)
    WITH target,
      CASE
        WHEN toLower(target.name) = $hint THEN 0
        WHEN toLower(target.name) CONTAINS $hint THEN 1
        WHEN ANY(token IN $tokens WHERE toLower(target.name) CONTAINS token) THEN 2
        ELSE 3
      END AS rank
    ORDER BY rank ASC
    RETURN target.name AS target
    LIMIT 1
  `;
  const resolved = await runQuery<{ target: string }>(resolveCypher, {
    tokens,
    hint,
  });
  if (!resolved.rows.length) {
    return {
      target: null,
      unknown: true as const,
      rows: [] as {
        affected: string;
        hops: number;
        criticality: string;
        knowers: string[];
      }[],
      path: [] as PathHop[],
      sources: [] as SourceRef[],
      cypher: [resolved.cypher],
    };
  }

  const targetName = asString(resolved.rows[0].target);
  const { rows, cypher: used } = await runQuery<{
    target: string;
    affected: string;
    hops: number;
    criticality: string;
    knowers: string[];
  }>(cypher, { tokens, hint });

  const path: PathHop[] = rows.slice(0, 8).map((r) => ({
    from: asString(r.affected),
    rel: `DEPENDS_ON×${asNumber(r.hops)}`,
    to: asString(r.target),
    detail: asString(r.criticality),
  }));

  const sources: SourceRef[] = [
    ...new Map(
      rows.map((r) => [
        asString(r.affected),
        {
          id: asString(r.affected),
          kind: "Service",
          title: `${asString(r.affected)} (${asNumber(r.hops)} hop${asNumber(r.hops) === 1 ? "" : "s"})`,
          status: "active" as const,
        },
      ]),
    ).values(),
  ];

  return {
    target: targetName,
    unknown: false as const,
    rows: rows.map((r) => ({
      affected: asString(r.affected),
      hops: asNumber(r.hops),
      criticality: asString(r.criticality),
      knowers: (Array.isArray(r.knowers) ? r.knowers : [])
        .filter(Boolean)
        .map(String),
    })),
    path,
    sources,
    cypher: [resolved.cypher, used],
  };
}

/**
 * Multi-hop: person → KNOWS → service ← DEPENDS_ON* — what goes dark if they leave,
 * including upstream callers that never appear on their org chart.
 */
export async function departureBlastRadius(personName: string) {
  const cypher = `
    MATCH (p:Person)
    WHERE toLower(p.name) CONTAINS toLower($name)
    MATCH (p)-[:KNOWS]->(s:Service)
    OPTIONAL MATCH path = (upstream:Service)-[:DEPENDS_ON*1..3]->(s)
    WITH p, s, collect(DISTINCT {
      name: upstream.name,
      hops: CASE WHEN upstream IS NULL THEN 0 ELSE length(path) END,
      criticality: upstream.criticality
    }) AS upstreams
    RETURN p.name AS person, p.active AS personActive,
           s.name AS service,
           s.criticality AS criticality,
           [u IN upstreams WHERE u.name IS NOT NULL] AS upstreams
    ORDER BY s.criticality DESC
  `;
  const { rows, cypher: used } = await runQuery<{
    person: string;
    personActive: boolean;
    service: string;
    criticality: string;
    upstreams: { name: string; hops: number; criticality: string }[];
  }>(cypher, { name: personName });

  const path: PathHop[] = [];
  for (const r of rows.slice(0, 5)) {
    path.push({
      from: asString(r.person),
      rel: "KNOWS",
      to: asString(r.service),
    });
    for (const u of (r.upstreams || []).slice(0, 3)) {
      path.push({
        from: asString(u.name),
        rel: `DEPENDS_ON×${asNumber(u.hops)}`,
        to: asString(r.service),
        detail: "at risk if knower leaves",
      });
    }
  }

  const sources: SourceRef[] = rows.map((r) => ({
    id: asString(r.service),
    kind: "Service",
    title: asString(r.service),
    status: "active",
  }));

  const person = rows[0]
    ? personLabel(asString(rows[0].person), Boolean(rows[0].personActive))
    : personName;

  return {
    person,
    rows: rows.map((r) => ({
      service: asString(r.service),
      criticality: asString(r.criticality),
      upstreams: (r.upstreams || [])
        .filter((u) => u?.name)
        .map((u) => ({
          name: asString(u.name),
          hops: asNumber(u.hops),
          criticality: asString(u.criticality),
        })),
    })),
    path: path.map((p) =>
      p.rel === "KNOWS" ? { ...p, from: person || p.from } : p,
    ),
    sources,
    cypher: [used],
  };
}

/**
 * Multi-hop expertise path: Person -[:WROTE|REVIEWED]-> PR -[:TOUCHES]-> Service
 * plus optional DEPENDS_ON hop to related services.
 */
export async function expertisePaths(topic: string) {
  const tokens = expandTopic(topic);
  const cypher = `
    MATCH (p:Person)-[work:WROTE|REVIEWED]->(pr:PR)-[:TOUCHES]->(s:Service)
    WHERE p.active = true AND ANY(token IN $tokens WHERE
      toLower(s.name) CONTAINS token OR
      toLower(s.desc) CONTAINS token OR
      toLower(pr.title) CONTAINS token
    )
    OPTIONAL MATCH (s)-[:DEPENDS_ON]->(dep:Service)
    OPTIONAL MATCH (p)-[:MEMBER_OF]->(t:Team)
    WITH p, t, s, dep, type(work) AS workRel, collect(DISTINCT pr.title) AS prTitles
    RETURN p.name AS name, p.role AS role, coalesce(t.name,'') AS team,
           s.name AS service, workRel, prTitles,
           collect(DISTINCT dep.name) AS dependsOn
    ORDER BY size(prTitles) DESC
    LIMIT 8
  `;
  const { rows, cypher: used } = await runQuery<{
    name: string;
    role: string;
    team: string;
    service: string;
    workRel: string;
    prTitles: string[];
    dependsOn: (string | null)[];
  }>(cypher, { tokens });

  const path: PathHop[] = rows.flatMap((r) => {
    const hops: PathHop[] = [
      {
        from: asString(r.name),
        rel: asString(r.workRel),
        to: (r.prTitles || [])[0] || "PR",
      },
      {
        from: (r.prTitles || [])[0] || "PR",
        rel: "TOUCHES",
        to: asString(r.service),
      },
    ];
    for (const d of (r.dependsOn || []).filter(Boolean).slice(0, 1)) {
      hops.push({
        from: asString(r.service),
        rel: "DEPENDS_ON",
        to: String(d),
      });
    }
    return hops;
  });

  const sources: SourceRef[] = rows.map((r) => ({
    id: asString(r.name),
    kind: "Person",
    title: `${asString(r.name)} · ${asString(r.role)}`,
    status: "active",
  }));

  return {
    rows: rows.map((r) => ({
      name: asString(r.name),
      role: asString(r.role),
      team: asString(r.team),
      service: asString(r.service),
      workRel: asString(r.workRel),
      prs: (r.prTitles || []).filter(Boolean).map(String),
      dependsOn: (r.dependsOn || []).filter(Boolean).map(String),
    })),
    path,
    sources,
    cypher: [used],
  };
}

/** Multi-hop SUPERSEDES chain for decision provenance */
export async function decisionLineage(topic: string) {
  const tokens = expandTopic(topic);
  // Prefer an active match, then walk SUPERSEDES*1..4 to older decisions
  const cypher = `
    MATCH (d:Decision)
    WHERE ANY(token IN $tokens WHERE
      toLower(d.title) CONTAINS token OR
      toLower(d.summary) CONTAINS token
    )
    WITH d
    ORDER BY CASE WHEN d.status = 'active' THEN 0 ELSE 1 END, d.decidedAt DESC
    LIMIT 1
    OPTIONAL MATCH (d)-[:SUPERSEDES*1..4]->(older:Decision)
    OPTIONAL MATCH (owner:Person)-[:DECIDED]->(d)
    OPTIONAL MATCH (d)-[:CITES]->(src)
    RETURN d.title AS current, d.status AS status, d.decidedAt AS decidedAt,
           collect(DISTINCT older.title) AS olderTitles,
           collect(DISTINCT older.decidedAt) AS olderDates,
           collect(DISTINCT owner.name) AS owners,
           collect(DISTINCT coalesce(src.title, src.id)) AS cites
  `;
  const { rows, cypher: used } = await runQuery<{
    current: string;
    status: string;
    decidedAt: string;
    olderTitles: (string | null)[];
    olderDates: (string | null)[];
    owners: string[];
    cites: string[];
  }>(cypher, { tokens });

  if (!rows.length) {
    return {
      current: null as string | null,
      lineage: [] as string[],
      path: [] as PathHop[],
      sources: [] as SourceRef[],
      cypher: [used],
    };
  }

  const r = rows[0];
  const older = (r.olderTitles || []).filter(Boolean).map(String);
  const lineage = [asString(r.current), ...older];
  const path: PathHop[] = older.map((title) => ({
    from: asString(r.current),
    rel: "SUPERSEDES",
    to: title,
  }));

  return {
    current: asString(r.current),
    status: asString(r.status),
    decidedAt: asString(r.decidedAt),
    lineage,
    owners: (r.owners || []).filter(Boolean).map(String),
    cites: (r.cites || []).filter(Boolean).map(String),
    path,
    sources: lineage.map((title, i) => ({
      id: title,
      kind: "Decision",
      title,
      status: i === 0 ? ("active" as const) : ("superseded" as const),
    })),
    cypher: [used],
  };
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
    active: boolean | null;
  }>(
    `
    MATCH (n)
    WHERE n:Person OR n:Service OR n:Decision OR n:Doc OR n:Team OR n:Incident
    RETURN coalesce(n.id, n.name) AS id,
           coalesce(n.name, n.title, n.id) AS label,
           labels(n)[0] AS type,
           coalesce(n.role, n.criticality, n.status, n.severity, '') AS meta,
           CASE WHEN n:Person THEN n.active ELSE null END AS active
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

  const nodes = nodeRows.map((n) => {
    const type = asString(n.type);
    const base = asString(n.label);
    const label =
      type === "Person" ? personLabel(base, n.active === false ? false : true) : base;
    return {
      id: asString(n.id),
      label,
      type,
      meta: asString(n.meta) || undefined,
    };
  });

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
