use super::{download::write_verified_stream, launch::escape_powershell_single_quoted_path, security::*};
use std::path::PathBuf;

const ABC_SHA256: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

#[test]
fn validates_https_digest_version_and_redirects() {
    assert!(validate_installer_url(&"https://example.test/app.exe".parse().unwrap()).is_ok());
    assert!(validate_installer_url(&"http://example.test/app.exe".parse().unwrap()).is_err());
    assert!(validate_installer_url(&"https://example.test/app.zip".parse().unwrap()).is_err());
    assert!(validate_redirect(&"http://example.test/app.exe".parse().unwrap(), 1).is_err());
    assert!(validate_redirect(&"https://example.test/app.exe".parse().unwrap(), 10).is_err());
    assert_eq!(validate_sha256(&ABC_SHA256.to_uppercase()).unwrap(), ABC_SHA256);
    for invalid in ["", "a", &"g".repeat(64), &"a".repeat(63)] { assert!(validate_sha256(invalid).is_err()); }
    assert!(validate_version("3.1.0").is_ok());
    for invalid in ["..", "../../outside", "3.0", "3.0.beta"] { assert!(validate_version(invalid).is_err()); }
}

#[test]
fn sanitizes_file_names_and_powershell_paths() {
    let url = "https://example.test/app%203.1.0.msi".parse().unwrap();
    assert_eq!(installer_file_name(&url).unwrap(), "app_3.1.0.msi");
    assert_eq!(safe_path_segment("3.1.0/beta"), "3.1.0_beta");
    assert_eq!(safe_path_segment(".."), "_");
    assert_eq!(escape_powershell_single_quoted_path(&PathBuf::from(r"C:\Csgh's App\app.exe")), r"C:\Csgh''s App\app.exe");
}

fn fixture_path() -> PathBuf {
    std::env::temp_dir().join(format!("csgh-update-test-{}", uuid::Uuid::new_v4())).join("fixture.exe")
}

#[tokio::test]
async fn valid_stream_is_renamed_only_after_digest_verification() {
    let path = fixture_path();
    tokio::fs::create_dir_all(path.parent().unwrap()).await.unwrap();
    let stream = futures_util::stream::iter([Ok::<_, &str>(b"a".to_vec()), Ok(b"bc".to_vec())]);
    write_verified_stream(stream, &path, ABC_SHA256, Some(3), |_, _| Ok(())).await.unwrap();
    assert_eq!(tokio::fs::read(&path).await.unwrap(), b"abc");
    assert!(!path.with_extension("exe.part").exists());
    tokio::fs::remove_dir_all(path.parent().unwrap()).await.unwrap();
}

#[tokio::test]
async fn changed_or_interrupted_stream_never_leaves_executable_or_partial_file() {
    let path = fixture_path();
    tokio::fs::create_dir_all(path.parent().unwrap()).await.unwrap();
    for chunks in [vec![Ok(b"abd".to_vec())], vec![Ok(b"a".to_vec()), Err("网络中断")], vec![]] {
        let stream = futures_util::stream::iter(chunks);
        assert!(write_verified_stream(stream, &path, ABC_SHA256, Some(3), |_, _| Ok(())).await.is_err());
        assert!(!path.exists());
        assert!(!path.with_extension("exe.part").exists());
    }
    tokio::fs::remove_dir_all(path.parent().unwrap()).await.unwrap();
}
