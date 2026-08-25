import { useState } from "react";
import { api } from "../api";
import { usePolling } from "../hooks";
import StatusBadge from "../components/StatusBadge";
import JobDetailDrawer from "../components/JobDetailDrawer";

const JOB_TYPES = ["immediate", "delayed", "scheduled", "recurring", "batch"];
const STATUSES = ["queued", "scheduled", "claimed", "running", "completed", "failed", "dead"];

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState("");
  const [showNewJob, setShowNewJob] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    queue_id: "",
    job_type: "immediate",
    message: "",
    run_at: "",
  });

  const { data: jobs, refresh } = usePolling(
    () => api.listJobs({ status: statusFilter || undefined, limit: 100 }),
    2500,
    [statusFilter]
  );

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    try {
      const payload = { type: "print", message: form.message || "hello from Pulse" };
      const body = {
        queue_id: Number(form.queue_id),
        job_type: form.job_type,
        payload,
        max_attempts: 4,
      };
      if (form.job_type !== "immediate" && form.run_at) {
        body.run_at = new Date(form.run_at).toISOString();
      }
      await api.createJob(body);
      setShowNewJob(false);
      setForm({ queue_id: "", job_type: "immediate", message: "", run_at: "" });
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRetry(jobId) {
    await api.retryJob(jobId);
    refresh();
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text">Jobs</h1>
          <p className="text-sm text-muted mt-1">Every task, queued through completed or dead.</p>
        </div>
        <button
          onClick={() => setShowNewJob((v) => !v)}
          className="bg-accent2 hover:bg-accent2/90 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          + New job
        </button>
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {showNewJob && (
        <form onSubmit={handleCreate} className="bg-panel border border-border rounded-xl p-4 mb-6 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Queue ID</label>
            <input
              required
              type="number"
              value={form.queue_id}
              onChange={(e) => setForm({ ...form, queue_id: e.target.value })}
              className="w-full bg-panel2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent2"
              placeholder="e.g. 1 (see Queues page)"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Job type</label>
            <select
              value={form.job_type}
              onChange={(e) => setForm({ ...form, job_type: e.target.value })}
              className="w-full bg-panel2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent2"
            >
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-muted mb-1.5">Message (demo payload)</label>
            <input
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full bg-panel2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent2"
              placeholder="hello world"
            />
          </div>
          {form.job_type !== "immediate" && (
            <div className="col-span-2">
              <label className="block text-xs font-medium text-muted mb-1.5">Run at</label>
              <input
                type="datetime-local"
                required
                value={form.run_at}
                onChange={(e) => setForm({ ...form, run_at: e.target.value })}
                className="w-full bg-panel2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent2"
              />
            </div>
          )}
          <button type="submit" className="col-span-2 bg-accent2 hover:bg-accent2/90 text-white text-sm font-medium py-2 rounded-lg">
            Create job
          </button>
        </form>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-3 py-1 rounded-full text-xs font-medium border ${
            statusFilter === "" ? "bg-panel2 border-accent2/40 text-text" : "border-border text-muted"
          }`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              statusFilter === s ? "bg-panel2 border-accent2/40 text-text" : "border-border text-muted"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-panel border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(jobs || []).map((j) => (
              <tr key={j.id} className="border-b border-border last:border-0 hover:bg-panel2/40 transition-colors">
                <td className="px-4 py-3 font-mono text-muted">
                  <button onClick={() => setSelectedJobId(j.id)} className="hover:text-accent2 hover:underline">
                    #{j.id}
                  </button>
                </td>
                <td className="px-4 py-3 font-mono text-muted">{j.job_type}</td>
                <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                <td className="px-4 py-3 font-mono text-muted">{j.attempt_count}/{j.max_attempts}</td>
                <td className="px-4 py-3 font-mono text-muted text-xs">{new Date(j.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  {(j.status === "failed" || j.status === "dead") && (
                    <button onClick={() => handleRetry(j.id)} className="text-xs font-medium text-accent2 hover:text-accent2/80">
                      Retry
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!jobs || jobs.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">No jobs match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedJobId && (
        <JobDetailDrawer jobId={selectedJobId} onClose={() => setSelectedJobId(null)} onChanged={refresh} />
      )}
    </div>
  );
}
