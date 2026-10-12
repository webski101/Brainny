import { seedBrainny } from "../src/lib/seed";
import { getDb } from "../src/lib/falkordb";

async function main() {
  const result = await seedBrainny({ reset: true });
  console.log("Seeded Brainny graph:", JSON.stringify(result, null, 2));
  const db = await getDb();
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
