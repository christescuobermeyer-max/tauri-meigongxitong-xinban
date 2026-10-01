use super::*;

pub(crate) async fn upload_image_to_oss(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<oss::UploadImageToOssRequest>,
) -> Result<Json<oss::UploadImageToOssResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    oss::upload_image_to_oss(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

pub(crate) async fn oss_presigned_urls(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<oss::PresignOssUrlsRequest>,
) -> Result<Json<oss::PresignOssUrlsResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    oss::presign_oss_urls(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

pub(crate) async fn admin_create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<admin_user::AdminCreateUserRequest>,
) -> Result<Json<admin_user::AdminCreateUserResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;
    admin_user::admin_create_user(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_request)
}

pub(crate) async fn admin_soft_delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<admin_user::AdminSoftDeleteUserRequest>,
) -> Result<Json<admin_user::AdminSoftDeleteUserResponse>, GatewayError> {
    let user_id = verify_access_token(&state, &headers).await?;
    let token = bearer_token(&headers)?;
    ensure_admin_profile(&state, token, &user_id).await?;
    admin_user::admin_soft_delete_user(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_request)
}

pub(crate) async fn menu_organize(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<menu_design::MenuOrganizeRequest>,
) -> Result<Json<menu_design::MenuOrganizeResponse>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    menu_design::organize(req).await.map(Json).map_err(GatewayError::bad_gateway)
}

pub(crate) async fn brand_story_generate_text(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<brand_story::BrandStoryTextRequestInput>,
) -> Result<Json<brand_story::BrandCopy>, GatewayError> {
    let _user_id = verify_access_token(&state, &headers).await?;
    brand_story::brand_story_generate_text(req)
        .await
        .map(Json)
        .map_err(GatewayError::bad_gateway)
}

pub(crate) async fn brand_story_thread_availability() -> Json<brand_story::BrandStoryThreadAvailability> {
    Json(brand_story::brand_story_thread_availability())
}
