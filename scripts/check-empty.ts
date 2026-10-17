import { askBrainny } from "../src/lib/agent";

async function main() {
  const a = await askBrainny("What breaks if notify-hub goes down?");
  console.log(a.answer);
  if (!/nothing DEPENDS_ON|no upstream|no dependents/i.test(a.answer)) {
    throw new Error("expected empty dependents for notify-hub");
  }
  console.log("EMPTY_OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
