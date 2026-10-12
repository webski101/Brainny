import type { AgentAnswer } from "./types";
import {
  busFactor,
  companyOverview,
  decisionAutopsy,
  findExperts,
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
  const named = q.match(/\b(priya|marcus|lena|jon|aya|sam|nina|dev|kai|owen|rita|eli)(?:\s+\w+)?/i);
  if (named) return named[1];
  return undefined;
}

function extractTopic(q: string): string {
  const review = q.match(/review(?:ing)?\s+(?:the\s+)?(.+?)(?:\?|$)/i);
  if (review) return review[1].replace(/\b(refactor|change|pr|for)\b/gi, " ").trim();

  const about = q.match(/(?:about|on|for|regarding)\s+(.+?)(?:\?|$)/i);
  if (about) return about[1].trim();

  const why = q.match(/why\s+(?:did\s+we\s+)?(?:pick|choose|decide|select)\s+(.+?)(?:\?|$)/i);
  if (why) return why[1].trim();

  const owns = q.match(/own(?:s|ership)?\s+(?:of\s+)?(.+?)(?:\?|$)/i);
  if (owns) return owns[1].trim();

  return q
    .replace(/\?/g, "")
    .replace(/\b(who|what|which|should|i|ask|about|the|a|an|for|to|of|is|are|can|we|our)\b/gi, " ")
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
      answer: "Ask Brainny something about Northstar Pay — people, services, decisions, or bus factor.",
      path: [],
      sources: [],
      cypher: [],
    };
  }

  // Bus factor / departure risk
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

    const focus = (critical.length ? critical : result.busFactor.slice(0, 4)).map(
      (b) =>
        person
          ? {
              ...b,
              criticalPeople: [person, ...b.criticalPeople.filter((n) => n.toLowerCase() !== person.toLowerCase())].slice(0, 3),
            }
          : b,
    );
    const lines = focus.map(
      (b) =>
        `• **${b.service}** — ${b.score}% concentration (${b.risk}). Key people: ${b.criticalPeople.join(", ") || "none active"}`,
    );

    const answer = person
      ? `If **${person}** left, these services lose disproportionate knowledge:\n\n${lines.join("\n")}\n\nBrainny measured this from KNOWS edges (PRs, incidents, tickets, ownership) — not job titles.`
      : `Company-wide bus factor hotspots:\n\n${lines.join("\n")}\n\nCritical services with one dominant knower are highlighted for review.`;

    return {
      status: critical.some((c) => c.risk === "critical") ? "partial" : "ok",
      intent: "bus_factor",
      answer,
      path: result.path.map((p) =>
        person ? { ...p, from: person } : p,
      ),
      sources: result.sources,
      cypher: result.cypher,
      busFactor: focus,
      highlights: focus.map((b) => b.service),
    };
  }

  // Decision autopsy
  if (
    q.includes("why did we") ||
    q.includes("why do we") ||
    q.includes("decision") ||
    q.includes("chose") ||
    q.includes("choose") ||
    q.includes("pick") ||
    q.includes("stripe") ||
    q.includes("adyen") ||
    q.includes("psp")
  ) {
    const topic = extractTopic(question) || "psp";
    const result = await decisionAutopsy(topic);

    if (!result.decision) {
      return {
        status: "abstain",
        intent: "decision_autopsy",
        answer: result.reason || "No matching decision with sources in the graph.",
        path: [],
        sources: [],
        cypher: result.cypher,
        decision: null,
      };
    }

    const d = result.decision;
    if (result.abstain && d.supersededBy) {
      return {
        status: "abstain",
        intent: "decision_autopsy",
        answer: `${result.reason}\n\nHistorical summary (not current policy): ${d.summary}\nOwners then: ${d.owners.join(", ")}. Evidence: ${d.cites.join("; ") || "none"}.`,
        path: result.path,
        sources: result.sources,
        cypher: result.cypher,
        decision: d,
      };
    }

    return {
      status: "ok",
      intent: "decision_autopsy",
      answer: `**${d.title}** (${d.decidedAt})\n\n${d.summary}\n\nOwners: ${d.owners.join(", ") || "unknown"}.\nCited evidence: ${d.cites.join("; ") || "none linked"}.\n\nEvery hop above is a FalkorDB edge — Brainny will not invent provenance.`,
      path: result.path,
      sources: result.sources,
      cypher: result.cypher,
      decision: d,
    };
  }

  // Ownership vs knowledge
  if (q.includes("own") || q.includes("owner") || q.includes("responsible")) {
    const topic = extractTopic(question) || "rails";
    const { rows, cypher } = await whoOwns(topic);
    if (!rows.length) {
      return {
        status: "abstain",
        intent: "ownership",
        answer: `No service matched “${topic}”. Try card-rails, ledger-core, fraud-engine, or settlement.`,
        path: [],
        sources: [],
        cypher,
      };
    }

    const blocks = rows.map((r) => {
      const declared = (Array.isArray(r.declaredOwners) ? r.declaredOwners : [])
        .filter(Boolean)
        .map(String);
      const names = (Array.isArray(r.knowerNames) ? r.knowerNames : [])
        .filter(Boolean)
        .map(String);
      const roles = (Array.isArray(r.knowerRoles) ? r.knowerRoles : []).map(String);
      const weights = (Array.isArray(r.knowerWeights) ? r.knowerWeights : []).map(
        (w) => Number(w) || 1,
      );
      const knowers = names
        .map((name, i) => `${name} (weight ${weights[i] || 1}${roles[i] ? `, ${roles[i]}` : ""})`)
        .slice(0, 4)
        .join("; ");
      return `**${r.service}** (${r.criticality})\nDeclared owners: ${declared.join(", ") || "none"}\nEvidence-based knowers: ${knowers || "none"}`;
    });

    return {
      status: "ok",
      intent: "ownership",
      answer: `Declared ownership vs earned knowledge for “${topic}”:\n\n${blocks.join("\n\n")}\n\nTitles can lie. Brainny ranks people by graph evidence.`,
      path: rows.flatMap((r) => {
        const declared = (Array.isArray(r.declaredOwners) ? r.declaredOwners : []) as string[];
        return declared.slice(0, 2).map((name) => ({
          from: String(name),
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
    };
  }

  // Expertise / who should review
  if (
    q.includes("who") ||
    q.includes("review") ||
    q.includes("ask") ||
    q.includes("expert") ||
    q.includes("knows")
  ) {
    const topic = extractTopic(question) || "payments";
    const result = await findExperts(topic);
    const active = result.people.filter((p) => p.active);

    if (!active.length) {
      return {
        status: "abstain",
        intent: "expertise",
        answer: `No active experts found for “${topic}”. Knowledge may be missing or only held by people who left.`,
        path: result.path,
        sources: result.sources,
        cypher: result.cypher,
        people: result.people,
      };
    }

    const lines = active.map(
      (p, i) =>
        `${i + 1}. **${p.name}** — ${p.role}, ${p.team} (score ${p.score})\n   Evidence: ${p.reasons.join("; ") || "graph degree"}`,
    );

    return {
      status: "ok",
      intent: "expertise",
      answer: `Best people to involve for **${topic}**:\n\n${lines.join("\n")}\n\nRanked from FalkorDB KNOWS / PR / incident paths, not the org chart.`,
      path: result.path,
      sources: result.sources,
      cypher: result.cypher,
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
    answer: `**${c.company || "Northstar Pay"}** — ${c.tagline || "company graph"}.\n\nBrainny currently tracks ${c.people || "?"} active people, ${c.services || "?"} services, and ${c.activeDecisions || "?"} active decisions.\n\nTry asking:\n• Who should review the payments refactor?\n• What breaks if Priya leaves?\n• Why did we pick Stripe over Adyen?\n• Who owns card-rails vs who actually knows it?`,
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
