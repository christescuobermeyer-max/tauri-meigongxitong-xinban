use super::*;
use std::time::Duration;

#[tokio::test]
async fn bounds_waiting_queue_and_removes_expired_tickets() {
    let queue = Arc::new(GatewayGenerationQueue::with_wait_limits(
        GatewayLimiter::new(1, HashMap::from([("line2", 1)])),
        Arc::new(LineHealthRegistry::new()), 1, 1, Duration::from_millis(80),
    ));
    let active = queue.acquire_auto_for_user("active", "1024x1024").await.unwrap();
    let waiting_queue = Arc::clone(&queue);
    let waiting = tokio::spawn(async move { waiting_queue.acquire_auto_for_user("waiting", "1024x1024").await });
    tokio::time::timeout(Duration::from_secs(1), async {
        while queue.snapshot().waiting.is_empty() { tokio::task::yield_now().await; }
    }).await.unwrap();
    let rejected = queue.acquire_auto_for_user("overflow", "1024x1024").await;
    assert!(rejected.err().unwrap().contains("已满"));
    assert!(waiting.await.unwrap().err().unwrap().contains("等待超时"));
    assert!(queue.snapshot().waiting.is_empty());
    drop(active);
    assert!(queue.acquire_auto("1024x1024").await.is_ok());
}
