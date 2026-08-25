import { api } from "../api";
import { usePolling } from "../hooks";
import StatusBadge from "../components/StatusBadge";

function timeSince(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function Workers() {
  const { data: workers } = usePolling(() => api.listWorkers(), 3000);

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text">Workers</h1>
        <p className="text-sm text-muted mt-1">Every worker process pulling jobs from your queues.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {(workers || []).map((w) => (
          <div key={w.id} className="bg-panel border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-sm text-text font-medium">{w.id}</span>
              <StatusBadge status={w.status} />
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Hostname</span>
                <span className="font-mono text-text">{w.hostname || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Started</span>
                <span className="font-mono text-text">{new Date(w.started_at).toLocaleTimeString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Last heartbeat</span>
                <span className="font-mono text-text">{timeSince(w.last_heartbeat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Active jobs</span>
                <span className="font-mono text-text">{w.current_jobs}</span>
              </div>
            </div>
          </div>
        ))}
        {(!workers || workers.length === 0) && (
          <div className="col-span-2 bg-panel border border-border rounded-xl p-8 text-center">
            <p className="text-sm text-muted">No workers have registered yet.</p>
            <p className="text-xs text-muted mt-1 font-mono">Run: python -m app.worker</p>
          </div>
        )}
      </div>
    </div>
  );
}
