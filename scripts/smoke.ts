import { askBrainny } from "../src/lib/agent";
import { getDb } from "../src/lib/falkordb";

async function main() {
  const qs = [
    "Who should review the payments refactor?",
    "What breaks if Priya leaves?",
    "Why did we pick Stripe over Adyen?",
    "Who owns card-rails vs who actually knows it?",
  ];
  for (const q of qs) {
    const a = await askBrainny(q);
    console.log("\n===", q);
    console.log("status:", a.status, "intent:", a.intent);
    console.log(a.answer.slice(0, 500));
    console.log("path hops:", a.path.length, "sources:", a.sources.length);
  }
  const db = await getDb();
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
