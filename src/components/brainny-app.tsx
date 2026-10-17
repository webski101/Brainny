"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  GitBranch,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GraphCanvas } from "@/components/graph-canvas";
import type { AgentAnswer, GraphPayload } from "@/lib/types";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: AgentAnswer;
};

const PROMPTS = [
  "Who should review the payments refactor?",
  "What breaks if Priya leaves?",
  "What breaks if ledger-core goes down?",
  "Why did we pick Stripe over Adyen?",
  "Who owns card-rails vs who actually knows it?",
];

function StatusPill({ status }: { status: AgentAnswer["status"] }) {
  const map = {
    ok: { label: "Grounded", className: "bg-moss/15 text-moss" },
    partial: { label: "Risk flagged", className: "bg-amber/20 text-ink" },
    abstain: { label: "Abstained", className: "bg-coral/15 text-coral" },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium ${map.className}`}
    >
      {status === "abstain" ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <ShieldCheck className="h-3 w-3" />
      )}
      {map.label}
    </span>
  );
}

function renderMarkdownish(text: string) {
  return text.split("\n").map((line, i) => {
    const html = line
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^• /, "");
    const isBullet = line.trim().startsWith("•") || /^\d+\./.test(line.trim());
    return (
      <p
        key={i}
        className={`${isBullet ? "pl-3" : ""} ${line.trim() ? "mb-1.5" : "mb-2"}`}
        dangerouslySetInnerHTML={{ __html: html || "&nbsp;" }}
      />
    );
  });
}

export function BrainnyApp() {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Brainny maps who actually knows what at Northstar Pay — from PRs, incidents, tickets, and decisions in FalkorDB. Ask about expertise, bus factor, or decision provenance.",
    },
  ]);

  const loadGraph = useCallback(async () => {
    setGraphLoading(true);
    try {
      const res = await fetch("/api/graph");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to load graph");
      setGraph({ nodes: data.nodes, edges: data.edges });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Graph load failed");
    } finally {
      setGraphLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  async function reseed() {
    setSeeding(true);
    setError(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Seed failed");
      await loadGraph();
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Northstar Pay company graph reseeded into FalkorDB.",
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", text: q },
    ]);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Ask failed");

      const answer = data as AgentAnswer & { ok: boolean };
      setHighlights(answer.highlights || []);
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: answer.answer,
          answer,
        },
      ]);
      await loadGraph();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ask failed");
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Something went wrong talking to the graph. Is FalkorDB running on port 6380?",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-mesh" />
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-moss/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-40 h-80 w-80 rounded-full bg-amber/25 blur-3xl" />

      <header className="relative z-10 border-b border-ink/10 bg-paper/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-paper">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-2xl leading-none tracking-tight text-ink">
                Brainny
              </p>
              <p className="text-xs text-ink/55">
                Company brain · FalkorDB graph
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={reseed}
              disabled={seeding}
            >
              {seeding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Reseed
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1.15fr_0.85fr] sm:px-6">
        <section className="flex min-h-[70vh] flex-col border border-ink/10 bg-paper/80 shadow-soft backdrop-blur">
          <div className="border-b border-ink/10 px-4 py-3 sm:px-5">
            <h1 className="font-display text-xl text-ink sm:text-2xl">
              Ask the living org graph
            </h1>
            <p className="mt-1 max-w-xl text-sm text-ink/60">
              Evidence over titles. Paths over vibes. Abstain when knowledge is
              stale or superseded.
            </p>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`max-w-[95%] ${m.role === "user" ? "ml-auto" : ""}`}
                >
                  <div
                    className={`px-4 py-3 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-ink text-paper"
                        : "border border-ink/10 bg-white/70 text-ink"
                    }`}
                  >
                    {m.role === "assistant" && m.answer && (
                      <div className="mb-2">
                        <StatusPill status={m.answer.status} />
                      </div>
                    )}
                    <div>{renderMarkdownish(m.text)}</div>
                    {m.answer && (
                      <div className="mt-3 space-y-3 border-t border-ink/10 pt-3">
                        {m.answer.path?.length > 0 && (
                          <div>
                            <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink/45">
                              <GitBranch className="h-3 w-3" /> Path
                            </p>
                            <div className="flex flex-wrap items-center gap-1 text-xs text-ink/70">
                              {m.answer.path.slice(0, 6).map((hop, i) => (
                                <span key={i} className="inline-flex items-center gap-1">
                                  <span className="font-medium text-ink">
                                    {hop.from}
                                  </span>
                                  <ArrowRight className="h-3 w-3 text-moss" />
                                  <span className="rounded-sm bg-moss/10 px-1 text-moss">
                                    {hop.rel}
                                  </span>
                                  <ArrowRight className="h-3 w-3 text-moss" />
                                  <span className="font-medium text-ink">
                                    {hop.to}
                                  </span>
                                  {i < Math.min(m.answer!.path.length, 6) - 1 && (
                                    <span className="mx-1 text-ink/30">·</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {m.answer.sources?.length > 0 && (
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink/45">
                              Sources
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {m.answer.sources.slice(0, 8).map((s) => (
                                <span
                                  key={`${s.id}-${s.title}`}
                                  className={`rounded-sm border px-2 py-0.5 text-[11px] ${
                                    s.status === "active"
                                      ? "border-ink/15 text-ink/70"
                                      : "border-coral/30 bg-coral/5 text-coral"
                                  }`}
                                >
                                  {s.kind}: {s.title}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {m.answer.cypher?.length > 0 && (
                          <details className="text-xs text-ink/55">
                            <summary className="cursor-pointer select-none font-medium text-ink/65">
                              Cypher used
                            </summary>
                            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-sm bg-ink/[0.04] p-2 font-mono text-[10px] leading-relaxed">
                              {m.answer.cypher[0]}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {busy && (
              <div className="flex items-center gap-2 text-sm text-ink/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Walking the graph…
              </div>
            )}
          </div>

          <div className="border-t border-ink/10 bg-white/50 px-4 py-3 sm:px-5">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => ask(p)}
                  className="shrink-0 border border-ink/10 bg-paper px-3 py-1.5 text-left text-xs text-ink/75 transition hover:border-moss/40 hover:text-ink"
                >
                  {p}
                </button>
              ))}
            </div>
            <form onSubmit={onSubmit} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask who knows what, what breaks, or why a decision was made…"
                className="h-11 flex-1 border border-ink/15 bg-white px-3 text-sm text-ink outline-none ring-moss/30 placeholder:text-ink/40 focus:ring-2"
              />
              <Button type="submit" disabled={busy || !input.trim()}>
                <Send className="h-4 w-4" />
                Ask
              </Button>
            </form>
            {error && (
              <p className="mt-2 text-xs text-coral">{error}</p>
            )}
          </div>
        </section>

        <section className="flex min-h-[420px] flex-col gap-4">
          <div className="flex flex-1 flex-col border border-ink/10 bg-paper/80 p-3 shadow-soft backdrop-blur sm:p-4">
            <div className="mb-3 flex items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-lg text-ink">Company graph</h2>
                <p className="text-xs text-ink/55">
                  Northstar Pay · people, services, decisions
                </p>
              </div>
              <span className="text-[11px] uppercase tracking-wider text-ink/40">
                {graph?.nodes.length ?? 0} nodes
              </span>
            </div>
            <div className="min-h-[320px] flex-1">
              <GraphCanvas
                data={graph}
                highlights={highlights}
                loading={graphLoading}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {[
              {
                title: "Evidence > titles",
                body: "KNOWS edges come from PRs, incidents, and tickets.",
              },
              {
                title: "Bus factor",
                body: "Concentration of knowledge on critical services.",
              },
              {
                title: "Honest abstain",
                body: "Superseded decisions are refused, not rephrased.",
              },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * i, duration: 0.35 }}
                className="border border-ink/10 bg-white/60 p-3"
              >
                <p className="font-display text-sm text-ink">{card.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/60">
                  {card.body}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
