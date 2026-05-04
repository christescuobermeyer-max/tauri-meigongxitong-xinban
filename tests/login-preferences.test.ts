import { deepEqual, equal } from "node:assert/strict";
import {
  consumeSkipAutoLoginOnce,
  getDefaultLoginPreferences,
  loadLoginPreferencesFrom,
  markSkipAutoLoginOnce,
  saveLoginPreferencesTo,
} from "../src/lib/login-preferences.js";

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

deepEqual(getDefaultLoginPreferences(), {
  email: "",
  password: "",
  rememberPassword: true,
  autoLogin: true,
});

const storage = createStorage();

saveLoginPreferencesTo(
  {
    email: " worker@example.com ",
    password: "abc123",
    rememberPassword: true,
    autoLogin: true,
  },
  storage
);

deepEqual(loadLoginPreferencesFrom(storage), {
  email: "worker@example.com",
  password: "abc123",
  rememberPassword: true,
  autoLogin: true,
});

saveLoginPreferencesTo(
  {
    email: "worker@example.com",
    password: "abc123",
    rememberPassword: false,
    autoLogin: true,
  },
  storage
);

deepEqual(loadLoginPreferencesFrom(storage), {
  email: "worker@example.com",
  password: "",
  rememberPassword: false,
  autoLogin: false,
});

const sessionStorage = createStorage();
equal(consumeSkipAutoLoginOnce(sessionStorage), false);
markSkipAutoLoginOnce(sessionStorage);
equal(consumeSkipAutoLoginOnce(sessionStorage), true);
equal(consumeSkipAutoLoginOnce(sessionStorage), false);
