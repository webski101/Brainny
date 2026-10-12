import { getDb, getConfig, getGraph } from "./falkordb";
import * as data from "./seed-data";

export async function seedBrainny(options: { reset?: boolean } = {}) {
  const db = await getDb();
  const { graphName } = getConfig();

  if (options.reset) {
    try {
      const existing = await db.list();
      if (existing.includes(graphName)) {
        const g = db.selectGraph(graphName);
        await g.delete();
      }
    } catch {
      // graph may not exist yet
    }
  }

  const graph = await getGraph();

  await graph.query(`
    CREATE (c:Company {
      id: 'company',
      name: $name,
      tagline: $tagline
    })
  `, {
    params: { name: data.COMPANY.name, tagline: data.COMPANY.tagline },
  });

  for (const t of data.teams) {
    await graph.query(
      `MATCH (c:Company {id:'company'})
       CREATE (team:Team {id:$id, name:$name, mission:$mission})
       CREATE (team)-[:PART_OF]->(c)`,
      { params: t },
    );
  }

  for (const p of data.people) {
    await graph.query(
      `MATCH (team:Team {id:$team})
       CREATE (person:Person {
         id:$id, name:$name, role:$role, active:$active, leftAt:$leftAt
       })
       CREATE (person)-[:MEMBER_OF]->(team)`,
      { params: p },
    );
  }

  for (const s of data.services) {
    await graph.query(
      `MATCH (c:Company {id:'company'})
       CREATE (svc:Service {
         id:$id, name:$name, criticality:$criticality, desc:$desc
       })
       CREATE (svc)-[:RUNS_AT]->(c)`,
      { params: s },
    );
  }

  for (const o of data.ownership) {
    await graph.query(
      `MATCH (p:Person {id:$person}), (s:Service {id:$service})
       CREATE (p)-[:OWNS {declared:$declared}]->(s)`,
      { params: o },
    );
  }

  for (const d of data.docs) {
    await graph.query(
      `CREATE (doc:Doc {
         id:$id, title:$title, kind:$kind, status:$status,
         updatedAt:$updatedAt, body:$body
       })`,
      { params: d },
    );
  }

  for (const a of data.docAuthors) {
    await graph.query(
      `MATCH (p:Person {id:$person}), (d:Doc {id:$doc})
       CREATE (p)-[:WROTE]->(d)`,
      { params: a },
    );
  }

  for (const t of data.tickets) {
    await graph.query(
      `CREATE (tk:Ticket {
         id:$id, title:$title, status:$status,
         openedAt:$openedAt, closedAt:$closedAt
       })`,
      { params: t },
    );
  }

  for (const pr of data.prs) {
    await graph.query(
      `MATCH (s:Service {id:$service})
       CREATE (pr:PR {id:$id, title:$title, mergedAt:$mergedAt})
       CREATE (pr)-[:TOUCHES]->(s)`,
      { params: pr },
    );
  }

  for (const a of data.prAuthors) {
    await graph.query(
      `MATCH (p:Person {id:$person}), (pr:PR {id:$pr})
       CREATE (p)-[:${a.rel}]->(pr)`,
      { params: { person: a.person, pr: a.pr } },
    );
  }

  for (const link of data.ticketLinks) {
    if (link.person) {
      await graph.query(
        `MATCH (p:Person {id:$person}), (t:Ticket {id:$ticket})
         CREATE (p)-[:${link.rel}]->(t)`,
        { params: { person: link.person, ticket: link.ticket } },
      );
    }
    if (link.service) {
      await graph.query(
        `MATCH (t:Ticket {id:$ticket}), (s:Service {id:$service})
         CREATE (t)-[:${link.rel}]->(s)`,
        { params: { ticket: link.ticket, service: link.service } },
      );
    }
  }

  for (const inc of data.incidents) {
    await graph.query(
      `MATCH (s:Service {id:$service})
       CREATE (i:Incident {
         id:$id, title:$title, severity:$severity,
         openedAt:$openedAt, resolvedAt:$resolvedAt
       })
       CREATE (i)-[:IN]->(s)`,
      { params: inc },
    );
  }

  for (const ip of data.incidentPeople) {
    await graph.query(
      `MATCH (p:Person {id:$person}), (i:Incident {id:$incident})
       CREATE (p)-[:${ip.rel}]->(i)`,
      { params: { person: ip.person, incident: ip.incident } },
    );
  }

  for (const d of data.decisions) {
    await graph.query(
      `CREATE (dec:Decision {
         id:$id, title:$title, summary:$summary,
         decidedAt:$decidedAt, status:$status
       })`,
      {
        params: {
          id: d.id,
          title: d.title,
          summary: d.summary,
          decidedAt: d.decidedAt,
          status: d.status,
        },
      },
    );
    for (const owner of d.owners) {
      await graph.query(
        `MATCH (p:Person {id:$owner}), (dec:Decision {id:$id})
         CREATE (p)-[:DECIDED]->(dec)`,
        { params: { owner, id: d.id } },
      );
    }
    for (const cite of d.cites) {
      await graph.query(
        `MATCH (dec:Decision {id:$id})
         OPTIONAL MATCH (doc:Doc {id:$cite})
         OPTIONAL MATCH (tk:Ticket {id:$cite})
         OPTIONAL MATCH (pr:PR {id:$cite})
         OPTIONAL MATCH (inc:Incident {id:$cite})
         WITH dec, coalesce(doc, tk, pr, inc) AS src
         WHERE src IS NOT NULL
         CREATE (dec)-[:CITES]->(src)`,
        { params: { id: d.id, cite } },
      );
    }
  }

  for (const link of data.decisionLinks) {
    await graph.query(
      `MATCH (a:Decision {id:$from}), (b:Decision {id:$to})
       CREATE (a)-[:SUPERSEDES]->(b)`,
      { params: link },
    );
  }

  for (const dep of data.serviceDeps) {
    await graph.query(
      `MATCH (a:Service {id:$from}), (b:Service {id:$to})
       CREATE (a)-[:DEPENDS_ON]->(b)`,
      { params: dep },
    );
  }

  for (const sk of data.skills) {
    await graph.query(
      `MATCH (p:Person {id:$person})
       MERGE (s:Skill {name:$skill})
       CREATE (p)-[:HAS_SKILL {weight:$weight}]->(s)`,
      { params: sk },
    );
  }

  // Infer KNOWS edges from real work evidence
  await graph.query(`
    MATCH (p:Person)-[:WROTE|REVIEWED|FIXED|PAGED_FOR]->(work)
    OPTIONAL MATCH (work)-[:TOUCHES|IN|AFFECTS]->(s:Service)
    OPTIONAL MATCH (p)-[:OWNS]->(owned:Service)
    WITH p, collect(DISTINCT s) + collect(DISTINCT owned) AS services
    UNWIND services AS svc
    WITH p, svc WHERE svc IS NOT NULL
    MERGE (p)-[k:KNOWS]->(svc)
    ON CREATE SET k.weight = 1
    ON MATCH SET k.weight = k.weight + 1
  `);

  const count = await graph.query(`
    MATCH (n)
    RETURN labels(n)[0] AS label, count(*) AS c
    ORDER BY c DESC
  `);

  return {
    graph: graphName,
    nodeCounts: count.data ?? [],
  };
}
