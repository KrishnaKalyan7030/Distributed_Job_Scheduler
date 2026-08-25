import { useEffect, useState } from "react";
import { api } from "../api";
import StatusBadge from "./StatusBadge";

export default function JobDetailDrawer({ jobId, onClose, onChanged }) {
  const [job, setJob] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [j, ex] = await Promise.all([api.getJob(jobId), api.getExecutions(jobId)]);
      setJob(j);
      setExecutions(ex);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 2500);
    return () => clearInterval(timer);
  }, [jobId]);

  async function handleRetry() {
    await api.retryJob(jobId);
    await load();
    onChanged?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-panel border-l border-border overflow-y-auto">
        <div className="sticky top-0 bg-panel border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text font-mono">Job #{jobId}</h2>
          <button onClick={onClose} className="text-muted hover:text-text text-sm">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {error && <p className="text-xs text-danger">{error}</p>}
          {!job ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <StatusBadge status={job.status} />
                <span className="text-xs text-muted font-mono">{job.job_type}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted mb-1">Queue ID</p>
                  <p className="font-mono text-text">{job.queue_id}</p>
                </div>
                <div>
                  <p className="text-muted mb-1">Attempts</p>
                  <p className="font-mono text-text">{job.attempt_count} / {job.max_attempts}</p>
                </div>
                <div>
                  <p className="text-muted mb-1">Created</p>
                  <p className="font-mono text-text">{new Date(job.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted mb-1">Claimed by</p>
                  <p className="font-mono text-text">{job.claimed_by || "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted mb-1.5">Payload</p>
                <pre className="bg-panel2 border border-border rounded-lg p-3 text-xs font-mono text-text overflow-x-auto">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              </div>

              {job.last_error && (
                <div>
                  <p className="text-xs text-muted mb-1.5">Last error</p>
                  <pre className="bg-danger/10 border border-danger/30 rounded-lg p-3 text-xs font-mono text-danger overflow-x-auto whitespace-pre-wrap">
                    {job.last_error}
                  </pre>
                </div>
              )}

              {(job.status === "failed" || job.status === "dead") && (
                <button
                  onClick={handleRetry}
                  className="w-full bg-accent2 hover:bg-accent2/90 text-white text-sm font-medium py-2 rounded-lg"
                >
                  Retry this job
                </button>
              )}

              <div>
                <p className="text-xs text-muted mb-2">Execution history ({executions.length} attempt{executions.length !== 1 ? "s" : ""})</p>
                <div className="space-y-2">
                  {executions.map((ex) => (
                    <div key={ex.id} className="bg-panel2 border border-border rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-text">Attempt {ex.attempt_number}</span>
                        <StatusBadge status={ex.status} />
                      </div>
                      <p className="text-muted font-mono">
                        {ex.started_at ? new Date(ex.started_at).toLocaleTimeString() : "—"}
                        {ex.finished_at && ` → ${new Date(ex.finished_at).toLocaleTimeString()}`}
                      </p>
                      {ex.error && <p className="text-danger mt-1 font-mono">{ex.error}</p>}
                    </div>
                  ))}
                  {executions.length === 0 && <p className="text-xs text-muted">No execution attempts yet.</p>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
