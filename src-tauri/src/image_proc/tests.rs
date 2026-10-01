use super::*;
use super::jpeg::save_jpeg_with_limit;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{DynamicImage, ImageFormat, RgbaImage};


    #[tokio::test]
    async fn compress_generated_image_outputs_small_jpeg() {
        let source = DynamicImage::ImageRgba8(RgbaImage::from_pixel(
            1024,
            1024,
            image::Rgba([255, 0, 0, 255]),
        ));
        let mut source_bytes = Vec::new();
        source
            .write_to(
                &mut std::io::Cursor::new(&mut source_bytes),
                ImageFormat::Png,
            )
            .unwrap();

        let result = compress_generated_image(CompressGeneratedImageRequest {
            base64_data: STANDARD.encode(source_bytes),
            max_dimension: 768,
            quality: 82,
        })
        .await
        .unwrap();

        assert_eq!(result.mime_type, "image/jpeg");
        assert_eq!(result.width, 768);
        assert_eq!(result.height, 768);
        assert!(result.byte_size > 0);
    }

    #[tokio::test]
    async fn save_base64_image_writes_original_bytes() {
        let source = DynamicImage::ImageRgba8(RgbaImage::from_pixel(
            64,
            32,
            image::Rgba([0, 128, 255, 255]),
        ));
        let mut source_bytes = Vec::new();
        source
            .write_to(
                &mut std::io::Cursor::new(&mut source_bytes),
                ImageFormat::Png,
            )
            .unwrap();
        let path = std::env::temp_dir().join(format!(
            "csgh-original-image-test-{}.png",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&path);

        let result = save_base64_image(SaveBase64ImageRequest {
            base64_data: STANDARD.encode(&source_bytes),
            output_path: path.to_string_lossy().to_string(),
        })
        .await
        .unwrap();

        assert_eq!(result, path.to_string_lossy());
        assert_eq!(std::fs::read(&path).unwrap(), source_bytes);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_jpeg_with_limit_errors_when_limit_cannot_be_met() {
        let image = DynamicImage::ImageRgba8(RgbaImage::from_pixel(
            64,
            64,
            image::Rgba([128, 64, 32, 255]),
        ));
        let path =
            std::env::temp_dir().join(format!("csgh-jpeg-limit-test-{}.jpg", std::process::id()));
        let _ = std::fs::remove_file(&path);

        let result = save_jpeg_with_limit(&image, &path, Some(1));

        assert!(result.is_err());
        assert!(!path.exists());
    }
