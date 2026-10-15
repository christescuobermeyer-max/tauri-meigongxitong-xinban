use super::submit_apimart_task_with_label;
use serde_json::json;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::net::TcpListener;

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .http1_only()
        .connect_timeout(Duration::from_millis(500))
        .timeout(Duration::from_secs(2))
        .build()
        .expect("创建本地验证客户端")
}

#[tokio::test]
async fn retries_connection_setup_failure_three_times() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("监听本地端口");
    let address = listener.local_addr().expect("获取端口");
    let accepted = Arc::new(AtomicUsize::new(0));
    let count = Arc::clone(&accepted);
    let server = tokio::spawn(async move {
        loop {
            let (socket, _) = listener.accept().await.expect("接受连接");
            count.fetch_add(1, Ordering::SeqCst);
            // 在 TLS 握手期间断开，HTTP 生图请求尚未发送。
            drop(socket);
        }
    });
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        submit_apimart_task_with_label(
            &client(),
            &format!("https://{address}/v1/images/generations"),
            "test-key",
            &json!({"prompt": "连接验证"}),
            "线路5 APIMart",
        ),
    )
    .await
    .expect("重试应在限定时间内结束");
    server.abort();
    assert!(result.is_err());
    assert_eq!(
        accepted.load(Ordering::SeqCst),
        3,
        "连接阶段失败应最多尝试3次"
    );
}

#[tokio::test]
async fn never_resubmits_after_request_was_received() {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("监听本地端口");
    let address = listener.local_addr().expect("获取端口");
    let received = Arc::new(AtomicUsize::new(0));
    let count = Arc::clone(&received);
    let server = tokio::spawn(async move {
        loop {
            let (mut socket, _) = listener.accept().await.expect("接受连接");
            let mut buffer = [0; 4096];
            if socket.read(&mut buffer).await.expect("读取请求") > 0 {
                count.fetch_add(1, Ordering::SeqCst);
            }
            // 请求已收到但响应丢失，不能断定上游未扣费。
            drop(socket);
        }
    });
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        submit_apimart_task_with_label(
            &client(),
            &format!("http://{address}/v1/images/generations"),
            "test-key",
            &json!({"prompt": "响应丢失验证"}),
            "线路5 APIMart",
        ),
    )
    .await
    .expect("不应等待多轮重试");
    server.abort();
    assert!(result.is_err());
    assert_eq!(received.load(Ordering::SeqCst), 1, "响应丢失后不得重复提交");
}
