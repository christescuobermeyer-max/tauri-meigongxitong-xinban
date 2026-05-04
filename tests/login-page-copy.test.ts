import { equal } from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/LoginPage.tsx", import.meta.url), "utf8");

equal(source.includes('<img src="/brand-logo.png" alt="" />'), true);
equal(source.includes("呈尚策划运营部"), true);
equal(source.includes("账号由管理员在 Supabase 后台创建。如忘记密码，请联系管理员重置。"), false);
