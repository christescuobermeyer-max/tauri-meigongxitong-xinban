use super::*;

pub(super) fn resolve_export_spec(export_target: &str) -> Result<VideoExportSpec, String> {
    match export_target {
        "meituan" => Ok(VideoExportSpec {
            label: "美团视频店招",
            width: 692,
            height: 390,
            min_duration_seconds: None,
            max_duration_seconds: None,
            max_file_size_bytes: None,
            max_video_bitrate: None,
            buffer_size: None,
        }),
        "taobaoFlash" => Ok(VideoExportSpec {
            label: "淘宝闪购视频店招",
            width: 1280,
            height: 720,
            min_duration_seconds: Some(5.0),
            max_duration_seconds: Some(90.0),
            max_file_size_bytes: Some(200 * 1024 * 1024),
            max_video_bitrate: Some("8000k"),
            buffer_size: Some("16000k"),
        }),
        other => Err(format!("不支持的导出规格: {}", other)),
    }
}

pub(super) fn validate_export_duration(crop: &CropParams, spec: VideoExportSpec) -> Result<f64, String> {
    let duration = crop.end_time - crop.start_time;
    if duration <= 0.0 {
        return Err("时间范围无效：结束时间必须大于开始时间".to_string());
    }
    if let Some(min_duration) = spec.min_duration_seconds {
        if duration < min_duration {
            return Err(format!(
                "{}时长不能少于{}秒",
                spec.label, min_duration as i32
            ));
        }
    }
    if let Some(max_duration) = spec.max_duration_seconds {
        if duration > max_duration {
            return Err(format!(
                "{}时长不能超过{}秒",
                spec.label, max_duration as i32
            ));
        }
    }
    Ok(duration)
}

pub(super) fn ensure_mp4_file_name(file_name: &str) -> String {
    let trimmed = file_name.trim();
    let base = if trimmed.is_empty() {
        "店招视频"
    } else {
        trimmed
    };
    let safe_name = base
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>();
    if safe_name.to_ascii_lowercase().ends_with(".mp4") {
        safe_name
    } else {
        format!("{}.mp4", safe_name)
    }
}

pub(super) fn make_even_dimension(value: i32) -> i32 {
    let even = if value % 2 == 0 { value } else { value - 1 };
    even.max(2)
}

pub(super) fn normalize_crop_for_video(
    crop: &CropParams,
    video_width: i32,
    video_height: i32,
) -> Result<CropParams, String> {
    if video_width < 2 || video_height < 2 {
        return Err(format!(
            "视频尺寸过小，无法裁剪：{}x{}",
            video_width, video_height
        ));
    }

    let max_x = (video_width - 2).max(0);
    let max_y = (video_height - 2).max(0);
    let mut x = crop.x.clamp(0, max_x);
    let mut y = crop.y.clamp(0, max_y);
    if x % 2 != 0 {
        x -= 1;
    }
    if y % 2 != 0 {
        y -= 1;
    }

    let max_width = make_even_dimension(video_width - x);
    let max_height = make_even_dimension(video_height - y);
    let raw_width = if crop.width <= 0 {
        max_width
    } else {
        crop.width.min(max_width)
    };
    let raw_height = if crop.height <= 0 {
        max_height
    } else {
        crop.height.min(max_height)
    };
    let width = make_even_dimension(raw_width).min(max_width);
    let height = make_even_dimension(raw_height).min(max_height);

    if width < 2 || height < 2 || x + width > video_width || y + height > video_height {
        return Err(format!(
            "裁剪区域超出视频范围：视频 {}x{}，裁剪 x={} y={} w={} h={}",
            video_width, video_height, x, y, width, height
        ));
    }

    Ok(CropParams {
        x,
        y,
        width,
        height,
        start_time: crop.start_time,
        end_time: crop.end_time,
    })
}
