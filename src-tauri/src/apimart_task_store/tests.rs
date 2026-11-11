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
    let store = ApimartTaskStore::new(Some(path.clone()));
    let task = pending();
    assert!(task.archive.is_none());
    store.insert(task).await.unwrap();
    let lock = store.lock_archive("task-1").await;
    assert!(tokio::time::timeout(std::time::Duration::from_millis(20), store.lock_archive("task-1")).await.is_err());
    drop(lock);
    store.save_archive("task-1", StoredApimartArchive {
        url: "https://example.invalid/one.jpg?signature=first".into(), key: "generated/one.jpg".into(),
    }).await.unwrap();
    let restored = ApimartTaskStore::new(Some(path));
    let archive = restored.archived("task-1").await.unwrap();
    assert_eq!(archive.key, "generated/one.jpg");
    assert!(archive.url.ends_with("signature=first"));
    restored.remove("task-1").await.unwrap();
    assert!(restored.list().await.is_empty());
    std::fs::remove_dir_all(directory).unwrap();
}
