const STATUS_STYLES = {
  queued: "bg-panel2 text-muted border-border",
  scheduled: "bg-accent2/10 text-accent2 border-accent2/30",
  claimed: "bg-warn/10 text-warn border-warn/30",
  running: "bg-warn/10 text-warn border-warn/30",
  completed: "bg-success/10 text-success border-success/30",
  failed: "bg-danger/10 text-danger border-danger/30",
  dead: "bg-dead/10 text-dead border-dead/30",
  online: "bg-success/10 text-success border-success/30",
  offline: "bg-danger/10 text-danger border-danger/30",
  shutting_down: "bg-warn/10 text-warn border-warn/30",
};

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || "bg-panel2 text-muted border-border";
  const isLive = status === "running" || status === "online";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-mono font-medium ${style}`}>
      {isLive && <span className="w-1.5 h-1.5 rounded-full bg-current pulse-dot" />}
      {status}
    </span>
  );
}
