import { useEffect, useState } from "react";
import AppErrorBoundary from "./components/AppErrorBoundary";
import LoginPage from "./components/LoginPage";
import MandatoryUpdateGate from "./components/MandatoryUpdateGate";
import WorkspaceShell from "./components/WorkspaceShell";
import { ToastProvider } from "./components/Toast";
import useAuth from "./hooks/useAuth";

export default function App() {
  const [workspaceBusy, setWorkspaceBusy] = useState(false);

  return (
    <AppErrorBoundary>
      <ToastProvider>
        <AppRouter onWorkspaceBusyChange={setWorkspaceBusy} />
        <MandatoryUpdateGate suspend={workspaceBusy} />
      </ToastProvider>
    </AppErrorBoundary>
  );
}

interface AppRouterProps {
  onWorkspaceBusyChange: (busy: boolean) => void;
}

function AppRouter({ onWorkspaceBusyChange }: AppRouterProps) {
  const auth = useAuth();

  useEffect(() => {
    if (!auth.profile) onWorkspaceBusyChange(false);
  }, [auth.profile, onWorkspaceBusyChange]);

  if (auth.loading) {
    return (
      <div className="login-shell">
        <div className="login-card login-card--loading">
          <span className="spinner spinner--lg" />
          <span>正在恢复登录状态…</span>
        </div>
      </div>
    );
  }

  if (!auth.profile) {
    return <LoginPage onSuccess={auth.setProfile} />;
  }

  return (
    <WorkspaceShell
      profile={auth.profile}
      isAdmin={auth.isAdmin}
      onSignOut={auth.signOut}
      onBusyChange={onWorkspaceBusyChange}
    />
  );
}
