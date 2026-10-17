# Brainny

Company brain for the [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb) hackathon.

**Track:** Company Brain

Brainny answers questions about a synthetic fintech (**Northstar Pay**) by walking a **FalkorDB** graph of people, teams, services, PRs, incidents, docs, tickets, and decisions. It ranks who *actually* knows what (not org-chart owners), surfaces bus-factor risk, walks multi-hop `DEPENDS_ON` blast radius, traces decision provenance through `SUPERSEDES` / `CITES`, and **abstains** when knowledge is superseded.

**Live:** https://brainny.vercel.app  
**Repo:** https://github.com/webski101/Brainny

## Why the graph matters

If you remove FalkorDB, Brainny cannot answer. Expertise scores, bus-factor concentration, variable-length dependency paths, and decision lineages are Cypher over graph structure — not vector search or a flat table join.

Demo contrast:

- **1 hop** (`Service←DEPENDS_ON-Service`) looks like something SQL could do.
- **3–4 hops** (`DEPENDS_ON*1..4`) surfaces upstream callers the org chart never lists.

## Quick start

### 1. Start FalkorDB

```bash
docker compose up -d
# FalkorDB on localhost:6380
```

### 2. Install & run

```bash
npm install
cp .env.example .env.local   # defaults are fine for local Docker
npm run dev
```

Open [http://localhost:3456](http://localhost:3456). The first ask auto-seeds the Northstar Pay graph.

Optional: `npm run seed` to reset the graph from the CLI.

## Deploy (Vercel)

```bash
FALKORDB_HOST=...
FALKORDB_PORT=...
FALKORDB_PASSWORD=...
FALKORDB_GRAPH=brainny
# Optional (Cloud free has no TLS)
# FALKORDB_USERNAME=falkordb
# FALKORDB_TLS=true
```

After deploy, hit `POST /api/seed` once (or ask any question — first ask auto-seeds).

## Try these questions

- Who should review the payments refactor? *(multi-hop Person→PR→Service→DEPENDS_ON)*
- What breaks if Priya leaves? *(KNOWS concentration + upstream DEPENDS_ON\*)*
- What breaks if ledger-core goes down? *(variable-length DEPENDS_ON\*1..4 — best multi-hop demo)*
- Why did we pick Stripe over Adyen? *(DECIDED / CITES / SUPERSEDES lineage)*
- Who owns card-rails vs who actually knows it?

## Graph data model

```
Company
  └── PART_OF ← Team ← MEMBER_OF ← Person
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
                  OWNS              KNOWS           DECIDED
                    │                 │                 │
                    ▼                 ▼                 ▼
                 Service ←───────────┘            Decision
                    │                                 │
         DEPENDS_ON │ (variable length)           CITES / SUPERSEDES
                    ▼                                 ▼
                 Service                    Doc | Ticket | PR | Incident
                    ▲
    PR ─TOUCHES─────┤
    Ticket─AFFECTS──┤
    Incident─IN─────┘

Person ─WROTE|REVIEWED→ PR
Person ─FIXED|PAGED_FOR→ Incident
Person ─FIXED|ASSIGNED→ Ticket
Person ─HAS_SKILL→ Skill
```

### Node labels

| Label | Meaning |
|-------|---------|
| `Company` | Northstar Pay |
| `Team` | Org unit |
| `Person` | Employee (`active`, `leftAt`, `role`) |
| `Service` | Runtime system (`criticality`) |
| `PR` | Pull request evidence |
| `Ticket` | Work item |
| `Incident` | Outage / page |
| `Doc` | RFC, runbook, policy |
| `Decision` | Recorded choice (`status`, `decidedAt`) |
| `Skill` | Tagged capability |

### Relationship types

| Rel | From → To | Role |
|-----|-----------|------|
| `MEMBER_OF` | Person → Team | Org membership |
| `PART_OF` | Team → Company | Hierarchy |
| `OWNS` | Person → Service | Declared ownership (`declared`) |
| `KNOWS` | Person → Service | Evidence-weighted expertise (`weight`) |
| `DEPENDS_ON` | Service → Service | Runtime dependency (multi-hop) |
| `WROTE` / `REVIEWED` | Person → PR | Code evidence |
| `TOUCHES` | PR → Service | PR scope |
| `FIXED` / `PAGED_FOR` | Person → Incident | Ops evidence |
| `IN` | Incident → Service | Incident scope |
| `ASSIGNED` / `FIXED` | Person → Ticket | Ticket evidence |
| `AFFECTS` | Ticket → Service | Ticket scope |
| `DECIDED` | Person → Decision | Decision owners |
| `CITES` | Decision → Doc/Ticket/PR/… | Provenance |
| `SUPERSEDES` | Decision → Decision | Decision lineage |
| `HAS_SKILL` | Person → Skill | Capability tags |

`KNOWS` is **inferred at seed time** from PRs, incidents, tickets, and ownership — not from job titles.

## Cypher queries Brainny depends on

All live in `src/lib/queries.ts` and are returned with every answer (UI: Path / Sources / Cypher).

### 1. Expertise ranking (`findExperts`)

```cypher
MATCH (p:Person)-[k:KNOWS]->(s:Service)
WHERE ANY(token IN $tokens WHERE toLower(s.name) CONTAINS token OR toLower(s.desc) CONTAINS token)
OPTIONAL MATCH (p)-[:WROTE|REVIEWED]->(pr:PR)-[:TOUCHES]->(s)
OPTIONAL MATCH (p)-[:FIXED|PAGED_FOR]->(inc:Incident)-[:IN]->(s)
OPTIONAL MATCH (p)-[:FIXED|ASSIGNED]->(tk:Ticket)-[:AFFECTS]->(s)
OPTIONAL MATCH (p)-[:MEMBER_OF]->(t:Team)
WITH p, t,
  sum(coalesce(k.weight,1)) + count(DISTINCT pr)*2 + count(DISTINCT inc)*3 + count(DISTINCT tk) AS score,
  collect(DISTINCT s.name) AS services
...
```

### 2. Multi-hop evidence paths (`expertisePaths`)

```cypher
MATCH (p:Person)-[work:WROTE|REVIEWED]->(pr:PR)-[:TOUCHES]->(s:Service)
WHERE p.active = true AND ANY(token IN $tokens WHERE ...)
OPTIONAL MATCH (s)-[:DEPENDS_ON]->(dep:Service)
...
```

Person → PR → Service → DEPENDS_ON — a path a keyword search cannot invent.

### 3. Bus factor (`busFactor`)

```cypher
MATCH (p:Person)-[k:KNOWS]->(s:Service)
OPTIONAL MATCH (other:Person)-[ok:KNOWS]->(s)
WHERE other.active = true AND other <> p
WITH ..., toFloat(myWeight)/(myWeight+otherWeight) AS concentration
...
```

### 4. Departure + upstream blast (`departureBlastRadius`) — multi-hop

```cypher
MATCH (p:Person)-[:KNOWS]->(s:Service)
OPTIONAL MATCH path = (upstream:Service)-[:DEPENDS_ON*1..3]->(s)
...
```

### 5. Service blast radius (`blastRadius`) — multi-hop ★

```cypher
MATCH (target:Service)
MATCH path = (upstream:Service)-[:DEPENDS_ON*1..4]->(target)
RETURN upstream, length(path) AS hops, ...
```

Variable-length path (`*1..4`). Depth 1 ≈ a join; depth 3–4 is why the graph exists.

### 6. Decision autopsy (`decisionAutopsy`)

```cypher
MATCH (d:Decision)
OPTIONAL MATCH (newer:Decision)-[:SUPERSEDES]->(d)
OPTIONAL MATCH (owner:Person)-[:DECIDED]->(d)
OPTIONAL MATCH (d)-[:CITES]->(src)
...
```

Abstains when `SUPERSEDES` marks a decision non-current.

### 7. Decision lineage (`decisionLineage`) — multi-hop

```cypher
OPTIONAL MATCH chain = (head:Decision)-[:SUPERSEDES*0..4]->(d)
RETURN [n IN nodes(chain) | n.title] AS lineage
```

### 8. Ownership vs knowledge (`whoOwns`)

```cypher
OPTIONAL MATCH (declared:Person)-[:OWNS {declared:true}]->(s)
OPTIONAL MATCH (knower:Person)-[k:KNOWS]->(s)
...
```

## How the “agent” works

Brainny is a **deterministic Cypher router**, not an LLM chat bot:

1. Classify the question into an intent (bus factor, blast radius, expertise, ownership, decision).
2. Run the matching FalkorDB Cypher tool(s).
3. Return answer + graph path + sources + the exact Cypher used.
4. **Abstain** when the graph has no match or the decision is superseded.

No OpenAI/Anthropic call is required for the demo. Optional `OPENAI_API_KEY` in `.env.example` is reserved for a future tool-calling loop and is unused today.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/ask` | `{ "question": "..." }` → grounded answer + path + sources + Cypher |
| `GET`  | `/api/graph` | Nodes/edges for the canvas |
| `POST` | `/api/seed` | Reset & reseed Northstar Pay |
| `POST` | `/api/decide` | Write a new `Decision` node into the graph |

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- FalkorDB (`falkordb` Node client)
- Deterministic Cypher agent (no API key required)

## Hackathon notes

- Track: **Company Brain**
- FalkorDB is mandatory and load-bearing
- Dataset is synthetic (Northstar Pay) — no private company data
- Main implementation lives in `src/lib/{queries,agent,seed,seed-data,falkordb}.ts`

## AI coding assistant disclosure

This project was built with assistance from AI coding tools (Cursor). The graph model, Cypher queries, abstain rules, and product decisions were designed and verified by the author. The author can explain the schema, every query in `src/lib/queries.ts`, and why FalkorDB is required for multi-hop blast radius and decision lineage.

## License

MIT — see [LICENSE](./LICENSE).
