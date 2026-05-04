import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/LoginPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");

equal(source.includes('className="login-shell__backdrop"'), true);
equal(source.includes('className="login-particles"'), true);
equal(source.includes('className="login-card"'), true);
equal(source.includes('className="login-stage"'), false);
equal(source.includes('className="login-story"'), false);
equal(styles.includes("@keyframes login-mesh-drift"), true);
equal(styles.includes("@keyframes login-glow-breathe"), true);
equal(styles.includes("animation: login-mesh-drift"), true);
equal(styles.includes("animation: login-glow-breathe"), true);
