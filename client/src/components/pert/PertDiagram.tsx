import { useMemo, useState } from 'react';
import type { CpmTaskRow, DependencyRecord } from '@gantt/shared';

const NODE_WIDTH = 188;
const NODE_HEIGHT = 96;
const GAP_X = 64;
const GAP_Y = 26;
const MARGIN = 28;

interface PertDiagramProps {
  nodes: CpmTaskRow[];
  dependencies: DependencyRecord[];
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function PertDiagram({ nodes, dependencies }: PertDiagramProps) {
  const [zoom, setZoom] = useState(1);

  const layout = useMemo(() => {
    const ids = new Set(nodes.map((node) => node.id));
    const edges = dependencies.filter(
      (dependency) => ids.has(dependency.predecessorId) && ids.has(dependency.successorId),
    );
    const level = new Map<string, number>(nodes.map((node) => [node.id, 0]));
    const indegree = new Map<string, number>(nodes.map((node) => [node.id, 0]));
    const outgoing = new Map<string, string[]>();

    for (const edge of edges) {
      indegree.set(edge.successorId, (indegree.get(edge.successorId) ?? 0) + 1);
      const list = outgoing.get(edge.predecessorId) ?? [];
      list.push(edge.successorId);
      outgoing.set(edge.predecessorId, list);
    }

    const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id);
    while (queue.length > 0) {
      const id = queue.shift() as string;
      for (const next of outgoing.get(id) ?? []) {
        level.set(next, Math.max(level.get(next) ?? 0, (level.get(id) ?? 0) + 1));
        const degree = (indegree.get(next) ?? 1) - 1;
        indegree.set(next, degree);
        if (degree === 0) queue.push(next);
      }
    }

    const columns = new Map<number, CpmTaskRow[]>();
    for (const node of nodes) {
      const column = level.get(node.id) ?? 0;
      const list = columns.get(column) ?? [];
      list.push(node);
      columns.set(column, list);
    }
    for (const list of columns.values()) {
      list.sort((a, b) => a.es - b.es || a.name.localeCompare(b.name));
    }

    const maxColumn = Math.max(0, ...columns.keys());
    const positions = new Map<string, { x: number; y: number }>();
    for (const [column, list] of columns) {
      list.forEach((node, index) => {
        positions.set(node.id, {
          x: MARGIN + column * (NODE_WIDTH + GAP_X),
          y: MARGIN + index * (NODE_HEIGHT + GAP_Y),
        });
      });
    }

    const maxRows = Math.max(1, ...[...columns.values()].map((list) => list.length));
    const width = MARGIN * 2 + (maxColumn + 1) * NODE_WIDTH + maxColumn * GAP_X;
    const height = MARGIN * 2 + maxRows * NODE_HEIGHT + (maxRows - 1) * GAP_Y;

    return { edges, positions, width, height };
  }, [nodes, dependencies]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.2).toFixed(2))))}
            className="rounded-md px-2.5 py-1 text-sm text-slate-600 hover:bg-white"
            aria-label="Perkecil diagram PERT"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(1.8, Number((value + 0.2).toFixed(2))))}
            className="rounded-md px-2.5 py-1 text-sm text-slate-600 hover:bg-white"
            aria-label="Perbesar diagram PERT"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Reset zoom
        </button>
        <span className="text-xs text-slate-400">Gulir untuk melihat seluruh diagram.</span>
        <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border-2 border-rose-500 bg-rose-50" aria-hidden="true" /> Kritis
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-slate-300 bg-white" aria-hidden="true" /> Ada float
          </span>
        </span>
      </div>

      <div className="gantt-scroll max-h-[560px] overflow-auto rounded-xl border border-slate-200 bg-slate-50/70 p-1">
        <div
          style={{
            width: layout.width * zoom,
            height: layout.height * zoom,
          }}
        >
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            <svg
              width={layout.width}
              height={layout.height}
              role="img"
              aria-label="Diagram PERT proyek"
              data-testid="pert-svg"
            >
              <defs>
                <marker id="pert-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" fill="#94a3b8" />
                </marker>
                <marker id="pert-arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" fill="#e11d48" />
                </marker>
              </defs>

              {layout.edges.map((edge) => {
                const from = layout.positions.get(edge.predecessorId);
                const to = layout.positions.get(edge.successorId);
                if (!from || !to) return null;
                const source = nodes.find((node) => node.id === edge.predecessorId);
                const target = nodes.find((node) => node.id === edge.successorId);
                const critical = Boolean(source?.critical && target?.critical);
                const sx = from.x + NODE_WIDTH;
                const sy = from.y + NODE_HEIGHT / 2;
                const tx = to.x;
                const ty = to.y + NODE_HEIGHT / 2;
                const midX = sx + Math.max(16, (tx - sx) / 2);
                return (
                  <path
                    key={edge.id}
                    d={`M ${sx} ${sy} H ${midX} V ${ty} H ${tx - 4}`}
                    fill="none"
                    stroke={critical ? '#e11d48' : '#94a3b8'}
                    strokeWidth={critical ? 2 : 1.4}
                    markerEnd={critical ? 'url(#pert-arrow-critical)' : 'url(#pert-arrow)'}
                  />
                );
              })}

              {nodes.map((node) => {
                const position = layout.positions.get(node.id);
                if (!position) return null;
                const critical = node.critical;
                return (
                  <g
                    key={node.id}
                    data-testid={`pert-node-${node.id}`}
                    transform={`translate(${position.x}, ${position.y})`}
                  >
                    <title>
                      {`${node.name}\nDurasi ${node.durationDays} hari\nES ${node.es} / EF ${node.ef}\nLS ${node.ls} / LF ${node.lf}\nFloat ${node.totalFloat}`}
                    </title>
                    <rect
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      rx={10}
                      fill={critical ? '#fff1f2' : '#ffffff'}
                      stroke={critical ? '#e11d48' : '#cbd5e1'}
                      strokeWidth={critical ? 2 : 1}
                    />
                    <rect
                      width={NODE_WIDTH}
                      height={4}
                      rx={2}
                      fill={critical ? '#e11d48' : '#94a3b8'}
                    />
                    <text x={12} y={22} fontSize={11} fontWeight={600} fill={critical ? '#9f1239' : '#0f172a'}>
                      {truncate(node.name, 25)}
                    </text>
                    <text x={12} y={38} fontSize={9} fill="#64748b">
                      Durasi {node.durationDays} hari kerja
                    </text>
                    <text x={12} y={55} fontSize={9} fill="#475569">
                      ES {node.es} · EF {node.ef} · LS {node.ls} · LF {node.lf}
                    </text>
                    <text
                      x={12}
                      y={74}
                      fontSize={9}
                      fontWeight={600}
                      fill={critical ? '#be123c' : '#475569'}
                    >
                      Float {node.totalFloat} {critical ? '· KRITIS' : ''}
                    </text>
                    <circle cx={NODE_WIDTH - 14} cy={18} r={5} fill={critical ? '#e11d48' : '#cbd5e1'} />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
