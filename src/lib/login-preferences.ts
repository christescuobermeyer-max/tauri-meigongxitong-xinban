export interface LoginPreferences {
  email: string;
  password: string;
  rememberPassword: boolean;
  autoLogin: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const LOGIN_PREFERENCES_KEY = "csgh-login-preferences";
const AUTO_LOGIN_SKIP_KEY = "csgh-skip-auto-login-once";

export function getDefaultLoginPreferences(): LoginPreferences {
  return {
    email: "",
    password: "",
    rememberPassword: true,
    autoLogin: true,
  };
}

export function loadLoginPreferences(): LoginPreferences {
  return loadLoginPreferencesFrom(resolveLocalStorage());
}

export function loadLoginPreferencesFrom(storage: StorageLike | null): LoginPreferences {
  const defaults = getDefaultLoginPreferences();
  if (!storage) return defaults;

  try {
    const raw = storage.getItem(LOGIN_PREFERENCES_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<LoginPreferences>;
    return normalizeLoginPreferences({
      email: typeof parsed.email === "string" ? parsed.email : defaults.email,
      password: typeof parsed.password === "string" ? parsed.password : defaults.password,
      rememberPassword:
        typeof parsed.rememberPassword === "boolean"
          ? parsed.rememberPassword
          : defaults.rememberPassword,
      autoLogin:
        typeof parsed.autoLogin === "boolean" ? parsed.autoLogin : defaults.autoLogin,
    });
  } catch {
    return defaults;
  }
}

export function saveLoginPreferences(preferences: LoginPreferences) {
  saveLoginPreferencesTo(preferences, resolveLocalStorage());
}

export function saveLoginPreferencesTo(
  preferences: LoginPreferences,
  storage: StorageLike | null
) {
  if (!storage) return;
  const normalized = normalizeLoginPreferences(preferences);

  try {
    storage.setItem(LOGIN_PREFERENCES_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
}

export function markSkipAutoLoginOnce(storage: StorageLike | null = resolveSessionStorage()) {
  if (!storage) return;
  try {
    storage.setItem(AUTO_LOGIN_SKIP_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeSkipAutoLoginOnce(
  storage: StorageLike | null = resolveSessionStorage()
): boolean {
  if (!storage) return false;
  try {
    const value = storage.getItem(AUTO_LOGIN_SKIP_KEY);
    if (value !== "1") return false;
    storage.removeItem(AUTO_LOGIN_SKIP_KEY);
    return true;
  } catch {
    return false;
  }
}

export function canAutoLogin(preferences: LoginPreferences): boolean {
  return Boolean(
    preferences.autoLogin &&
      preferences.rememberPassword &&
      preferences.email.trim() &&
      preferences.password
  );
}

function normalizeLoginPreferences(preferences: LoginPreferences): LoginPreferences {
  const email = preferences.email.trim();
  const rememberPassword = preferences.rememberPassword;
  const autoLogin = rememberPassword && preferences.autoLogin;

  return {
    email,
    password: rememberPassword ? preferences.password : "",
    rememberPassword,
    autoLogin,
  };
}

function resolveLocalStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function resolveSessionStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}
