import { askBrainny } from "../src/lib/agent";

async function main() {
  const a = await askBrainny("Who owns card-rails vs who actually knows it?");
  console.log(a.answer);
  if (!/Owen Blake \(left\)/.test(a.answer)) {
    throw new Error("expected Owen Blake (left)");
  }
  if (/settlement|ledger-core|identity/i.test(a.answer.split("\n\n")[0])) {
    throw new Error("ownership leaked other services in header");
  }
  console.log("OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
