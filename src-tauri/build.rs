fn main() {
    // 编译时读取 .env.local，将所有变量通过 cargo:rustc-env 嵌入二进制
    // 这样打包后的 .exe 无需依赖运行时目录下的 .env.local 文件
    let env_paths = ["../.env.local", "../.env", ".env.local", ".env"];
    for path in &env_paths {
        if let Ok(content) = std::fs::read_to_string(path) {
            for line in content.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = line.split_once('=') {
                    let key = key.trim();
                    let value = value.trim();
                    if !key.is_empty() && !value.is_empty() {
                        println!("cargo:rustc-env={key}={value}");
                    }
                }
            }
            break; // 只用第一个找到的文件
        }
    }

    #[cfg(feature = "tauri-commands")]
    tauri_build::build()
}
