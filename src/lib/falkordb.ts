import { FalkorDB, type Graph } from "falkordb";

const globalForFalkor = globalThis as unknown as {
  brainnyDb?: FalkorDB;
  brainnyConnecting?: Promise<FalkorDB>;
};

export function getConfig() {
  return {
    host: process.env.FALKORDB_HOST || "127.0.0.1",
    port: Number(process.env.FALKORDB_PORT || 6380),
    graphName: process.env.FALKORDB_GRAPH || "brainny",
  };
}

export async function getDb(): Promise<FalkorDB> {
  if (globalForFalkor.brainnyDb) return globalForFalkor.brainnyDb;
  if (!globalForFalkor.brainnyConnecting) {
    const { host, port } = getConfig();
    globalForFalkor.brainnyConnecting = FalkorDB.connect({
      socket: { host, port },
    }).then((db) => {
      globalForFalkor.brainnyDb = db;
      return db;
    });
  }
  return globalForFalkor.brainnyConnecting;
}

export async function getGraph(): Promise<Graph> {
  const db = await getDb();
  return db.selectGraph(getConfig().graphName);
}

type QueryParam =
  | null
  | string
  | number
  | boolean
  | QueryParam[]
  | { [key: string]: QueryParam };

export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, QueryParam> = {},
): Promise<{ rows: T[]; cypher: string }> {
  const graph = await getGraph();
  const result = await graph.query(cypher, { params });
  const rows = (result.data ?? []) as T[];
  return { rows, cypher };
}

export async function graphExists(): Promise<boolean> {
  try {
    const db = await getDb();
    const graphs = await db.list();
    return graphs.includes(getConfig().graphName);
  } catch {
    return false;
  }
}
