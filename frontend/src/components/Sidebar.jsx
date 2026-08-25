import { NavLink, useNavigate } from "react-router-dom";
import { clearToken } from "../api";

const LINKS = [
  { to: "/", label: "Overview", icon: "◈" },
  { to: "/queues", label: "Queues", icon: "▤" },
  { to: "/jobs", label: "Jobs", icon: "◷" },
  { to: "/workers", label: "Workers", icon: "◍" },
  { to: "/dlq", label: "Dead Letters", icon: "✕" },
];

export default function Sidebar({ orgEmail }) {
  const navigate = useNavigate();

  function handleLogout() {
    clearToken();
    navigate("/login");
  }

  return (
    <aside className="w-56 shrink-0 h-screen bg-panel border-r border-border flex flex-col">
      <div className="px-5 py-6 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent pulse-dot" />
          <span className="font-semibold text-text tracking-tight">Pulse</span>
        </div>
        <p className="text-xs text-muted mt-1">Distributed Job Scheduler</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? "bg-panel2 text-text" : "text-muted hover:text-text hover:bg-panel2/60"
              }`
            }
          >
            <span className="text-base opacity-70">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-border">
        {orgEmail && <p className="text-xs text-muted truncate mb-2 font-mono">{orgEmail}</p>}
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-muted hover:text-danger transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
