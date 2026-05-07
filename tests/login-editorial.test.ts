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
equal(styles.includes("width: 100vw;"), true);
equal(styles.includes("height: 100vh;"), true);
equal(styles.includes("padding: 0;"), true);
equal(styles.includes("grid-template-columns: minmax(0, 1fr) minmax(460px, 520px);"), true);
equal(styles.includes("gap: 0;"), true);
equal(styles.includes("max-width: 420px;"), true);
equal(styles.includes("@keyframes login-editorial-rise"), true);
