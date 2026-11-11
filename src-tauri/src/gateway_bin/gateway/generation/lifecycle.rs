use super::*;

pub(crate) async fn finish_generation<F, T>(work: F) -> Result<T, GatewayError>
where
    F: std::future::Future<Output = Result<T, GatewayError>> + Send + 'static,
    T: Send + 'static,
{
    tokio::spawn(work).await.map_err(|_| GatewayError::bad_gateway(
        "生成任务异常中断，请先检查历史记录后再决定是否重试",
    ))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn disconnect_does_not_cancel_a_started_generation() {
        let (started, ready) = tokio::sync::oneshot::channel();
        let (finish, wait) = tokio::sync::oneshot::channel();
        let (archived, result) = tokio::sync::oneshot::channel();
        let request = tokio::spawn(finish_generation(async move {
            started.send(()).unwrap();
            wait.await.unwrap();
            archived.send(()).unwrap();
            Ok(())
        }));
        ready.await.unwrap();
        request.abort();
        let _ = request.await;
        finish.send(()).unwrap();
        tokio::time::timeout(Duration::from_secs(1), result).await.unwrap().unwrap();
    }
}
