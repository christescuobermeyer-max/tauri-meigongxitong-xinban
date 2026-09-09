# APIMart Official Line8 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add line8 as the APIMart official GPT-Image-2 provider, reusing the line5 APIMart key, with docs and connection verification.

**Architecture:** Keep existing line5 behavior unchanged. Add line8 as a separate provider using `https://api.apimart.ai/v1/images/generations` and `https://api.apimart.ai/v1/tasks/{task_id}` while sharing the APIMart async task helper shape. Extend gateway routing, health, history, Supabase line constraints, and balance monitoring metadata.

**Tech Stack:** Tauri 2, Rust, Axum gateway, React/TypeScript, Supabase, APIMart official API.

---

### Task 1: Add Failing Line8 Contract Tests

**Files:**
- Create: `tests/apimart-official-line8.test.ts`

**Steps:**
1. Write assertions that line8 exists in TS/Rust/Supabase schema.
2. Assert APIMart official base URL is `https://api.apimart.ai`.
3. Assert line8 reuses `APIMART_IMAGE_2_API_KEY`.
4. Assert gateway limiter, health, balance metadata, and line labels include line8.
5. Run: `npx tsx tests/apimart-official-line8.test.ts`
6. Expected: FAIL because line8 is not implemented yet.

### Task 2: Implement Rust Provider and Task Polling

**Files:**
- Modify: `src-tauri/src/image_provider.rs`
- Modify: `src-tauri/src/api.rs`
- Modify: `src-tauri/src/apimart.rs`
- Modify: `src-tauri/src/apimart_task.rs`
- Modify: `src-tauri/src/api_validation.rs`

**Steps:**
1. Add `ImageApiLine::Line8`.
2. Add official APIMart provider constants.
3. Reuse line5 env keys for line8.
4. Let APIMart task polling accept provider-specific task base URL and label.
5. Route line8 through the APIMart async generation path.
6. Run the line8 contract test.

### Task 3: Implement Gateway, Types, UI Metadata, and Supabase Constraint

**Files:**
- Modify: `src-tauri/src/gateway_limiter.rs`
- Modify: `src-tauri/src/line_health.rs`
- Modify: `src-tauri/src/bin/backend_gateway.rs`
- Modify: `src-tauri/src/balance.rs`
- Modify: `src/types.ts`
- Modify: `src/lib/supabase.ts`
- Modify: `src/lib/cloud-history.ts`
- Modify: `src/lib/history.ts`
- Modify: `src/lib/admin-log-filters.ts`
- Modify: `src/lib/line-health.ts`
- Modify: `src/lib/balance.ts`
- Modify: `src/components/LineHealthBar.tsx`
- Modify: `src/components/HistoryPanel.tsx`
- Modify: `src/components/admin/AdminGenerationLogList.tsx`
- Modify: `supabase/schema.sql`
- Create: `supabase/migrations/20260615_add_generation_line8.sql`

**Steps:**
1. Add line8 everywhere line union types or labels enumerate lines.
2. Add line8 to auto-routing after line5, before line6/line7.
3. Add `GATEWAY_GENERATION_LINE8_LIMIT`, default limit `8`.
4. Make balance monitoring line8 reuse line5 session and console/API config.
5. Run the line8 contract test plus affected existing contract tests.

### Task 4: Add API Connection Documentation

**Files:**
- Create: `docs/apimart-official-line8-api.md`

**Steps:**
1. Document endpoint, auth, request body, response, polling, size mapping, env variables, and integration notes.
2. Include a sanitized connection-test result section.
3. Do not include API keys or generated private URLs.

### Task 5: Verify Official API Connectivity

**Files:**
- Use existing `.env.local` only as local input; do not print secrets.

**Steps:**
1. Read `APIMART_IMAGE_2_API_KEY` or `IMAGE_2_LINE5_API_KEY`.
2. Submit a minimal text-only `1:1` image task to `https://api.apimart.ai/v1/images/generations`.
3. Poll `https://api.apimart.ai/v1/tasks/{task_id}` until image URL or failure.
4. Download the image if a URL is returned to prove end-to-end connectivity.
5. Record only status, task id prefix, and image byte length in final response.

### Task 6: Verification

**Commands:**
- `npx tsx tests/apimart-official-line8.test.ts`
- `npx tsx tests/gateway-auto-line-routing.test.ts`
- `npx tsx tests/line-health.test.ts`
- `npx tsx tests/vectorengine-line.test.ts`
- `npx tsx tests/apimart-line.test.ts`
- `npm run build`

**Expected:** All targeted tests and TypeScript/Vite build pass.
