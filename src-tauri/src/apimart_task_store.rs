use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, path::PathBuf, sync::{Arc, Mutex as StdMutex}};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingApimartTask {
    pub task_id: String,
    pub user_id: String,
    pub shop_name: String,
    #[serde(default)]
    pub product_name: Option<String>,
    pub asset_kind: String,
    pub platform: String,
    pub file_name_stem: String,
    pub generation_line: String,
    pub started_at_ms: i64,
    #[serde(default)]
    pub archive: Option<StoredApimartArchive>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredApimartArchive {
    pub url: String,
    pub key: String,
}

pub struct ApimartTaskStore {
    path: Option<PathBuf>,
    tasks: Mutex<HashMap<String, PendingApimartTask>>,
    archive_locks: Mutex<HashMap<String, std::sync::Weak<Mutex<()>>>>,
    active: Arc<StdMutex<HashSet<String>>>,
}

pub struct ActiveApimartTask {
    task_id: String,
    active: Arc<StdMutex<HashSet<String>>>,
}

impl Drop for ActiveApimartTask {
    fn drop(&mut self) {
        self.active.lock().expect("active task lock poisoned").remove(&self.task_id);
    }
}

impl ApimartTaskStore {
    pub fn new(path: Option<PathBuf>) -> Result<Self, String> {
        let stored = match path.as_ref().map(std::fs::read) {
            Some(Ok(bytes)) => serde_json::from_slice::<Vec<PendingApimartTask>>(&bytes)
                .map_err(|_| "APIMart 恢复文件损坏，请保留文件并检查备份".to_string())?,
            Some(Err(error)) if error.kind() != std::io::ErrorKind::NotFound =>
                return Err(format!("读取 APIMart 恢复文件失败：{error}")),
            _ => Vec::new(),
        };
        let tasks = stored.into_iter()
            .map(|task| (task.task_id.clone(), task))
            .collect();

        Ok(Self {
            path,
            tasks: Mutex::new(tasks),
            archive_locks: Mutex::new(HashMap::new()),
            active: Arc::new(StdMutex::new(HashSet::new())),
        })
    }

    pub async fn insert(&self, task: PendingApimartTask) -> Result<(), String> {
        let mut guard = self.tasks.lock().await;
        let mut next = guard.clone();
        next.insert(task.task_id.clone(), task);
        self.persist(&next).await?;
        *guard = next;
        Ok(())
    }

    pub async fn remove(&self, task_id: &str) -> Result<(), String> {
        let mut guard = self.tasks.lock().await;
        let mut next = guard.clone();
        next.remove(task_id);
        self.persist(&next).await?;
        *guard = next;
        Ok(())
    }

    pub async fn list(&self) -> Vec<PendingApimartTask> {
        self.tasks.lock().await.values().cloned().collect()
    }

    pub async fn get(&self, task_id: &str) -> Option<PendingApimartTask> {
        self.tasks.lock().await.get(task_id).cloned()
    }

    pub fn try_claim(&self, task_id: &str) -> Option<ActiveApimartTask> {
        if !self.active.lock().expect("active task lock poisoned").insert(task_id.to_string()) {
            return None;
        }
        Some(ActiveApimartTask { task_id: task_id.to_string(), active: Arc::clone(&self.active) })
    }

    pub async fn archived(&self, task_id: &str) -> Option<StoredApimartArchive> {
        self.tasks.lock().await.get(task_id).and_then(|task| task.archive.clone())
    }

    pub async fn lock_archive(&self, task_id: &str) -> tokio::sync::OwnedMutexGuard<()> {
        let mut locks = self.archive_locks.lock().await;
        locks.retain(|_, lock| lock.strong_count() > 0);
        let lock = locks.get(task_id).and_then(std::sync::Weak::upgrade)
            .unwrap_or_else(|| std::sync::Arc::new(Mutex::new(())));
        locks.insert(task_id.to_string(), std::sync::Arc::downgrade(&lock));
        drop(locks);
        lock.lock_owned().await
    }

    pub async fn save_archive(&self, task_id: &str, archive: StoredApimartArchive) -> Result<(), String> {
        let mut guard = self.tasks.lock().await;
        let mut next = guard.clone();
        let task = next.get_mut(task_id).ok_or_else(|| "待恢复任务不存在".to_string())?;
        task.archive = Some(archive);
        self.persist(&next).await?;
        *guard = next;
        Ok(())
    }

    async fn persist(&self, tasks: &HashMap<String, PendingApimartTask>) -> Result<(), String> {
        let Some(path) = self.path.as_ref() else {
            return Ok(());
        };
        let mut list = tasks.values().cloned().collect::<Vec<_>>();
        list.sort_by(|a, b| a.started_at_ms.cmp(&b.started_at_ms));
        let data = serde_json::to_vec_pretty(&list)
            .map_err(|error| format!("序列化 APIMart pending task 失败：{error}"))?;
        use std::io::Write;
        let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
        let result = (|| -> std::io::Result<()> {
            let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary)?;
            file.write_all(&data)?;
            file.sync_all()?;
            drop(file);
            std::fs::rename(&temporary, path)
        })();
        if result.is_err() { let _ = std::fs::remove_file(&temporary); }
        result.map_err(|error| format!("写入 APIMart pending task 文件失败：{error}"))
    }
}

#[cfg(test)]
#[path = "apimart_task_store/tests.rs"]
mod tests;
