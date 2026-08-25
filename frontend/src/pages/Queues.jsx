import { useEffect, useState } from "react";
import { api } from "../api";

export default function Queues() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [queues, setQueues] = useState([]);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewQueue, setShowNewQueue] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newQueue, setNewQueue] = useState({ name: "", priority: 0, concurrency_limit: 4 });
  const [error, setError] = useState("");

  async function loadProjects() {
    const data = await api.listProjects();
    setProjects(data);
    if (data.length && !selectedProject) setSelectedProject(data[0].id);
  }

  async function loadQueues(projectId) {
    if (!projectId) return;
    const data = await api.listQueues(projectId);
    setQueues(data);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadQueues(selectedProject);
  }, [selectedProject]);

  async function handleCreateProject(e) {
    e.preventDefault();
    setError("");
    try {
      const p = await api.createProject(newProjectName);
      setNewProjectName("");
      setShowNewProject(false);
      await loadProjects();
      setSelectedProject(p.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateQueue(e) {
    e.preventDefault();
    setError("");
    try {
      await api.createQueue(selectedProject, newQueue);
      setNewQueue({ name: "", priority: 0, concurrency_limit: 4 });
      setShowNewQueue(false);
      await loadQueues(selectedProject);
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePause(queue) {
    if (queue.is_paused) await api.resumeQueue(queue.id);
    else await api.pauseQueue(queue.id);
    await loadQueues(selectedProject);
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-text">Queues</h1>
          <p className="text-sm text-muted mt-1">Organize background work by project and queue.</p>
        </div>
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2 mb-4">{error}</p>}

      {/* Project selector */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedProject(p.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              selectedProject === p.id
                ? "bg-panel2 border-accent2/40 text-text"
                : "bg-panel border-border text-muted hover:text-text"
            }`}
          >
            {p.name}
          </button>
        ))}
        <button
          onClick={() => setShowNewProject((v) => !v)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-dashed border-border text-muted hover:text-text hover:border-accent2/40 transition-colors"
        >
          + New project
        </button>
      </div>

      {showNewProject && (
        <form onSubmit={handleCreateProject} className="bg-panel border border-border rounded-xl p-4 mb-6 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted mb-1.5">Project name</label>
            <input
              required
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              className="w-full bg-panel2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent2"
              placeholder="e.g. Photo App"
            />
          </div>
          <button type="submit" className="bg-accent2 hover:bg-accent2/90 text-white text-sm font-medium px-4 py-2 rounded-lg">
            Create
          </button>
        </form>
      )}

      {selectedProject && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-text">Queues in this project</h2>
            <button
              onClick={() => setShowNewQueue((v) => !v)}
              className="text-sm text-accent2 hover:text-accent2/80 font-medium"
            >
              + New queue
            </button>
          </div>

          {showNewQueue && (
            <form onSubmit={handleCreateQueue} className="bg-panel border border-border rounded-xl p-4 mb-4 grid grid-cols-4 gap-3 items-end">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted mb-1.5">Queue name</label>
                <input
                  required
                  value={newQueue.name}
                  onChange={(e) => setNewQueue({ ...newQueue, name: e.target.value })}
                  className="w-full bg-panel2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent2"
                  placeholder="e.g. notifications"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Priority</label>
                <input
                  type="number"
                  value={newQueue.priority}
                  onChange={(e) => setNewQueue({ ...newQueue, priority: Number(e.target.value) })}
                  className="w-full bg-panel2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5">Concurrency</label>
                <input
                  type="number"
                  min={1}
                  value={newQueue.concurrency_limit}
                  onChange={(e) => setNewQueue({ ...newQueue, concurrency_limit: Number(e.target.value) })}
                  className="w-full bg-panel2 border border-border rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent2"
                />
              </div>
              <button type="submit" className="col-span-4 bg-accent2 hover:bg-accent2/90 text-white text-sm font-medium py-2 rounded-lg">
                Create queue
              </button>
            </form>
          )}

          <div className="bg-panel border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Concurrency</th>
                  <th className="px-4 py-3 font-medium">State</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((q) => (
                  <tr key={q.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-muted">{q.id}</td>
                    <td className="px-4 py-3 text-text font-medium">{q.name}</td>
                    <td className="px-4 py-3 font-mono text-muted">{q.priority}</td>
                    <td className="px-4 py-3 font-mono text-muted">{q.concurrency_limit}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${
                        q.is_paused ? "bg-warn/10 text-warn border-warn/30" : "bg-success/10 text-success border-success/30"
                      }`}>
                        {q.is_paused ? "paused" : "active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => togglePause(q)}
                        className="text-xs font-medium text-accent2 hover:text-accent2/80"
                      >
                        {q.is_paused ? "Resume" : "Pause"}
                      </button>
                    </td>
                  </tr>
                ))}
                {queues.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted text-sm">No queues yet. Create one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
