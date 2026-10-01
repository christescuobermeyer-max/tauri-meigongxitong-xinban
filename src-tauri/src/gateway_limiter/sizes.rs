use super::*;

pub fn supports_generation_size(line: &str, size: &str) -> bool {
    generation_size_for_line(line, size).is_some()
}

pub fn generation_size_for_line<'a>(line: &str, size: &'a str) -> Option<Cow<'a, str>> {
    let mapped = match line {
        "line5" => match size {
            "1024x1024" => Cow::Borrowed("1:1"),
            "1536x1024" => Cow::Borrowed("3:2"),
            "1792x1024" => Cow::Borrowed("16:9"),
            "1792x768" => Cow::Borrowed("21:9"),
            other => Cow::Borrowed(other),
        },
        "line4" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "4:3" | "3:2" => Cow::Borrowed("1536x1024"),
            "2:3" => Cow::Borrowed("1024x1536"),
            "auto" => Cow::Borrowed("16:9"),
            other => Cow::Borrowed(other),
        },
        "line2" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "16:9" | "auto" | "1792x1024" => Cow::Borrowed("16:9"),
            "21:9" | "1792x768" => Cow::Borrowed("21:9"),
            "4:3" | "3:2" => Cow::Borrowed("1536x1024"),
            // line2 上游不接受 "3:4" 比例字面量，必须映射成像素值
            "2:3" | "3:4" => Cow::Borrowed("1024x1536"),
            other => Cow::Borrowed(other),
        },
        // line6 = manxiaobai。上游严格只接受固定像素值，不接受比例字面量或 1792x768。
        "line6" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "16:9" | "auto" | "1792x1024" => Cow::Borrowed("1824x1024"),
            "1792x768" | "21:9" => Cow::Borrowed("2384x1024"),
            "4:3" => Cow::Borrowed("1360x1024"),
            "3:2" => Cow::Borrowed("1536x1024"),
            "2:3" => Cow::Borrowed("1024x1536"),
            "3:4" => Cow::Borrowed("1024x1360"),
            other => Cow::Borrowed(other),
        },
        "line3" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "16:9" | "4:3" | "3:2" | "auto" => Cow::Borrowed("1536x1024"),
            "2:3" => Cow::Borrowed("1024x1536"),
            other => Cow::Borrowed(other),
        },
        "line7" => match size {
            "1:1" => Cow::Borrowed("1024x1024"),
            "21:9" | "1792x768" => Cow::Borrowed("1792x768"),
            "16:9" | "4:3" | "3:2" | "auto" => Cow::Borrowed("1536x1024"),
            "2:3" | "3:4" => Cow::Borrowed("1024x1536"),
            other => Cow::Borrowed(other),
        },
        _ => return None,
    };

    if supports_provider_size(line, mapped.as_ref()) {
        Some(mapped)
    } else {
        None
    }
}

fn supports_provider_size(line: &str, size: &str) -> bool {
    match line {
        "line5" => matches!(
            size,
            "1:1" | "16:9" | "21:9" | "4:3" | "3:4" | "3:2" | "2:3" | "1024x1536" | "auto"
        ),
        "line4" => matches!(
            size,
            "1024x1024" | "1024x1536" | "1536x1024" | "1792x1024" | "16:9" | "21:9" | "3:4"
        ),
        // line2 支持横版比例；旧客户端传来的 1792x768 在映射层转换为 21:9 后再到这里。
        "line2" => matches!(
            size,
            "1024x1024" | "1024x1536" | "1536x1024" | "16:9" | "21:9"
        ),
        "line6" => matches!(
            size,
            "1024x1024"
                | "1536x1024"
                | "1024x1536"
                | "1824x1024"
                | "1024x1824"
                | "1360x1024"
                | "1024x1360"
                | "2384x1024"
        ),
        "line3" => matches!(
            size,
            "1024x1024" | "1024x1536" | "1536x1024" | "21:9" | "3:4"
        ),
        "line7" => matches!(size, "1024x1024" | "1024x1536" | "1536x1024" | "1792x768"),
        _ => false,
    }
}
