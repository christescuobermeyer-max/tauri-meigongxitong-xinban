use std::{path::Path, process::{Child, Command}};

pub(super) fn launch_installer(path: &Path) -> Result<Child, String> {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let mut command = if extension == "msi" {
        let mut command = Command::new("msiexec.exe");
        command.arg("/i").arg(path).arg("/passive").arg("/norestart");
        command
    } else {
        let mut command = Command::new(path);
        command.arg("/S");
        command
    };
    command.spawn().map_err(|error| format!("启动安装程序失败：{error}"))
}

pub(super) fn reopen_after_install(installer: &Child, app_exe: &Path) -> Result<(), String> {
    let script = format!("Start-Sleep -Seconds 2; Wait-Process -Id {} -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Start-Process -FilePath '{}'",
        installer.id(), escape_powershell_single_quoted_path(app_exe));
    Command::new("powershell.exe").arg("-NoProfile").arg("-ExecutionPolicy").arg("Bypass")
        .arg("-WindowStyle").arg("Hidden").arg("-Command").arg(script)
        .spawn().map_err(|error| format!("启动更新后自动打开程序失败：{error}"))?;
    Ok(())
}

pub(super) fn escape_powershell_single_quoted_path(path: &Path) -> String {
    path.to_string_lossy().replace('\'', "''")
}
