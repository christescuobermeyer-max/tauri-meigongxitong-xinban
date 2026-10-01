use super::*;

fn test_spec() -> VideoExportSpec {
    VideoExportSpec {
        label: "测试视频",
        width: 692,
        height: 390,
        min_duration_seconds: None,
        max_duration_seconds: None,
        max_file_size_bytes: None,
        max_video_bitrate: None,
        buffer_size: None,
    }
}

fn test_crop() -> CropParams {
    CropParams {
        x: 0,
        y: 0,
        width: 692,
        height: 390,
        start_time: 0.0,
        end_time: 10.0,
    }
}

#[test]
fn muted_export_removes_audio_stream() {
    let args = build_ffmpeg_export_args(
        "input.mp4",
        &PathBuf::from("output.mp4"),
        &test_crop(),
        test_spec(),
        10.0,
        false,
    );

    assert!(args.iter().any(|arg| arg == "-an"));
    assert!(!args.iter().any(|arg| arg == "0:a:0?"));
    assert!(!args.iter().any(|arg| arg == "-c:a"));
}

#[test]
fn audio_export_maps_optional_audio_and_encodes_aac() {
    let args = build_ffmpeg_export_args(
        "input.mp4",
        &PathBuf::from("output.mp4"),
        &test_crop(),
        test_spec(),
        10.0,
        true,
    );

    assert!(!args.iter().any(|arg| arg == "-an"));
    assert!(args.iter().any(|arg| arg == "0:a:0?"));
    assert!(args.iter().any(|arg| arg == "-c:a"));
    assert!(args.iter().any(|arg| arg == "aac"));
    assert!(args.iter().any(|arg| arg == "128k"));
}

#[test]
fn export_history_excludes_preview_source_videos() {
    assert!(!is_exported_video_file_name("preview_123.mp4"));
    assert!(!is_exported_video_file_name("local_preview_123.mp4"));
    assert!(is_exported_video_file_name("门店视频店招.mp4"));
}
