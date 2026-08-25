import { useState } from "react";
import { api } from "../api";
import { usePolling } from "../hooks";
import { analyzeFailure } from "../failureInsight";

export default function DeadLetterQueue() {
  const { data: dlq, refresh } = usePolling(() => api.listDlq(), 4000);
  const [expandedId, setExpandedId] = useState(null);
  const [replaying, setReplaying] = useState(null);

  async function handleReplay(jobId) {
    setReplaying(jobId);
    try {
      await api.replayFromDlq(jobId);
      refresh();
    } finally {
      setReplaying(null);
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-text">Dead Letter Queue</h1>
        <p className="text-sm text-muted mt-1">
          Jobs that exhausted every retry. Each one includes an automated failure analysis to speed up triage.
        </p>
      </div>

      <div className="space-y-3">
        {(dlq || []).map((entry) => {
          const insight = analyzeFailure(entry);
          const isOpen = expandedId === entry.job_id;
          return (
            <div key={entry.dlq_id} className="bg-panel border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(isOpen ? null : entry.job_id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-panel2/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-text">Job #{entry.job_id}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full border bg-dead/10 text-dead border-dead/30">
                    {insight.category}
                  </span>
                </div>
                <span className="text-xs text-muted font-mono">{new Date(entry.moved_at).toLocaleString()}</span>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
                  <div className="bg-accent/5 border border-accent/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-accent text-sm">◆</span>
                      <span className="text-xs font-semibold text-accent uppercase tracking-wide">Failure analysis</span>
                    </div>
                    <p className="text-sm text-text leading-relaxed mb-2">{insight.summary}</p>
                    <p className="text-sm text-muted leading-relaxed">
                      <span className="text-text font-medium">Suggested fix: </span>
                      {insight.suggestion}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted mb-1.5">Raw error</p>
                    <pre className="bg-panel2 border border-border rounded-lg p-3 text-xs font-mono text-danger overflow-x-auto whitespace-pre-wrap">
                      {entry.final_error || "No error message recorded."}
                    </pre>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Queue #{entry.queue_id} · {entry.total_attempts} attempt(s)</span>
                    <button
                      onClick={() => handleReplay(entry.job_id)}
                      disabled={replaying === entry.job_id}
                      className="bg-accent2 hover:bg-accent2/90 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                    >
                      {replaying === entry.job_id ? "Replaying…" : "Replay job"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {(!dlq || dlq.length === 0) && (
          <div className="bg-panel border border-border rounded-xl p-8 text-center">
            <p className="text-sm text-muted">No dead letters — nothing has permanently failed. 🎉</p>
          </div>
        )}
      </div>
    </div>
  );
}
