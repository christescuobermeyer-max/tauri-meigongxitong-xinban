use super::GatewayGenerationQueue;
use crate::gateway_limiter::GatewayLimiter;
use crate::line_health::LineHealthRegistry;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

fn test_queue(global_limit: usize) -> Arc<GatewayGenerationQueue> {
    let health = Arc::new(LineHealthRegistry::new());
    Arc::new(GatewayGenerationQueue::new(
        GatewayLimiter::new(global_limit, HashMap::from([("line2", 2), ("line3", 1)])),
        health,
        3,
    ))
}

fn queue_with_lines(
    global_limit: usize,
    health: Arc<LineHealthRegistry>,
    user_limit: usize,
) -> Arc<GatewayGenerationQueue> {
    Arc::new(GatewayGenerationQueue::new(
        GatewayLimiter::new(global_limit, HashMap::from([("line2", 1), ("line3", 1)])),
        health,
        user_limit,
    ))
}

#[tokio::test]
async fn waits_for_capacity_in_fifo_order_when_all_lines_are_full() {
    let queue = test_queue(1);
    let occupied = queue
        .acquire_auto("1024x1024")
        .await
        .expect("first request should occupy the only slot");

    let first_waiter = {
        let queue = Arc::clone(&queue);
        tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
    };
    let second_waiter = {
        let queue = Arc::clone(&queue);
        tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
    };

    tokio::time::sleep(Duration::from_millis(25)).await;
    assert!(!first_waiter.is_finished());
    assert!(!second_waiter.is_finished());

    drop(occupied);
    let first = tokio::time::timeout(Duration::from_secs(1), first_waiter)
        .await
        .expect("first waiter should be released first")
        .expect("first waiter task should not panic")
        .expect("first waiter should acquire a slot");
    assert!(!second_waiter.is_finished());

    drop(first);
    tokio::time::timeout(Duration::from_secs(1), second_waiter)
        .await
        .expect("second waiter should be released after the first permit drops")
        .expect("second waiter task should not panic")
        .expect("second waiter should acquire a slot");
}

#[tokio::test]
async fn returns_immediately_when_no_compatible_line_can_ever_run_request() {
    let queue = test_queue(1);

    let result = queue.acquire_auto("unsupported-size").await;

    assert!(result.is_err());
}

#[tokio::test]
async fn removes_cancelled_waiter_so_later_requests_can_continue() {
    let queue = test_queue(1);
    let occupied = queue
        .acquire_auto("1024x1024")
        .await
        .expect("first request should occupy the only slot");
    let cancelled_waiter = {
        let queue = Arc::clone(&queue);
        tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
    };

    tokio::time::sleep(Duration::from_millis(25)).await;
    cancelled_waiter.abort();
    let _ = cancelled_waiter.await;

    let next_waiter = {
        let queue = Arc::clone(&queue);
        tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
    };
    drop(occupied);

    tokio::time::timeout(Duration::from_secs(1), next_waiter)
        .await
        .expect("later waiter should not be blocked by a cancelled ticket")
        .expect("later waiter task should not panic")
        .expect("later waiter should acquire a slot");
}

#[tokio::test]
async fn queued_auto_request_rechecks_health_before_selecting_line() {
    let health = Arc::new(LineHealthRegistry::new());
    let queue = queue_with_lines(1, Arc::clone(&health), 3);
    let occupied = queue
        .acquire_auto("1024x1024")
        .await
        .expect("first request should occupy the only slot");

    let waiter = {
        let queue = Arc::clone(&queue);
        tokio::spawn(async move { queue.acquire_auto("1024x1024").await })
    };
    tokio::time::sleep(Duration::from_millis(25)).await;

    for _ in 0..5 {
        health.record("line2", 0, false);
    }
    drop(occupied);

    let permit = tokio::time::timeout(Duration::from_secs(1), waiter)
        .await
        .expect("waiter should acquire a healthy line")
        .expect("waiter task should not panic")
        .expect("waiter should acquire a slot");
    assert_eq!(permit.line(), "line3");
}

#[tokio::test]
async fn lets_other_users_run_when_front_user_is_at_limit() {
    let health = Arc::new(LineHealthRegistry::new());
    let queue = queue_with_lines(2, Arc::clone(&health), 1);
    let occupied_by_a = queue
        .acquire_auto_for_user("user-a", "1024x1024")
        .await
        .expect("user-a should occupy one user slot");

    let second_a = {
        let queue = Arc::clone(&queue);
        tokio::spawn(async move { queue.acquire_auto_for_user("user-a", "1024x1024").await })
    };
    tokio::time::sleep(Duration::from_millis(25)).await;
    assert!(!second_a.is_finished());

    let first_b = {
        let queue = Arc::clone(&queue);
        tokio::spawn(async move { queue.acquire_auto_for_user("user-b", "1024x1024").await })
    };
    let b_permit = tokio::time::timeout(Duration::from_secs(1), first_b)
        .await
        .expect("user-b should not be blocked by user-a's queued request")
        .expect("user-b task should not panic")
        .expect("user-b should acquire capacity");
    assert!(!second_a.is_finished());

    drop(occupied_by_a);
    let a_permit = tokio::time::timeout(Duration::from_secs(1), second_a)
        .await
        .expect("user-a queued request should run after user-a releases")
        .expect("user-a task should not panic")
        .expect("user-a second request should acquire capacity");

    drop(b_permit);
    drop(a_permit);
}

#[tokio::test]
async fn enforces_configured_user_limit() {
    let health = Arc::new(LineHealthRegistry::new());
    let queue = Arc::new(GatewayGenerationQueue::new(
        GatewayLimiter::new(4, HashMap::from([("line2", 4), ("line3", 4)])),
        health,
        3,
    ));

    let a1 = queue
        .acquire_auto_for_user("user-a", "1024x1024")
        .await
        .expect("first user-a request should run");
    let a2 = queue
        .acquire_auto_for_user("user-a", "1024x1024")
        .await
        .expect("second user-a request should run");
    let a3 = queue
        .acquire_auto_for_user("user-a", "1024x1024")
        .await
        .expect("third user-a request should run");

    let fourth_a = {
        let queue = Arc::clone(&queue);
        tokio::spawn(async move { queue.acquire_auto_for_user("user-a", "1024x1024").await })
    };
    tokio::time::sleep(Duration::from_millis(25)).await;
    assert!(!fourth_a.is_finished());

    let b1 = queue
        .acquire_auto_for_user("user-b", "1024x1024")
        .await
        .expect("another user should use remaining global capacity");

    drop(a1);
    let a4 = tokio::time::timeout(Duration::from_secs(1), fourth_a)
        .await
        .expect("fourth user-a request should run after a user-a release")
        .expect("fourth user-a task should not panic")
        .expect("fourth user-a request should acquire capacity");

    drop(a2);
    drop(a3);
    drop(a4);
    drop(b1);
}
