import { equal } from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(new URL("../src/components/LoginPage.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/global.css", import.meta.url), "utf8");
const posterPath = fileURLToPath(new URL("../public/login-poster.png", import.meta.url));

equal(source.includes('className="login-shell login-shell--editorial"'), true);
equal(source.includes('className="login-editorial-cover"'), true);
equal(source.includes("C · 杂志封面 / Editorial"), true);
equal(source.includes('className="login-editorial-poster"'), true);
equal(source.includes('src="/login-poster.png"'), true);
equal(existsSync(posterPath), true);
equal(source.includes('className="login-editorial-form"'), true);
equal(styles.includes(".login-editorial-cover"), true);
equal(styles.includes(".login-editorial-poster"), true);
equal(styles.includes("height: min(970px, 100vh);"), true);
equal(styles.includes("max-height: 970px;"), true);
equal(styles.includes("@keyframes login-editorial-rise"), true);
