import type { AgentAnswer } from "./types";
import {
  blastRadius,
  busFactor,
  companyOverview,
  decisionAutopsy,
  decisionLineage,
  departureBlastRadius,
  expertisePaths,
  findExperts,
  personLabel,
  whoOwns,
} from "./queries";
import { graphExists } from "./falkordb";
import { seedBrainny } from "./seed";

function normalize(q: string) {
  return q.trim().toLowerCase();
}

function extractPerson(q: string): string | undefined {
  const leave = q.match(/if\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+leaves/i);
  if (leave) return leave[1];
  const named = q.match(
    /\b(priya|marcus|lena|jon|aya|sam|nina|dev|kai|owen|rita|eli)(?:\s+\w+)?/i,
  );
  if (named) return named[1];
  return undefined;
}

function extractTopic(q: string): string {
  const review = q.match(/review(?:ing)?\s+(?:the\s+)?(.+?)(?:\?|$)/i);
  if (review) return review[1].replace(/\b(refactor|change|pr|for)\b/gi, " ").trim();

  const about = q.match(/(?:about|on|for|regarding)\s+(.+?)(?:\?|$)/i);
  if (about) return about[1].trim();

  // "Why did we decide to freeze settlements?" → "freeze settlements"
  const why = q.match(
    /why\s+(?:did\s+we\s+)?(?:pick|choose|decide(?:\s+to)?|select)\s+(.+?)(?:\?|$)/i,
  );
  if (why) return why[1].replace(/^to\s+/i, "").trim();

  // "Who owns card-rails vs who actually knows it?" → "card-rails"
  const owns = q.match(
    /own(?:s|ership)?\s+(?:of\s+)?([a-z0-9-]+(?:\s+[a-z0-9-]+)?)/i,
  );
  if (owns) return owns[1].trim();

  const down = q.match(
    /(?:if|when)\s+([a-z0-9-]+)\s+(?:goes\s+down|is\s+down|dies|fails|outage)/i,
  );
  if (down) return down[1].trim();

  const blast = q.match(
    /(?:blast\s*radius|depends\s+on|upstream\s+of|downstream\s+of)\s+(.+?)(?:\?|$)/i,
  );
  if (blast) return blast[1].trim();

  return q
    .replace(/\?/g, "")
    .replace(
      /\b(who|what|which|should|i|ask|about|the|a|an|for|to|of|is|are|can|we|our|goes|down|if|when|vs|versus|actually|knows)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export async function ensureSeeded() {
  const exists = await graphExists();
  if (!exists) {
    await seedBrainny({ reset: true });
    return;
  }
  try {
    const { rows } = await companyOverview();
    if (!rows.length || !rows[0]) {
      await seedBrainny({ reset: true });
    }
  } catch {
    await seedBrainny({ reset: true });
  }
}

export async function askBrainny(question: string): Promise<AgentAnswer> {
  await ensureSeeded();
  const q = normalize(question);

  if (!q) {
    return {
      status: "abstain",
      intent: "empty",
      answer:
        "Ask Brainny something about Northstar Pay — people, services, decisions, or blast radius.",
      path: [],
      sources: [],
      cypher: [],
    };
  }

  // Multi-hop service blast radius (DEPENDS_ON*1..4)
  if (
    (q.includes("goes down") ||
      q.includes("is down") ||
      q.includes("blast radius") ||
      q.includes("depends on") ||
      q.includes("outage") ||
      q.includes("what fails") ||
      (q.includes("what breaks") && !extractPerson(question))) &&
    !q.includes("leaves")
  ) {
    const topic = extractTopic(question) || "card-rails";
    const result = await blastRadius(topic);

    if (result.unknown || !result.target) {
      return {
        status: "abstain",
        intent: "blast_radius",
        answer: `Unknown service “${topic}”. Try card-rails, ledger-core, settlement, or notify-hub.`,
        path: [],
        sources: [],
        cypher: result.cypher,
      };
    }

    if (!result.rows.length) {
      return {
        status: "ok",
        intent: "blast_radius",
        answer: `**${result.target}** is in the graph, but nothing \`DEPENDS_ON\` it (no upstream callers in 1–4 hops). It can still fail on its own — there just isn’t a blast radius to walk.`,
        path: [],
        sources: [
          {
            id: result.target,
            kind: "Service",
            title: result.target,
            status: "active",
          },
        ],
        cypher: result.cypher,
        highlights: [result.target],
      };
    }

    const byHop = new Map<number, typeof result.rows>();
    for (const row of result.rows) {
      const list = byHop.get(row.hops) || [];
      list.push(row);
      byHop.set(row.hops, list);
    }

    const sections = [...byHop.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hops, rows]) => {
        const lines = rows.map(
          (r) =>
            `• **${r.affected}** (${r.criticality}) — knowers: ${r.knowers.join(", ") || "none"}`,
        );
        return `${hops}-hop upstream:\n${lines.join("\n")}`;
      });

    return {
      status: "ok",
      intent: "blast_radius",
      answer: `If **${result.target}** goes down, FalkorDB walks \`DEPENDS_ON*1..4\` (variable-length path — not a single join):\n\n${sections.join("\n\n")}\n\nDepth matters: 1-hop looks like a table join; 3–4 hops surface callers the org chart never lists.`,
      path: result.path,
      sources: result.sources,
      cypher: result.cypher,
      highlights: [result.target, ...result.rows.map((r) => r.affected)],
    };
  }

  // Bus factor / departure risk — plus multi-hop upstream callers of services they know
  if (
    q.includes("bus factor") ||
    q.includes("leaves") ||
    q.includes("leave") ||
    q.includes("single point") ||
    q.includes("what breaks") ||
    q.includes("knowledge risk")
  ) {
    const person = extractPerson(question);
    const result = await busFactor(person);
    const critical = result.busFactor.filter(
      (b) => b.risk === "critical" || b.risk === "high",
    );

    if (person && critical.length === 0 && result.busFactor.length === 0) {
      return {
        status: "abstain",
        intent: "bus_factor",
        answer: `No concentrated knowledge risk found for “${person}” in the graph. They may not be linked to services yet.`,
        path: [],
        sources: [],
        cypher: result.cypher,
        busFactor: [],
      };
    }

    const focusPerson = result.person || person;
    const focus = (critical.length ? critical : result.busFactor.slice(0, 4)).map(
      (b) =>
        focusPerson
          ? {
              ...b,
              criticalPeople: [
                focusPerson,
                ...b.criticalPeople.filter(
                  (n) =>
                    n.toLowerCase().replace(/\s*\(left\)\s*$/, "") !==
                    focusPerson.toLowerCase().replace(/\s*\(left\)\s*$/, ""),
                ),
              ].slice(0, 3),
            }
          : b,
    );
    const lines = focus.map(
      (b) =>
        `• **${b.service}** — ${b.score}% concentration (${b.risk}). Key people: ${b.criticalPeople.join(", ") || "none active"}`,
    );

    let answer = focusPerson
      ? `If **${focusPerson}** left, these services lose disproportionate knowledge:\n\n${lines.join("\n")}\n\nBrainny measured this from KNOWS edges (PRs, incidents, tickets, ownership) — not job titles.`
      : `Company-wide bus factor hotspots:\n\n${lines.join("\n")}\n\nCritical services with one dominant knower are highlighted for review.`;

    let path = result.path.map((p) =>
      focusPerson ? { ...p, from: focusPerson } : p,
    );
    let sources = result.sources;
    const cypher = [...result.cypher];
    const highlights = focus.map((b) => b.service);

    if (person) {
      const dep = await departureBlastRadius(person);
      cypher.push(...dep.cypher);
      path = [...path, ...dep.path];
      sources = [...sources, ...dep.sources];
      const upstreamLines = dep.rows
        .filter((r) => r.upstreams.length)
        .slice(0, 4)
        .map((r) => {
          const ups = r.upstreams
            .map((u) => `${u.name} (${u.hops} hop${u.hops === 1 ? "" : "s"})`)
            .join(", ");
          return `• Via **${r.service}**: upstream at risk → ${ups}`;
        });
      if (upstreamLines.length) {
        answer += `\n\nMulti-hop blast beyond their direct services (\`Person-KNOWS→Service←DEPENDS_ON*\`):\n${upstreamLines.join("\n")}`;
        for (const r of dep.rows) {
          for (const u of r.upstreams) highlights.push(u.name);
        }
      }
    }

    return {
      status: critical.some((c) => c.risk === "critical") ? "partial" : "ok",
      intent: "bus_factor",
      answer,
      path,
      sources,
      cypher,
      busFactor: focus,
      highlights: [...new Set(highlights)],
    };
  }

  // Decision autopsy + multi-hop SUPERSEDES lineage
  if (
    q.includes("why did we") ||
    q.includes("why do we") ||
    q.includes("decision") ||
    q.includes("chose") ||
    q.includes("choose") ||
    q.includes("pick") ||
    q.includes("stripe") ||
    q.includes("adyen") ||
    q.includes("psp") ||
    q.includes("lineage") ||
    q.includes("supersede")
  ) {
    const topic = extractTopic(question) || "psp";
    const result = await decisionAutopsy(topic);
    const lineage = await decisionLineage(topic);

    if (!result.decision) {
      return {
        status: "abstain",
        intent: "decision_autopsy",
        answer: result.reason || "No matching decision with sources in the graph.",
        path: [],
        sources: [],
        cypher: [...result.cypher, ...lineage.cypher],
        decision: null,
      };
    }

    const d = result.decision;
    const lineageNote =
      lineage.lineage.length > 1
        ? `\n\nSUPERSEDES chain (${lineage.lineage.length} hops): ${lineage.lineage.join(" → ")}`
        : "";

    if (result.abstain && d.supersededBy) {
      return {
        status: "abstain",
        intent: "decision_autopsy",
        answer: `${result.reason}\n\nHistorical summary (not current policy): ${d.summary}\nOwners then: ${d.owners.join(", ")}. Evidence: ${d.cites.join("; ") || "none"}.${lineageNote}`,
        path: [...result.path, ...lineage.path],
        sources: [...result.sources, ...lineage.sources],
        cypher: [...result.cypher, ...lineage.cypher],
        decision: d,
      };
    }

    return {
      status: "ok",
      intent: "decision_autopsy",
      answer: `**${d.title}** (${d.decidedAt})\n\n${d.summary}\n\nOwners: ${d.owners.join(", ") || "unknown"}.\nCited evidence: ${d.cites.join("; ") || "none linked"}.${lineageNote}\n\nEvery hop above is a FalkorDB edge — Brainny will not invent provenance.`,
      path: [...result.path, ...lineage.path],
      sources: [...result.sources, ...lineage.sources],
      cypher: [...result.cypher, ...lineage.cypher],
      decision: d,
    };
  }

  // Ownership vs knowledge
  if (q.includes("own") || q.includes("owner") || q.includes("responsible")) {
    const topic = extractTopic(question) || "rails";
    const { rows, cypher, found } = await whoOwns(topic);
    if (!found || !rows.length) {
      return {
        status: "abstain",
        intent: "ownership",
        answer: `Unknown service “${topic}”. Try card-rails, ledger-core, fraud-engine, or settlement.`,
        path: [],
        sources: [],
        cypher,
      };
    }

    const blocks = rows.map((r) => {
      const declaredRaw = (Array.isArray(r.declaredOwners) ? r.declaredOwners : [])
        .filter(Boolean)
        .map(String);
      const declaredActive = (Array.isArray(r.declaredActive)
        ? r.declaredActive
        : []) as boolean[];
      const declared = declaredRaw.map((n, i) =>
        personLabel(n, declaredActive[i] ?? true),
      );
      const names = (Array.isArray(r.knowerNames) ? r.knowerNames : [])
        .filter(Boolean)
        .map(String);
      const roles = (Array.isArray(r.knowerRoles) ? r.knowerRoles : []).map(String);
      const weights = (Array.isArray(r.knowerWeights) ? r.knowerWeights : []).map(
        (w) => Number(w) || 1,
      );
      const knowers = names
        .map(
          (name, i) =>
            `${name} (weight ${weights[i] || 1}${roles[i] ? `, ${roles[i]}` : ""})`,
        )
        .slice(0, 4)
        .join("; ");
      return `**${r.service}** (${r.criticality})\nDeclared owners: ${declared.join(", ") || "none"}\nEvidence-based knowers: ${knowers || "none"}`;
    });

    return {
      status: "ok",
      intent: "ownership",
      answer: `Declared ownership vs earned knowledge for **${rows[0]?.service || topic}**:\n\n${blocks.join("\n\n")}\n\nTitles can lie. Brainny ranks people by graph evidence.`,
      path: rows.flatMap((r) => {
        const declared = (Array.isArray(r.declaredOwners)
          ? r.declaredOwners
          : []) as string[];
        const declaredActive = (Array.isArray(r.declaredActive)
          ? r.declaredActive
          : []) as boolean[];
        return declared.slice(0, 2).map((name, i) => ({
          from: personLabel(String(name), declaredActive[i] ?? true),
          rel: "OWNS",
          to: String(r.service),
        }));
      }),
      sources: rows.map((r) => ({
        id: String(r.service),
        kind: "Service",
        title: String(r.service),
        status: "active" as const,
      })),
      cypher,
      highlights: rows.map((r) => String(r.service)),
    };
  }

  // Expertise / who should review — with explicit multi-hop Person→PR→Service→DEPENDS_ON paths
  if (
    q.includes("who") ||
    q.includes("review") ||
    q.includes("ask") ||
    q.includes("expert") ||
    q.includes("knows")
  ) {
    const topic = extractTopic(question) || "payments";
    const result = await findExperts(topic);
    const paths = await expertisePaths(topic);
    const active = result.people.filter((p) => p.active);

    if (!active.length) {
      return {
        status: "abstain",
        intent: "expertise",
        answer: `No active experts found for “${topic}”. Knowledge may be missing or only held by people who left.`,
        path: [...result.path, ...paths.path],
        sources: result.sources,
        cypher: [...result.cypher, ...paths.cypher],
        people: result.people,
      };
    }

    const lines = active.map(
      (p, i) =>
        `${i + 1}. **${p.name}** — ${p.role}, ${p.team} (score ${p.score})\n   Evidence: ${p.reasons.join("; ") || "graph degree"}`,
    );

    const pathLines = paths.rows.slice(0, 4).map((r) => {
      const dep =
        r.dependsOn.length > 0 ? ` → DEPENDS_ON → ${r.dependsOn.join(", ")}` : "";
      return `• ${r.name} -[:${r.workRel}]-> PR -[:TOUCHES]-> **${r.service}**${dep}`;
    });

    const pathBlock = pathLines.length
      ? `\n\nMulti-hop evidence paths:\n${pathLines.join("\n")}`
      : "";

    return {
      status: "ok",
      intent: "expertise",
      answer: `Best people to involve for **${topic}**:\n\n${lines.join("\n")}${pathBlock}\n\nRanked from FalkorDB KNOWS / PR / incident paths, not the org chart.`,
      path: [...result.path, ...paths.path],
      sources: [...result.sources, ...paths.sources],
      cypher: [...result.cypher, ...paths.cypher],
      people: active,
      highlights: active.map((p) => p.name),
    };
  }

  // Overview fallback
  const { rows, cypher } = await companyOverview();
  const c = rows[0] || {};
  return {
    status: "ok",
    intent: "overview",
    answer: `**${c.company || "Northstar Pay"}** — ${c.tagline || "company graph"}.\n\nBrainny currently tracks ${c.people || "?"} active people, ${c.services || "?"} services, and ${c.activeDecisions || "?"} active decisions.\n\nTry asking:\n• Who should review the payments refactor?\n• What breaks if Priya leaves?\n• What breaks if ledger-core goes down?\n• Why did we pick Stripe over Adyen?\n• Who owns card-rails vs who actually knows it?`,
    path: [],
    sources: [
      {
        id: "company",
        kind: "Company",
        title: String(c.company || "Northstar Pay"),
        status: "active",
      },
    ],
    cypher: [cypher],
  };
}
