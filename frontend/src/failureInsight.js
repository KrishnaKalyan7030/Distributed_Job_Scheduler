/**
 * Failure Insight Engine
 * -----------------------
 * Produces a human-readable diagnosis + suggested fix for a dead-lettered
 * job, based on pattern-matching its error message and execution history.
 *
 * DESIGN NOTE (documented honestly for the design-decisions doc): this is a
 * deterministic, rule-based analyzer rather than a call to an external LLM.
 * That's a deliberate trade-off for a demo/interview project: it requires
 * no API key, costs nothing, has zero latency, and is fully explainable
 * (you can point to exactly which rule fired). The interface below
 * (`analyzeFailure`) is intentionally the same shape an LLM-backed version
 * would have — swapping in a real `POST /dlq/{id}/ai-summary` call that
 * forwards the error text to an LLM API would be a drop-in replacement
 * with no changes needed elsewhere in the UI.
 */

const RULES = [
  {
    test: /timeout|timed out|deadline exceeded/i,
    category: "Timeout",
    diagnosis: "The job took longer than the allowed execution window and was aborted.",
    suggestion: "Consider increasing the job's timeout, or breaking the task into smaller units of work.",
  },
  {
    test: /connection refused|econnrefused|could not connect|network/i,
    category: "Network / Connectivity",
    diagnosis: "The job couldn't reach a downstream service (database, API, or external host).",
    suggestion: "Check that the dependent service was online at execution time. Consider adding a longer retry backoff to ride out brief outages.",
  },
  {
    test: /permission|forbidden|unauthorized|401|403/i,
    category: "Permissions",
    diagnosis: "The job was rejected due to missing or expired credentials/permissions.",
    suggestion: "Verify the API key, token, or service account used by this job hasn't expired or been revoked.",
  },
  {
    test: /corrupt|invalid file|malformed|parse error/i,
    category: "Bad Input Data",
    diagnosis: "The job's input data was malformed or unusable in its current form.",
    suggestion: "Add input validation before the job is queued, so bad data is rejected at submission time rather than at execution time.",
  },
  {
    test: /not found|404|does not exist|missing/i,
    category: "Missing Resource",
    diagnosis: "The job referenced a resource (file, record, or ID) that no longer exists.",
    suggestion: "Confirm the resource wasn't deleted between job creation and execution. Consider a existence-check step before processing.",
  },
  {
    test: /rate limit|429|too many requests/i,
    category: "Rate Limited",
    diagnosis: "An external service throttled this job's requests.",
    suggestion: "Lower this queue's concurrency limit, or switch its retry policy to exponential backoff to space out attempts.",
  },
  {
    test: /out of memory|oom|memory/i,
    category: "Resource Exhaustion",
    diagnosis: "The job likely exceeded available memory on the worker.",
    suggestion: "Process the workload in smaller batches, or move this queue to workers with more memory headroom.",
  },
];

const DEFAULT_RULE = {
  category: "Unclassified",
  diagnosis: "This failure doesn't match a known pattern — it may be an application-specific bug.",
  suggestion: "Check the job's execution logs and the exact error text for clues specific to this task.",
};

export function analyzeFailure(dlqEntry) {
  const errorText = dlqEntry.final_error || "";
  const matched = RULES.find((r) => r.test.test(errorText)) || DEFAULT_RULE;

  const attempts = dlqEntry.total_attempts ?? "several";

  return {
    category: matched.category,
    summary: `${matched.diagnosis} It failed ${attempts} time(s) before being moved to the Dead Letter Queue.`,
    suggestion: matched.suggestion,
  };
}
