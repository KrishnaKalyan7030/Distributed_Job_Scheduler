import { api } from "../api";
import { usePolling } from "../hooks";
import StatusBadge from "../components/StatusBadge";

const STATUS_ORDER = ["queued", "scheduled", "claimed", "running", "completed", "failed", "dead"];

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-panel border border-border rounded-xl p-5">
      <p className="text-xs text-muted font-medium mb-2">{label}</p>
      <p className={`text-3xl font-mono font-semibold ${accent || "text-text"}`}>{value}</p>
    </div>
  );
}

export default function Overview() {
  const { data: stats } = usePolling(() => api.getStats(), 3000);
  const { data: workers } = usePolling(() => api.listWorkers(), 3000);

  const byStatus = stats?.jobs_by_status || {};
  const totalJobs = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...Object.values(byStatus));
  const onlineWorkers = (workers || []).filter((w) => w.status === "online").length;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text">Overview</h1>
        <p className="text-sm text-muted mt-1">Live system health, refreshed every few seconds.</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total jobs" value={totalJobs} />
        <StatCard label="Workers online" value={onlineWorkers} accent="text-success" />
        <StatCard label="In flight" value={(byStatus.running || 0) + (byStatus.claimed || 0)} accent="text-warn" />
        <StatCard label="Dead letters" value={stats?.dead_letter_count ?? 0} accent={stats?.dead_letter_count ? "text-dead" : "text-text"} />
      </div>

      <div className="bg-panel border border-border rounded-xl p-6">
        <h2 className="text-sm font-medium text-text mb-5">Jobs by status</h2>
        <div className="space-y-3">
          {STATUS_ORDER.filter((s) => byStatus[s] !== undefined).map((status) => (
            <div key={status} className="flex items-center gap-4">
              <div className="w-28 shrink-0">
                <StatusBadge status={status} />
              </div>
              <div className="flex-1 bg-panel2 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-accent2/70 rounded-full transition-all"
                  style={{ width: `${(byStatus[status] / maxCount) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right text-sm font-mono text-muted">{byStatus[status]}</span>
            </div>
          ))}
          {totalJobs === 0 && <p className="text-sm text-muted">No jobs yet — create one from the Jobs page.</p>}
        </div>
      </div>
    </div>
  );
}
