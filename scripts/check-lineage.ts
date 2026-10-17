import { decisionLineage, blastRadius } from "../src/lib/queries";

async function main() {
  const b = await blastRadius("ledger-core");
  console.log(
    "blast target",
    b.target,
    b.rows.map((r) => `${r.hops}:${r.affected}`),
  );
  const d = await decisionLineage("stripe");
  console.log("lineage current", d.current);
  console.log("lineage chain", d.lineage);
  console.log("cypher err?", d.cypher[0]?.slice(0, 80));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
