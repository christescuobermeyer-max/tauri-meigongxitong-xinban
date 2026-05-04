import AppErrorBoundary from "./components/AppErrorBoundary";
import LoginPage from "./components/LoginPage";
import WorkspaceShell from "./components/WorkspaceShell";
import { ToastProvider } from "./components/Toast";
import useAuth from "./hooks/useAuth";

export default function App() {
  return (
    <AppErrorBoundary>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </AppErrorBoundary>
  );
}

function AppRouter() {
  const auth = useAuth();

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
    />
  );
}
