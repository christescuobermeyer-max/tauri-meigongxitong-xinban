import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/LoginPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

equal(source.includes('className="login-shell__backdrop"'), false);
equal(source.includes('className="login-particles"'), false);
equal(source.includes('className="login-shell login-shell--editorial"'), true);
equal(source.includes('className="login-editorial-cover"'), true);
equal(source.includes('className="login-editorial-form"'), true);
equal(source.includes('className="login-stage"'), false);
equal(source.includes('className="login-story"'), false);
equal(styles.includes(".login-shell--editorial"), true);
equal(styles.includes(".login-editorial-cover"), true);
equal(styles.includes(".login-editorial-form"), true);
equal(styles.includes("animation: login-editorial-rise"), true);
