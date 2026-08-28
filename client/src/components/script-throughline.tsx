import { useMemo, useState } from "react";
import { GitBranch, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  ThroughlineCheck,
  ThroughlineGraph,
  ThroughlineNode,
  ThroughlineNodeKind,
} from "@shared/throughline";

export interface ScriptThroughlineProps {
  graph: ThroughlineGraph;
  checks: ThroughlineCheck;
  layout: "dag" | "radial";
  onLayoutChange?: (layout: "dag" | "radial") => void;
}

const KIND_FILL: Record<ThroughlineNodeKind, string> = {
  promise: "hsl(var(--primary))",
  section: "hsl(var(--chart-2, 173 58% 39%))",
  claim: "hsl(var(--chart-4, 43 74% 49%))",
  source_video: "hsl(var(--muted-foreground))",
};

const KIND_LABEL: Record<ThroughlineNodeKind, string> = {
  promise: "Promise",
  section: "Section",
  claim: "Claim",
  source_video: "Source",
};

interface LaidOutNode {
  node: ThroughlineNode;
  x: number;
  y: number;
}

function truncate(label: string, max = 28): string {
  const trimmed = label.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function layoutDag(nodes: ThroughlineNode[]): { positions: LaidOutNode[]; width: number; height: number } {
  const ranks: ThroughlineNodeKind[] = ["promise", "section", "claim", "source_video"];
  const byRank = ranks.map((kind) => nodes.filter((node) => node.kind === kind));
  const colGap = 180;
  const rowGap = 56;
  const marginX = 90;
  const marginY = 40;
  const maxRows = Math.max(1, ...byRank.map((group) => group.length));
  const width = marginX * 2 + (ranks.length - 1) * colGap;
  const height = marginY * 2 + Math.max(0, maxRows - 1) * rowGap;

  const positions: LaidOutNode[] = [];
  byRank.forEach((group, rankIndex) => {
    const x = marginX + rankIndex * colGap;
    const blockHeight = Math.max(0, group.length - 1) * rowGap;
    const startY = marginY + (height - marginY * 2 - blockHeight) / 2;
    group.forEach((node, index) => {
      positions.push({ node, x, y: startY + index * rowGap });
    });
  });

  return { positions, width: Math.max(width, 320), height: Math.max(height, 160) };
}

function layoutRadial(nodes: ThroughlineNode[]): { positions: LaidOutNode[]; width: number; height: number } {
  const width = 420;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const promise = nodes.find((node) => node.kind === "promise");
  const others = nodes.filter((node) => node.kind !== "promise");
  const positions: LaidOutNode[] = [];

  if (promise) positions.push({ node: promise, x: cx, y: cy });

  const radiusByKind: Record<Exclude<ThroughlineNodeKind, "promise">, number> = {
    section: 90,
    claim: 140,
    source_video: 180,
  };

  (["section", "claim", "source_video"] as const).forEach((kind) => {
    const group = others.filter((node) => node.kind === kind);
    group.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(group.length, 1) - Math.PI / 2;
      const radius = radiusByKind[kind];
      positions.push({
        node,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    });
  });

  return { positions, width, height };
}

function statusVariant(status: ThroughlineCheck["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "pass") return "default";
  if (status === "warn") return "secondary";
  return "destructive";
}

export function ScriptThroughline({ graph, checks, layout, onLayoutChange }: ScriptThroughlineProps) {
  const [internalLayout, setInternalLayout] = useState<"dag" | "radial">(layout);
  const activeLayout = onLayoutChange ? layout : internalLayout;

  const setLayout = (next: "dag" | "radial") => {
    if (onLayoutChange) onLayoutChange(next);
    else setInternalLayout(next);
  };

  const { positions, width, height } = useMemo(
    () => (activeLayout === "dag" ? layoutDag(graph.nodes) : layoutRadial(graph.nodes)),
    [activeLayout, graph.nodes],
  );

  const positionMap = useMemo(() => {
    const map = new Map<string, LaidOutNode>();
    for (const item of positions) map.set(item.node.id, item);
    return map;
  }, [positions]);

  return (
    <Card className="border-border/70" data-testid="script-throughline">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Script throughline</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Promise → sections → claims → source videos (no invented nodes)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={statusVariant(checks.status)}
            className="uppercase"
            data-testid="throughline-status"
          >
            {checks.status}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant={activeLayout === "dag" ? "default" : "outline"}
            onClick={() => setLayout("dag")}
            data-testid="throughline-layout-dag"
          >
            <GitBranch className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            DAG
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeLayout === "radial" ? "default" : "outline"}
            onClick={() => setLayout("radial")}
            data-testid="throughline-layout-radial"
          >
            <Network className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Mind map
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-border bg-muted/20">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={Math.min(height, 380)}
            role="img"
            aria-label={activeLayout === "dag" ? "Throughline DAG" : "Throughline mind map"}
            data-testid="throughline-svg"
          >
            {graph.edges.map((edge) => {
              const from = positionMap.get(edge.from);
              const to = positionMap.get(edge.to);
              if (!from || !to) return null;
              return (
                <line
                  key={edge.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="hsl(var(--border))"
                  strokeWidth={1.5}
                />
              );
            })}
            {positions.map(({ node, x, y }) => (
              <g key={node.id} transform={`translate(${x}, ${y})`}>
                <circle r={12} fill={KIND_FILL[node.kind]} opacity={0.9} />
                <text
                  y={28}
                  textAnchor="middle"
                  className="fill-foreground"
                  style={{ fontSize: 10 }}
                >
                  {truncate(node.label, activeLayout === "dag" ? 22 : 18)}
                </text>
                <title>{`${KIND_LABEL[node.kind]}: ${node.label}`}</title>
              </g>
            ))}
          </svg>
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {(Object.keys(KIND_LABEL) as ThroughlineNodeKind[]).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: KIND_FILL[kind] }}
                aria-hidden="true"
              />
              {KIND_LABEL[kind]}
            </span>
          ))}
        </div>

        {checks.issues.length > 0 ? (
          <ul className="space-y-2" data-testid="throughline-issues">
            {checks.issues.map((issue, index) => (
              <li
                key={`${issue.code}-${issue.nodeId || index}`}
                className={cn(
                  "rounded-md border px-3 py-2 text-sm",
                  issue.severity === "fail"
                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                    : "border-border bg-muted/30 text-muted-foreground",
                )}
              >
                <span className="mr-2 font-medium uppercase tracking-wide">{issue.severity}</span>
                {issue.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="throughline-issues-empty">
            All throughline checks passed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
