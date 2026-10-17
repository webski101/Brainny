import { seedBrainny } from "../src/lib/seed";
import { askBrainny } from "../src/lib/agent";
import { blastRadius } from "../src/lib/queries";

async function main() {
  await seedBrainny({ reset: true });

  const cases: [string, (a: Awaited<ReturnType<typeof askBrainny>>) => void][] =
    [
      [
        "Why did we decide to freeze settlements?",
        (a) => {
          console.log("freeze →", a.decision?.title, a.status);
          if (!a.decision?.title.toLowerCase().includes("freeze"))
            throw new Error("expected freeze decision");
        },
      ],
      [
        "Who owns card-rails vs who actually knows it?",
        (a) => {
          console.log("owns →", a.answer.slice(0, 120));
          if (/settlement|ledger-core|identity/i.test(a.answer.split("\n\n")[0]))
            throw new Error("ownership leaked other services in header");
          if (!/card-rails/i.test(a.answer)) throw new Error("expected card-rails");
        },
      ],
      [
        "Why did we pick Stripe over Adyen?",
        (a) => {
          console.log("stripe →", a.answer.includes("SUPERSEDES"), a.path.map((p) => p.rel));
          if (a.path.some((p) => /dec_\d+/i.test(p.from) || /dec_\d+/i.test(p.to)))
            throw new Error("raw decision ids in path");
        },
      ],
      [
        "What breaks if ledger-core goes down?",
        (a) => {
          console.log("blast →", a.answer.includes("3-hop") || a.answer.includes("4-hop") || a.answer.includes("hop"));
          const hops = [...a.answer.matchAll(/(\d+)-hop/g)].map((m) => Number(m[1]));
          console.log("hops found", hops);
          if (!hops.some((h) => h >= 3)) throw new Error("expected 3+ hop blast");
        },
      ],
      [
        "What breaks if no-such-service goes down?",
        (a) => {
          console.log("unknown →", a.answer.slice(0, 80));
          if (!/unknown service/i.test(a.answer)) throw new Error("expected unknown");
        },
      ],
    ];

  for (const [q, check] of cases) {
    const a = await askBrainny(q);
    check(a);
  }

  const b = await blastRadius("ledger-core");
  console.log(
    "ledger hops",
    b.rows.map((r) => `${r.hops}:${r.affected}`),
  );

  console.log("ALL OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
