const API_URL = "http://127.0.0.1:8000";

function getToken() {
  return localStorage.getItem("token");
}

export function setToken(token) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

export function isLoggedIn() {
  return !!getToken();
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch (_) {}
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // --- auth ---
  async register(email, password, organization_name) {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, organization_name }),
    });
  },
  async login(email, password) {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) throw new Error("Incorrect email or password");
    return res.json();
  },
  async me() {
    return request("/auth/me");
  },

  // --- projects ---
  async listProjects() {
    return request("/projects");
  },
  async createProject(name, description) {
    return request("/projects", { method: "POST", body: JSON.stringify({ name, description }) });
  },

  // --- queues ---
  async listQueues(projectId) {
    return request(`/projects/${projectId}/queues`);
  },
  async createQueue(projectId, data) {
    return request(`/projects/${projectId}/queues`, { method: "POST", body: JSON.stringify(data) });
  },
  async pauseQueue(queueId) {
    return request(`/queues/${queueId}/pause`, { method: "POST" });
  },
  async resumeQueue(queueId) {
    return request(`/queues/${queueId}/resume`, { method: "POST" });
  },

  // --- retry policies ---
  async createRetryPolicy(data) {
    return request("/retry-policies", { method: "POST", body: JSON.stringify(data) });
  },

  // --- jobs ---
  async listJobs(params = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""))
    ).toString();
    return request(`/jobs${qs ? `?${qs}` : ""}`);
  },
  async getJob(jobId) {
    return request(`/jobs/${jobId}`);
  },
  async createJob(data) {
    return request("/jobs", { method: "POST", body: JSON.stringify(data) });
  },
  async createBatchJobs(data) {
    return request("/jobs/batch", { method: "POST", body: JSON.stringify(data) });
  },
  async retryJob(jobId) {
    return request(`/jobs/${jobId}/retry`, { method: "POST" });
  },
  async getExecutions(jobId) {
    return request(`/jobs/${jobId}/executions`);
  },
  async makeRecurring(jobId, cronExpr) {
    return request(`/jobs/${jobId}/schedule-recurring?cron_expr=${encodeURIComponent(cronExpr)}`, {
      method: "POST",
    });
  },

  // --- dlq ---
  async listDlq() {
    return request("/dlq");
  },
  async replayFromDlq(jobId) {
    return request(`/dlq/${jobId}/replay`, { method: "POST" });
  },

  // --- workers & stats ---
  async listWorkers() {
    return request("/workers");
  },
  async getStats() {
    return request("/stats");
  },
};
