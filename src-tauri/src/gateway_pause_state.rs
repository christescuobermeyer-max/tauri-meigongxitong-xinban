//! 线路暂停状态注册表。
//!
//! 桌面端管理员的余额监控发现某条线路余额为 0 时，会调
//! `/api/admin/line-pause` 把该线路标记为暂停；网关在生图分配时
//! 把"暂停的线路"作为额外排除集，从 auto 路由 + manual 路径里都拿掉。
//!
//! 状态持久化到 `paused-lines.json`，网关重启不丢；下次余额恢复
//! 桌面端会调 `/api/admin/line-resume`（幂等）。

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PausedLineInfo {
    pub line: String,
    pub reason: String,
    /// ISO8601 UTC，含 'Z' 后缀
    pub paused_at: String,
    /// `balance_zero` / `manual`
    pub source: String,
}

pub struct PauseStateRegistry {
    paused: RwLock<HashMap<String, PausedLineInfo>>,
    persist_path: Option<PathBuf>,
}

impl PauseStateRegistry {
    pub fn new(persist_path: Option<PathBuf>) -> Self {
        let registry = Self {
            paused: RwLock::new(HashMap::new()),
            persist_path,
        };
        registry.load_from_disk();
        registry
    }

    fn load_from_disk(&self) {
        let Some(path) = self.persist_path.as_ref() else {
            return;
        };
        if !path.exists() {
            return;
        }
        let contents = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(error) => {
                eprintln!(
                    "[pause-state] 读取 {} 失败：{error}（按「无暂停」启动）",
                    path.display()
                );
                return;
            }
        };
        let parsed: HashMap<String, PausedLineInfo> = match serde_json::from_str(&contents) {
            Ok(p) => p,
            Err(error) => {
                eprintln!(
                    "[pause-state] 解析 {} 失败：{error}（按「无暂停」启动）",
                    path.display()
                );
                return;
            }
        };
        let count = parsed.len();
        {
            let mut guard = self.paused.write().expect("paused state poisoned");
            *guard = parsed;
        }
        eprintln!(
            "[pause-state] 从 {} 加载 {count} 条暂停记录",
            path.display()
        );
    }

    fn save_to_disk(&self) {
        let Some(path) = self.persist_path.as_ref() else {
            return;
        };
        let guard = self.paused.read().expect("paused state poisoned");
        let serialized = match serde_json::to_string_pretty(&*guard) {
            Ok(s) => s,
            Err(error) => {
                eprintln!("[pause-state] 序列化失败：{error}");
                return;
            }
        };
        drop(guard);
        if let Some(parent) = path.parent() {
            if let Err(error) = std::fs::create_dir_all(parent) {
                eprintln!(
                    "[pause-state] 创建 {} 目录失败：{error}",
                    parent.display()
                );
                return;
            }
        }
        if let Err(error) = std::fs::write(path, serialized) {
            eprintln!(
                "[pause-state] 写入 {} 失败：{error}",
                path.display()
            );
        }
    }

    /// 暂停一条线路。重复调用同一线路视为更新原因/时间（幂等）。
    pub fn pause(&self, line: String, reason: String, source: String) -> PausedLineInfo {
        let info = PausedLineInfo {
            line: line.clone(),
            reason,
            paused_at: Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true),
            source,
        };
        {
            let mut guard = self.paused.write().expect("paused state poisoned");
            guard.insert(line, info.clone());
        }
        self.save_to_disk();
        eprintln!(
            "[pause-state] paused line={} reason={} source={}",
            info.line, info.reason, info.source
        );
        info
    }

    /// 恢复一条线路。返回是否真的有暂停记录被移除（幂等）。
    pub fn resume(&self, line: &str) -> bool {
        let removed = {
            let mut guard = self.paused.write().expect("paused state poisoned");
            guard.remove(line).is_some()
        };
        if removed {
            self.save_to_disk();
            eprintln!("[pause-state] resumed line={line}");
        }
        removed
    }

    pub fn is_paused(&self, line: &str) -> bool {
        let guard = self.paused.read().expect("paused state poisoned");
        guard.contains_key(line)
    }

    /// 返回当前所有 paused 线路名（HashSet，便于和 exclude 集合做并集）。
    pub fn paused_set(&self) -> HashSet<String> {
        let guard = self.paused.read().expect("paused state poisoned");
        guard.keys().cloned().collect()
    }

    /// 输出按线路名排序的快照，给 /api/admin/gateway-stats。
    pub fn snapshot(&self) -> Vec<PausedLineInfo> {
        let guard = self.paused.read().expect("paused state poisoned");
        let mut items: Vec<PausedLineInfo> = guard.values().cloned().collect();
        items.sort_by(|a, b| a.line.cmp(&b.line));
        items
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pause_then_resume_roundtrips() {
        let reg = PauseStateRegistry::new(None);
        assert!(!reg.is_paused("line5"));
        reg.pause("line5".into(), "余额为 0".into(), "balance_zero".into());
        assert!(reg.is_paused("line5"));
        assert!(reg.paused_set().contains("line5"));
        assert!(reg.resume("line5"));
        assert!(!reg.is_paused("line5"));
        assert!(!reg.resume("line5"));
    }

    #[test]
    fn snapshot_is_sorted_by_line() {
        let reg = PauseStateRegistry::new(None);
        reg.pause("line5".into(), "x".into(), "manual".into());
        reg.pause("line2".into(), "y".into(), "manual".into());
        let snap = reg.snapshot();
        assert_eq!(snap.len(), 2);
        assert_eq!(snap[0].line, "line2");
        assert_eq!(snap[1].line, "line5");
    }

    #[test]
    fn persists_and_reloads_across_instances() {
        let tmp = std::env::temp_dir().join(format!(
            "csgh-pause-state-test-{}.json",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&tmp);

        let reg1 = PauseStateRegistry::new(Some(tmp.clone()));
        reg1.pause("line7".into(), "余额为 0".into(), "balance_zero".into());
        drop(reg1);

        let reg2 = PauseStateRegistry::new(Some(tmp.clone()));
        assert!(reg2.is_paused("line7"));
        let snap = reg2.snapshot();
        assert_eq!(snap.len(), 1);
        assert_eq!(snap[0].source, "balance_zero");

        let _ = std::fs::remove_file(&tmp);
    }
}
