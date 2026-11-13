//! Finished desktop animations uploaded to OSS, and the read-only "动图展示" feed of video clips.
use super::*;
use crate::product_animation::{inspect_animation, VIDEO_STYLE};

pub(crate) const SHOWCASE_PAGE_SIZE: usize = 12;
pub(crate) const SHOWCASE_MAX_PAGES: usize = 10;
const MAX_ANIMATION_BASE64: usize = 6_700_000;
const MAX_POSTER_BASE64: usize = 2_000_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UploadRequest {
    id: String,
    style: String,
    #[serde(default)]
    title: String,
    /// Base64 GIF or WebP exactly as saved on the desktop.
    data: String,
    /// Base64 JPEG of the first frame, shown until the card scrolls into view.
    poster: String,
}

#[derive(Debug)]
pub(super) struct CheckedUpload {
    id: String,
    style: String,
    title: String,
    media: AnimationMedia,
    bytes: Vec<u8>,
    poster: Vec<u8>,
}

fn clean_title(title: &str) -> String {
    title.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(60).collect()
}

/// Validates everything from the file itself: format, size, dimensions, duration and motion.
pub(super) fn check_upload(req: UploadRequest) -> Result<CheckedUpload, String> {
    let id = uuid::Uuid::parse_str(&req.id).map_err(|_| "动图标识无效")?.to_string();
    if req.data.len() > MAX_ANIMATION_BASE64 || req.poster.len() > MAX_POSTER_BASE64 {
        return Err("动图超过5M，不能上传".into());
    }
    let bytes = STANDARD.decode(req.data.trim()).map_err(|_| "动图编码无效")?;
    let poster = STANDARD.decode(req.poster.trim()).map_err(|_| "封面编码无效")?;
    let format = if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "gif"
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "webp"
    } else {
        return Err("只能上传GIF或WebP动图".into());
    };
    if !poster.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Err("封面必须为JPEG".into());
    }
    let (width, height) = image::ImageReader::new(std::io::Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|_| "动图损坏")?
        .into_dimensions()
        .map_err(|_| "动图损坏")?;
    // Duration here only satisfies spec validation; inspect_animation measures the real one.
    let spec = AnimationSpec { width, height, duration_ms: 3000, format: format.into(), style: req.style.clone() };
    let media = inspect_animation(&bytes, &spec)?;
    Ok(CheckedUpload { id, style: req.style, title: clean_title(&req.title), media, bytes, poster })
}

#[derive(Deserialize)]
struct OwnerRow {
    user_id: String,
}

async fn owner_of(state: &AppState, id: &str) -> Result<Option<String>, String> {
    let rows = store::request(state, reqwest::Method::GET, &format!("animation_uploads?select=user_id&id=eq.{id}"), None).await?;
    let rows: Vec<OwnerRow> = serde_json::from_value(rows).map_err(|_| "动图记录格式错误")?;
    Ok(rows.into_iter().next().map(|row| row.user_id))
}

pub(crate) async fn upload_animation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<UploadRequest>,
) -> Result<Json<serde_json::Value>, GatewayError> {
    let user = verify_access_token(&state, &headers).await?;
    let upload = tokio::task::spawn_blocking(move || check_upload(req))
        .await
        .map_err(|_| GatewayError::bad_gateway("动图校验失败"))?
        .map_err(GatewayError::bad_request)?;
    // Retries after a lost response are fine; another account's id is not.
    match owner_of(&state, &upload.id).await.map_err(GatewayError::bad_gateway)? {
        Some(owner) if owner == user => return Ok(Json(json!({"id": upload.id, "uploaded": true}))),
        Some(_) => return Err(GatewayError::bad_request("动图标识冲突")),
        None => {}
    }
    let format = upload.media.format.clone();
    let key = oss::put_animation_object(&user, &upload.id, &format!("result.{format}"), &upload.bytes, &format!("image/{format}"))
        .await
        .map_err(GatewayError::bad_gateway)?;
    let poster_key = oss::put_animation_object(&user, &upload.id, "poster.jpg", &upload.poster, "image/jpeg")
        .await
        .map_err(GatewayError::bad_gateway)?;
    let row = json!({
        "id": upload.id, "user_id": user, "style": upload.style, "title": upload.title, "format": format,
        "width": upload.media.width, "height": upload.media.height, "duration_ms": upload.media.duration_ms,
        "frames": upload.media.frames, "bytes": upload.media.bytes, "oss_key": key, "poster_key": poster_key,
    });
    if let Err(error) = store::request(&state, reqwest::Method::POST, "animation_uploads", Some(row)).await {
        // A concurrent retry of the same upload may have inserted first.
        if owner_of(&state, &upload.id).await.ok().flatten().as_deref() != Some(user.as_str()) {
            return Err(GatewayError::bad_gateway(error));
        }
    }
    eprintln!("[animation-upload] id={} style={} bytes={}", upload.id, upload.style, upload.media.bytes);
    Ok(Json(json!({"id": upload.id, "uploaded": true})))
}

#[derive(Deserialize)]
pub(crate) struct ShowcaseQuery {
    page: Option<usize>,
}

#[derive(Deserialize)]
struct ShowcaseRow {
    id: String,
    user_id: String,
    title: String,
    format: String,
    width: u32,
    height: u32,
    duration_ms: u32,
    frames: u32,
    bytes: u32,
    oss_key: String,
    poster_key: String,
    created_at: String,
}

pub(super) fn showcase_page_count(total: i64) -> usize {
    let visible = total.clamp(0, (SHOWCASE_PAGE_SIZE * SHOWCASE_MAX_PAGES) as i64) as usize;
    visible.div_ceil(SHOWCASE_PAGE_SIZE).clamp(1, SHOWCASE_MAX_PAGES)
}

async fn fetch_showcase(state: &AppState, bearer: &str, page: usize) -> Result<(Vec<ShowcaseRow>, i64), GatewayError> {
    let start = (page - 1) * SHOWCASE_PAGE_SIZE;
    let response = state
        .client
        .get(format!(
            "{}/rest/v1/animation_uploads?select=id,user_id,title,format,width,height,duration_ms,frames,bytes,oss_key,poster_key,created_at&style=eq.{VIDEO_STYLE}&order=created_at.desc",
            state.supabase_url
        ))
        .header("apikey", bearer)
        .bearer_auth(bearer)
        .header("Range-Unit", "items")
        .header("Range", format!("{}-{}", start, start + SHOWCASE_PAGE_SIZE - 1))
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|error| GatewayError::bad_gateway(format!("读取动图展示失败：{error}")))?;
    if !response.status().is_success() {
        let status = response.status();
        // 416: the requested page is past the end.
        if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
            let total = response.headers().get(header::CONTENT_RANGE).and_then(|v| v.to_str().ok()).and_then(parse_content_range_total).unwrap_or(0);
            return Ok((Vec::new(), total));
        }
        return Err(GatewayError::bad_gateway(format!("读取动图展示返回 {status}，请检查数据库迁移")));
    }
    let total = response.headers().get(header::CONTENT_RANGE).and_then(|v| v.to_str().ok()).and_then(parse_content_range_total);
    let rows: Vec<ShowcaseRow> = response.json().await.map_err(|error| GatewayError::bad_gateway(format!("解析动图展示失败：{error}")))?;
    let fallback = (start + rows.len()) as i64;
    Ok((rows, total.unwrap_or(fallback)))
}

pub(crate) async fn animation_showcase(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ShowcaseQuery>,
) -> Result<Json<serde_json::Value>, GatewayError> {
    verify_access_token(&state, &headers).await?;
    let bearer = service_role_bearer(&state)?;
    let requested = query.page.unwrap_or(1).clamp(1, SHOWCASE_MAX_PAGES);
    let (mut rows, total) = fetch_showcase(&state, bearer, requested).await?;
    let page_count = showcase_page_count(total);
    let page = requested.min(page_count);
    if page != requested {
        rows = fetch_showcase(&state, bearer, page).await?.0;
    }
    let users: std::collections::HashSet<String> = rows.iter().map(|row| row.user_id.clone()).collect();
    let names = if users.is_empty() { HashMap::new() } else { fetch_display_names(&state, bearer, bearer, &users).await? };
    let items = rows
        .into_iter()
        .map(|row| {
            Ok(json!({
                "id": row.id,
                "display_name": names.get(&row.user_id).cloned().unwrap_or_else(|| "未知账号".to_string()),
                "title": row.title, "format": row.format, "width": row.width, "height": row.height,
                "duration_ms": row.duration_ms, "frames": row.frames, "bytes": row.bytes,
                "url": oss::animation_download_url(&row.oss_key)?,
                "poster_url": oss::animation_download_url(&row.poster_key)?,
                "created_at": row.created_at,
            }))
        })
        .collect::<Result<Vec<_>, String>>()
        .map_err(GatewayError::bad_gateway)?;
    let visible = total.clamp(0, (SHOWCASE_PAGE_SIZE * SHOWCASE_MAX_PAGES) as i64);
    Ok(Json(json!({
        "page": page, "page_size": SHOWCASE_PAGE_SIZE, "max_pages": SHOWCASE_MAX_PAGES,
        "total_count": total, "visible_total_count": visible, "page_count": page_count, "items": items,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{codecs::gif::GifEncoder, Delay, Frame, Rgba, RgbaImage};

    fn gif(frames: u8, delay_ms: u32) -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = GifEncoder::new(&mut bytes);
            for index in 0..frames {
                let image = RgbaImage::from_pixel(768, 576, Rgba([index * 60, 90, 30, 255]));
                encoder.encode_frame(Frame::from_parts(image, 0, 0, Delay::from_numer_denom_ms(delay_ms, 1))).unwrap();
            }
        }
        bytes
    }
    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10];
    fn request(data: &[u8], style: &str, title: &str) -> UploadRequest {
        UploadRequest { id: uuid::Uuid::new_v4().to_string(), style: style.into(), title: title.into(), data: STANDARD.encode(data), poster: STANDARD.encode(JPEG) }
    }

    #[test]
    fn accepts_platform_gif_and_measures_it() {
        let checked = check_upload(request(&gif(3, 1000), VIDEO_STYLE, "  抖音 · 招牌牛肉面\n ")).unwrap();
        assert_eq!((checked.media.width, checked.media.height, checked.media.frames, checked.media.duration_ms), (768, 576, 3, 3000));
        assert_eq!(checked.media.format, "gif");
        assert_eq!(checked.title, "抖音 · 招牌牛肉面");
        assert_eq!(checked.poster, JPEG);
    }

    #[test]
    fn rejects_files_outside_platform_rules() {
        let png = {
            let mut out = Vec::new();
            RgbaImage::from_pixel(768, 576, Rgba([0, 0, 0, 255])).write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png).unwrap();
            out
        };
        assert!(check_upload(request(&png, VIDEO_STYLE, "")).unwrap_err().contains("GIF或WebP"));
        assert!(check_upload(request(&gif(1, 3000), VIDEO_STYLE, "")).is_err(), "single frame");
        assert!(check_upload(request(&gif(3, 3000), VIDEO_STYLE, "")).is_err(), "9 s is too long");
        assert!(check_upload(request(&gif(3, 1000), "unknown", "")).is_err(), "unknown style");
        let mut bad_poster = request(&gif(3, 1000), VIDEO_STYLE, "");
        bad_poster.poster = STANDARD.encode(b"\x89PNG");
        assert!(check_upload(bad_poster).unwrap_err().contains("JPEG"));
        let mut huge = request(&gif(3, 1000), VIDEO_STYLE, "");
        huge.data = "A".repeat(MAX_ANIMATION_BASE64 + 4);
        assert!(check_upload(huge).unwrap_err().contains("5M"));
        let mut bad_id = request(&gif(3, 1000), VIDEO_STYLE, "");
        bad_id.id = "../x".into();
        assert!(check_upload(bad_id).is_err());
    }

    #[test]
    fn titles_are_trimmed_and_capped() {
        assert_eq!(clean_title(&"菜".repeat(80)).chars().count(), 60);
        assert_eq!(clean_title("a\u{0007}b"), "ab");
    }

    #[test]
    fn showcase_pages_are_capped() {
        assert_eq!(showcase_page_count(0), 1);
        assert_eq!(showcase_page_count(13), 2);
        assert_eq!(showcase_page_count(10_000), SHOWCASE_MAX_PAGES);
    }
}
