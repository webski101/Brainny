import { seedBrainny } from "../src/lib/seed";
import { askBrainny } from "../src/lib/agent";

async function main() {
  await seedBrainny({ reset: true });
  const qs = [
    "What breaks if ledger-core goes down?",
    "What breaks if Priya leaves?",
    "Who should review the payments refactor?",
    "Why did we pick Stripe over Adyen?",
  ];
  for (const q of qs) {
    try {
      const a = await askBrainny(q);
      console.log("\n===", q);
      console.log("intent:", a.intent, "status:", a.status);
      console.log("path hops:", a.path.length, "cypher:", a.cypher.length);
      console.log(a.answer.slice(0, 450));
    } catch (e) {
      console.log("\n=== FAIL", q);
      console.error(e instanceof Error ? e.message : e);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
