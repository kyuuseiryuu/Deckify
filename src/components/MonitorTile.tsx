import { Cpu, HardDrive, ArrowDownUp } from "lucide-react";
import type { SystemStats } from "../types";

interface MonitorTileProps {
  metric: "cpu" | "memory" | "network";
  stats: SystemStats | null;
  label: string;
}

function formatSpeed(kbps: number): string {
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(1)} MB/s`;
  }
  return `${Math.round(kbps)} KB/s`;
}

export function MonitorTile({ metric, stats, label }: MonitorTileProps) {
  if (metric === "cpu") {
    const val = stats ? Math.round(stats.cpu) : 0;
    return (
      <div className="monitor-tile">
        <div className="monitor-header">
          <Cpu size={15} />
          <span>{label || "CPU"}</span>
        </div>
        <div className="monitor-value">{stats ? `${val}%` : "--"}</div>
        <div className="monitor-bar">
          <div
            className="monitor-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
          />
        </div>
      </div>
    );
  }

  if (metric === "memory") {
    const val = stats ? Math.round(stats.memPercent) : 0;
    return (
      <div className="monitor-tile">
        <div className="monitor-header">
          <HardDrive size={15} />
          <span>{label || "内存"}</span>
        </div>
        <div className="monitor-value">{stats ? `${val}%` : "--"}</div>
        <div className="monitor-sub">
          {stats
            ? `${stats.memUsedGb.toFixed(1)} / ${stats.memTotalGb.toFixed(0)} GB`
            : "--"}
        </div>
        <div className="monitor-bar">
          <div
            className="monitor-bar-fill mem"
            style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="monitor-tile">
      <div className="monitor-header">
        <ArrowDownUp size={15} />
        <span>{label || "网络"}</span>
      </div>
      <div className="monitor-net-rows">
        <div className="monitor-net-row">
          <span>↓</span>
          <span>{stats ? formatSpeed(stats.netRxKbps) : "--"}</span>
        </div>
        <div className="monitor-net-row">
          <span>↑</span>
          <span>{stats ? formatSpeed(stats.netTxKbps) : "--"}</span>
        </div>
      </div>
    </div>
  );
}
