"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GraphPayload } from "@/lib/types";

const TYPE_COLOR: Record<string, string> = {
  Person: "#1f6f5b",
  Service: "#c45c26",
  Decision: "#2f5d8c",
  Doc: "#6b5b3e",
  Team: "#3d4a3a",
  Incident: "#b33a3a",
  PR: "#5a6a7a",
  Ticket: "#7a6a4a",
};

type Props = {
  data: GraphPayload | null;
  highlights?: string[];
  loading?: boolean;
};

export function GraphCanvas({ data, highlights = [], loading }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const highlightSet = useMemo(
    () => new Set(highlights.map((h) => h.toLowerCase())),
    [highlights],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.nodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const cx = width / 2;
    const cy = height / 2;

    const nodes = data.nodes.map((n, i) => {
      const angle = (i / data.nodes.length) * Math.PI * 2;
      const ring =
        n.type === "Service" ? 0.38 : n.type === "Person" ? 0.55 : 0.72;
      const r = Math.min(width, height) * ring * 0.45;
      return {
        ...n,
        x: cx + Math.cos(angle) * r + (Math.sin(i * 12.3) * 18),
        y: cy + Math.sin(angle) * r + (Math.cos(i * 9.1) * 14),
      };
    });

    const byId = new Map(nodes.map((n) => [n.id, n]));

    ctx.clearRect(0, 0, width, height);

    // soft grid
    ctx.strokeStyle = "rgba(40, 48, 42, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 28) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (const e of data.edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = "rgba(40, 48, 42, 0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const n of nodes) {
      const hot =
        highlightSet.has(n.id.toLowerCase()) ||
        highlightSet.has(n.label.toLowerCase());
      const color = TYPE_COLOR[n.type] || "#28302a";
      ctx.beginPath();
      ctx.arc(n.x, n.y, hot ? 9 : 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = hot ? 1 : 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (hot) {
        ctx.strokeStyle = "#e8c547";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(28, 34, 30, 0.85)";
      ctx.font = "500 10px 'IBM Plex Sans', sans-serif";
      ctx.fillText(n.label.slice(0, 18), n.x + 10, n.y + 3);
    }
  }, [data, highlightSet]);

  return (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden rounded-none border border-ink/10 bg-paper/60">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-paper/70 text-sm text-ink/60">
          Loading company graph…
        </div>
      )}
      {!loading && (!data || data.nodes.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-ink/50">
          Graph empty — seed Northstar Pay to begin.
        </div>
      )}
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-ink/55">
        {Object.entries(TYPE_COLOR).slice(0, 6).map(([type, color]) => (
          <span key={type} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: color }}
            />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}
