use tauri::{LogicalSize, Manager, Runtime, WebviewWindow};

/// 窗口超出屏幕可用区域时占用的比例，留出边距便于取消最大化后拖动
const FIT_RATIO: f64 = 0.94;

/// 启动时让主窗口适配当前屏幕：默认尺寸放不下时缩小、居中并最大化，
/// 避免小分辨率或高缩放下标题栏和底部超出屏幕。窗口以隐藏状态创建，适配后再显示。
pub fn fit_main_window<R: Runtime>(app: &tauri::App<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    fit_to_work_area(&window);
    let _ = window.show();
}

fn fit_to_work_area<R: Runtime>(window: &WebviewWindow<R>) {
    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(outer)) = (monitor, window.outer_size()) else {
        return;
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area().size.to_logical::<f64>(scale);
    let outer = outer.to_logical::<f64>(scale);
    let Some((width, height)) = fitted_size((outer.width, outer.height), (area.width, area.height))
    else {
        return;
    };
    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.center();
    let _ = window.maximize();
}

/// 窗口能完整放进可用区域时返回 None，否则返回缩小后的逻辑尺寸
fn fitted_size(window: (f64, f64), area: (f64, f64)) -> Option<(f64, f64)> {
    if window.0 <= area.0 && window.1 <= area.1 {
        return None;
    }
    Some((window.0.min(area.0 * FIT_RATIO), window.1.min(area.1 * FIT_RATIO)))
}

#[cfg(test)]
mod tests {
    use super::fitted_size;

    #[test]
    fn keeps_window_that_fits() {
        assert_eq!(fitted_size((1400.0, 970.0), (1920.0, 1040.0)), None);
    }

    #[test]
    fn shrinks_window_on_small_screen() {
        // 1366x768 屏幕 125% 缩放后可用区域约 1093x590
        let (width, height) = fitted_size((1400.0, 1001.0), (1093.0, 590.0)).unwrap();
        assert!(width <= 1093.0 && height <= 590.0);
    }

    #[test]
    fn shrinks_only_overflowing_side() {
        assert_eq!(fitted_size((1000.0, 970.0), (1536.0, 824.0)), Some((1000.0, 824.0 * 0.94)));
    }
}
