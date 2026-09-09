import { useCallback, useEffect, useState } from "react";
import { getCurrentProfile, signOut as authSignOut } from "../lib/auth";
import { markSkipAutoLoginOnce } from "../lib/login-preferences";
import { supabase, type ProfileRow } from "../lib/supabase";

export interface AuthState {
  profile: ProfileRow | null;
  loading: boolean;
}

export default function useAuth() {
  const [state, setState] = useState<AuthState>({ profile: null, loading: true });

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await getCurrentProfile();
      setState({ profile, loading: false });
    } catch (error) {
      console.error("[useAuth] refreshProfile failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      setState((previous) =>
        message.includes("账号已被停用")
          ? { profile: null, loading: false }
          : { profile: previous.profile, loading: false }
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const profile = await getCurrentProfile().catch(() => null);
      if (cancelled) return;
      setState({ profile, loading: false });
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setState({ profile: null, loading: false });
        return;
      }
      void refreshProfile();
    });

    // 每 60 秒重新校验一次 profile.is_active：被管理员停用后会被 assertActiveProfile
    // 内部的 supabase.auth.signOut() 弹出，下一次 onAuthStateChange 会把 state 清空。
    const pollTimer = window.setInterval(() => {
      void refreshProfile();
    }, 60_000);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      window.clearInterval(pollTimer);
    };
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    markSkipAutoLoginOnce();
    await authSignOut();
    setState({ profile: null, loading: false });
  }, []);

  return {
    profile: state.profile,
    loading: state.loading,
    isAdmin: state.profile?.role === "admin",
    refreshProfile,
    signOut,
    setProfile: (profile: ProfileRow | null) => setState({ profile, loading: false }),
  };
}
