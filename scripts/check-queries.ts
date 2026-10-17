import { seedBrainny } from "../src/lib/seed";
import {
  blastRadius,
  departureBlastRadius,
  findExperts,
  expertisePaths,
  decisionAutopsy,
  decisionLineage,
  busFactor,
} from "../src/lib/queries";
import { askBrainny } from "../src/lib/agent";

async function step(name: string, fn: () => Promise<unknown>) {
  const t0 = Date.now();
  process.stdout.write(`… ${name} `);
  try {
    const r = await fn();
    console.log(`ok ${Date.now() - t0}ms`, typeof r === "object" && r && "rows" in (r as object) ? `rows=${(r as { rows: unknown[] }).rows?.length}` : "");
    return r;
  } catch (e) {
    console.log(`FAIL ${Date.now() - t0}ms`, e instanceof Error ? e.message : e);
    throw e;
  }
}

async function main() {
  await step("seed", () => seedBrainny({ reset: true }));
  await step("blast", () => blastRadius("ledger-core"));
  await step("depart", () => departureBlastRadius("Priya"));
  await step("bus", () => busFactor("Priya"));
  await step("experts", () => findExperts("payments"));
  await step("paths", () => expertisePaths("payments"));
  await step("autopsy", () => decisionAutopsy("stripe"));
  await step("lineage", () => decisionLineage("stripe"));
  await step("ask blast", () => askBrainny("What breaks if ledger-core goes down?"));
  await step("ask priya", () => askBrainny("What breaks if Priya leaves?"));
  await step("ask review", () => askBrainny("Who should review the payments refactor?"));
  await step("ask stripe", () => askBrainny("Why did we pick Stripe over Adyen?"));
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
