import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { isLoggedIn, api } from "./api";
import Sidebar from "./components/Sidebar";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Queues from "./pages/Queues";
import Jobs from "./pages/Jobs";
import Workers from "./pages/Workers";
import DeadLetterQueue from "./pages/DeadLetterQueue";

function ProtectedLayout({ children }) {
  const [email, setEmail] = useState(null);

  useEffect(() => {
    api.me().then((u) => setEmail(u.email)).catch(() => {});
  }, []);

  if (!isLoggedIn()) return <Navigate to="/login" replace />;

  return (
    <div className="flex">
      <Sidebar orgEmail={email} />
      <main className="flex-1 min-h-screen overflow-y-auto">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isLoggedIn() ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<ProtectedLayout><Overview /></ProtectedLayout>} />
        <Route path="/queues" element={<ProtectedLayout><Queues /></ProtectedLayout>} />
        <Route path="/jobs" element={<ProtectedLayout><Jobs /></ProtectedLayout>} />
        <Route path="/workers" element={<ProtectedLayout><Workers /></ProtectedLayout>} />
        <Route path="/dlq" element={<ProtectedLayout><DeadLetterQueue /></ProtectedLayout>} />
      </Routes>
    </BrowserRouter>
  );
}
