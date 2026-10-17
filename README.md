# Brainny

Company brain for the [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb) hackathon — **Company Brain** track.

Brainny answers questions about a synthetic fintech (**Northstar Pay**) by walking a **FalkorDB** graph of people, services, PRs, incidents, docs, and decisions. It ranks who *actually* knows what (not org-chart owners), surfaces bus-factor risk, traces decision provenance, and **abstains** when knowledge is superseded or stale.

## Why the graph matters

If you remove FalkorDB, Brainny cannot answer. Expertise scores, bus-factor concentration, and decision `SUPERSEDES` / `CITES` paths are Cypher + graph structure — not vector search dressed up as a product.

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

Brainny is a Next.js app. Point env vars at a **hosted** FalkorDB (Cloud free tier or any public Redis-protocol endpoint) — Vercel cannot run the Docker DB.

```bash
# Required on Vercel
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

- Who should review the payments refactor?
- What breaks if Priya leaves?
- Why did we pick Stripe over Adyen?
- Who owns card-rails vs who actually knows it?

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- FalkorDB (`falkordb` Node client) on port **6380**
- Deterministic Cypher agent (no API key required)

## Graph model (summary)

**Nodes:** `Person`, `Team`, `Service`, `PR`, `Ticket`, `Incident`, `Doc`, `Decision`, `Skill`  
**Key edges:** `KNOWS`, `OWNS`, `WROTE` / `REVIEWED`, `FIXED` / `PAGED_FOR`, `DECIDED`, `CITES`, `SUPERSEDES`, `DEPENDS_ON`

`KNOWS` is inferred from real work evidence at seed time.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/ask` | `{ "question": "..." }` → grounded answer + path + sources + Cypher |
| `GET`  | `/api/graph` | Nodes/edges for the canvas |
| `POST` | `/api/seed` | Reset & reseed Northstar Pay |
| `POST` | `/api/decide` | Write a new `Decision` node into the graph |

## Hackathon notes

- Track: **Company Brain**
- FalkorDB is mandatory and load-bearing
- Dataset is synthetic (Northstar Pay) — no private company data
- AI coding assistants may be used; architecture and Cypher are intentional

## License

MIT
