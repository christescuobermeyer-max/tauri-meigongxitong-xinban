use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::PathBuf};
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
}

impl ApimartTaskStore {
    pub fn new(path: Option<PathBuf>) -> Self {
        let tasks = path
            .as_ref()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .and_then(|text| serde_json::from_str::<Vec<PendingApimartTask>>(&text).ok())
            .unwrap_or_default()
            .into_iter()
            .map(|task| (task.task_id.clone(), task))
            .collect();

        Self {
            path,
            tasks: Mutex::new(tasks),
            archive_locks: Mutex::new(HashMap::new()),
        }
    }

    pub async fn insert(&self, task: PendingApimartTask) -> Result<(), String> {
        let mut guard = self.tasks.lock().await;
        guard.insert(task.task_id.clone(), task);
        self.persist(&guard).await
    }

    pub async fn remove(&self, task_id: &str) -> Result<(), String> {
        let mut guard = self.tasks.lock().await;
        guard.remove(task_id);
        self.persist(&guard).await
    }

    pub async fn list(&self) -> Vec<PendingApimartTask> {
        self.tasks.lock().await.values().cloned().collect()
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
        let task = guard.get_mut(task_id).ok_or_else(|| "待恢复任务不存在".to_string())?;
        task.archive = Some(archive);
        self.persist(&guard).await
    }

    async fn persist(&self, tasks: &HashMap<String, PendingApimartTask>) -> Result<(), String> {
        let Some(path) = self.path.as_ref() else {
            return Ok(());
        };
        let mut list = tasks.values().cloned().collect::<Vec<_>>();
        list.sort_by(|a, b| a.started_at_ms.cmp(&b.started_at_ms));
        let data = serde_json::to_vec_pretty(&list)
            .map_err(|error| format!("序列化 APIMart pending task 失败：{error}"))?;
        tokio::fs::write(path, data)
            .await
            .map_err(|error| format!("写入 APIMart pending task 文件失败：{error}"))
    }
}

#[cfg(test)]
#[path = "apimart_task_store/tests.rs"]
mod tests;
