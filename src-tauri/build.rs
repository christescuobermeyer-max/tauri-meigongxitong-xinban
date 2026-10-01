fn main() {
    // 服务秘密仅由受控运行环境提供，不能通过构建写入员工安装包。
    #[cfg(feature = "tauri-commands")]
    tauri_build::build()
}
