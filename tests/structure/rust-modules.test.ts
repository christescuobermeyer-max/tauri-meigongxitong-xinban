import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'src-tauri', 'src');
const facades = ['gateway_bin/backend_gateway.rs', 'video_commands.rs', 'prompt_templates.rs',
  'gateway_queue.rs', 'gateway_limiter.rs', 'brand_story.rs', 'xiaohongshu_cookie_support.rs'];
const effectiveLines = (source: string) => source.split(/\r?\n/).filter(line => {
  const text = line.trim();
  return text && !text.startsWith('//') && !text.startsWith('use ')
    && !text.startsWith('mod ') && !text.startsWith('pub use ');
}).length;
for (const path of facades) {
  const source = readFileSync(join(root, path), 'utf8');
  assert.ok(effectiveLines(source) <= 250, `${path} 必须拆分到 250 有效行以内`);
  assert.ok(!source.includes('include!('), `${path} 必须按职责拆分模块`);
}
for (const path of ['api_validation.rs', 'image_generation_payload.rs']) {
  assert.ok(!readFileSync(join(root, path), 'utf8').includes('crate::api::GenerateRequest'),
    `${path} 不能反向依赖 API 门面`);
}
function scan(path: string) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const target = join(path, entry.name);
    if (entry.isDirectory()) scan(target);
    else if (target.endsWith('.rs')) {
      assert.ok(effectiveLines(readFileSync(target, 'utf8')) <= 250,
        `${target} 必须符合 Rust 模块规模约束`);
    }
  }
}
for (const path of ['gateway_bin/gateway', 'video_commands', 'prompt_templates', 'gateway_queue',
  'gateway_limiter', 'brand_story', 'xiaohongshu_cookie_support']) {
  scan(join(root, path));
}
console.log('Rust 模块职责与文件规模检查通过');
