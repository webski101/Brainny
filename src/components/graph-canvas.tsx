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

const TYPE_RING: Record<string, number> = {
  Service: 0.32,
  Person: 0.52,
  Team: 0.68,
  Decision: 0.78,
  Doc: 0.86,
  Incident: 0.92,
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
    const base = Math.min(width, height);

    // Group by type so same-type nodes fan out on their own ring (less overlap)
    const byType = new Map<string, typeof data.nodes>();
    for (const n of data.nodes) {
      const list = byType.get(n.type) || [];
      list.push(n);
      byType.set(n.type, list);
    }

    const nodes = data.nodes.map((n) => {
      const group = byType.get(n.type) || [n];
      const idx = group.findIndex((g) => g.id === n.id);
      const ring = TYPE_RING[n.type] ?? 0.75;
      const angle =
        (idx / Math.max(group.length, 1)) * Math.PI * 2 -
        Math.PI / 2 +
        (n.type === "Person" ? 0.15 : 0);
      const r = base * ring * 0.48;
      // Extra radial jitter by id hash so labels aren't stacked
      const hash = Array.from(n.id).reduce((a, c) => a + c.charCodeAt(0), 0);
      const jr = ((hash % 7) - 3) * (base * 0.012);
      const ja = ((hash % 5) - 2) * 0.04;
      return {
        ...n,
        x: cx + Math.cos(angle + ja) * (r + jr),
        y: cy + Math.sin(angle + ja) * (r + jr),
      };
    });

    // Mild repulsion pass to push overlapping labels apart
    for (let iter = 0; iter < 40; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const minDist = 36;
          if (dist < minDist) {
            const push = ((minDist - dist) / dist) * 0.35;
            const ox = dx * push;
            const oy = dy * push;
            a.x -= ox;
            a.y -= oy;
            b.x += ox;
            b.y += oy;
          }
        }
      }
    }

    const byId = new Map(nodes.map((n) => [n.id, n]));

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(40, 48, 42, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
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
      ctx.strokeStyle = "rgba(40, 48, 42, 0.16)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw nodes first, then labels with simple collision skip
    const labelBoxes: { x: number; y: number; w: number; h: number }[] = [];

    for (const n of nodes) {
      const hot =
        highlightSet.has(n.id.toLowerCase()) ||
        highlightSet.has(n.label.toLowerCase()) ||
        highlightSet.has(n.label.replace(/\s*\(left\)\s*$/i, "").toLowerCase());
      const color = TYPE_COLOR[n.type] || "#28302a";
      ctx.beginPath();
      ctx.arc(n.x, n.y, hot ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = hot ? 1 : 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (hot) {
        ctx.strokeStyle = "#e8c547";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    ctx.font = "500 10px 'IBM Plex Sans', sans-serif";
    for (const n of nodes) {
      const hot =
        highlightSet.has(n.id.toLowerCase()) ||
        highlightSet.has(n.label.toLowerCase());
      const text = n.label.slice(0, 22);
      const tw = ctx.measureText(text).width;
      const lx = n.x + 11;
      const ly = n.y + 3;
      const box = { x: lx, y: ly - 8, w: tw + 4, h: 12 };
      const overlaps = labelBoxes.some(
        (b) =>
          box.x < b.x + b.w &&
          box.x + box.w > b.x &&
          box.y < b.y + b.h &&
          box.y + box.h > b.y,
      );
      // Always label highlights; otherwise skip if crowded
      if (overlaps && !hot) continue;
      labelBoxes.push(box);
      ctx.fillStyle = "rgba(28, 34, 30, 0.88)";
      ctx.fillText(text, lx, ly);
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
