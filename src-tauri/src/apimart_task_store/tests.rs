use super::*;

fn pending() -> PendingApimartTask {
    serde_json::from_value(serde_json::json!({
        "task_id": "task-1", "user_id": "user-1", "shop_name": "测试店",
        "asset_kind": "product", "platform": "meituan", "file_name_stem": "product",
        "generation_line": "line5", "started_at_ms": 1
    })).unwrap()
}

#[tokio::test]
async fn preserves_archive_across_restart_and_accepts_old_tasks() {
    let directory = std::env::temp_dir().join(format!("csgh-tasks-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&directory).unwrap();
    let path = directory.join("tasks.json");
    let store = ApimartTaskStore::new(Some(path.clone())).unwrap();
    let task = pending();
    assert!(task.archive.is_none());
    store.insert(task).await.unwrap();
    let lock = store.lock_archive("task-1").await;
    assert!(tokio::time::timeout(std::time::Duration::from_millis(20), store.lock_archive("task-1")).await.is_err());
    drop(lock);
    store.save_archive("task-1", StoredApimartArchive {
        url: "https://example.invalid/one.jpg?signature=first".into(), key: "generated/one.jpg".into(),
    }).await.unwrap();
    let restored = ApimartTaskStore::new(Some(path)).unwrap();
    let archive = restored.archived("task-1").await.unwrap();
    assert_eq!(archive.key, "generated/one.jpg");
    assert!(archive.url.ends_with("signature=first"));
    restored.remove("task-1").await.unwrap();
    assert!(restored.list().await.is_empty());
    std::fs::remove_dir_all(directory).unwrap();
}

#[tokio::test]
async fn persistence_failure_does_not_publish_memory_only_tasks() {
    let directory = std::env::temp_dir().join(format!("csgh-tasks-{}", uuid::Uuid::new_v4()));
    let store = ApimartTaskStore::new(Some(directory.join("tasks.json"))).unwrap();
    assert!(store.insert(pending()).await.is_err());
    assert!(store.list().await.is_empty());
    let claim = store.try_claim("task-1").unwrap();
    assert!(store.try_claim("task-1").is_none());
    drop(claim);
    assert!(store.try_claim("task-1").is_some());
}

#[test]
fn damaged_snapshot_is_not_silently_replaced_with_an_empty_queue() {
    let path = std::env::temp_dir().join(format!("csgh-tasks-{}.json", uuid::Uuid::new_v4()));
    std::fs::write(&path, b"[broken").unwrap();
    assert!(ApimartTaskStore::new(Some(path.clone())).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), b"[broken");
    std::fs::remove_file(path).unwrap();
}
