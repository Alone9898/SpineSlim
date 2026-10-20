use serde_json::{json, Value};
use std::time::Duration;

const RELEASES_API: &str = "https://api.github.com/repos/Alone9898/SpineSlim/releases?per_page=10";

type Parsed = (Vec<u64>, Vec<String>);

fn parse_version(text: &str) -> Option<Parsed> {
    let text = text.trim().trim_start_matches('v');
    let (core, pre) = match text.split_once('-') {
        Some((core, pre)) => (core, pre),
        None => (text, ""),
    };
    let core = core
        .split('.')
        .map(|part| part.parse::<u64>().ok())
        .collect::<Option<Vec<_>>>()?;
    if core.is_empty() {
        return None;
    }
    let pre = if pre.is_empty() {
        Vec::new()
    } else {
        pre.split('.').map(str::to_owned).collect()
    };
    Some((core, pre))
}

fn compare_pre(left: &[String], right: &[String]) -> std::cmp::Ordering {
    use std::cmp::Ordering::*;
    // 正式版排在同号预发布版之后
    match (left.is_empty(), right.is_empty()) {
        (true, true) => return Equal,
        (true, false) => return Greater,
        (false, true) => return Less,
        _ => {}
    }
    for (a, b) in left.iter().zip(right) {
        let order = match (a.parse::<u64>(), b.parse::<u64>()) {
            (Ok(a), Ok(b)) => a.cmp(&b),
            (Ok(_), Err(_)) => Less,
            (Err(_), Ok(_)) => Greater,
            _ => a.cmp(b),
        };
        if order != Equal {
            return order;
        }
    }
    left.len().cmp(&right.len())
}

pub fn is_newer(latest: &str, current: &str) -> bool {
    let (Some((mut a, pa)), Some((mut b, pb))) = (parse_version(latest), parse_version(current))
    else {
        return false;
    };
    let width = a.len().max(b.len());
    a.resize(width, 0);
    b.resize(width, 0);
    a.cmp(&b).then_with(|| compare_pre(&pa, &pb)) == std::cmp::Ordering::Greater
}

fn fetch_releases() -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .build();
    agent
        .get(RELEASES_API)
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "SpineSlim-update-check")
        .call()
        .map_err(|error| error.to_string())?
        .into_json()
        .map_err(|error| error.to_string())
}

fn newest_installable_release<'a>(releases: &'a Value, current: &str) -> Option<&'a Value> {
    releases
        .as_array()?
        .iter()
        .filter(|item| {
            item["draft"] != true
                && item["html_url"].as_str().is_some()
                && item["assets"].as_array().is_some_and(|assets| {
                    assets.iter().any(|asset| {
                        asset["name"]
                            .as_str()
                            .is_some_and(|name| name.to_ascii_lowercase().ends_with(".exe"))
                    })
                })
                && is_newer(item["tag_name"].as_str().unwrap_or(""), current)
        })
        .reduce(|newest, item| {
            if is_newer(
                item["tag_name"].as_str().unwrap_or(""),
                newest["tag_name"].as_str().unwrap_or(""),
            ) {
                item
            } else {
                newest
            }
        })
}

/// 有新版本时返回 {tag, url, notes}，否则返回 null；预发布版本也参与比较
#[tauri::command]
pub async fn check_update(current: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let releases = fetch_releases()?;
        let latest = newest_installable_release(&releases, &current);
        Ok(match latest {
            Some(item) => json!({
                "tag": item["tag_name"],
                "url": item["html_url"],
                "notes": item["body"],
            }),
            _ => Value::Null,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{is_newer, newest_installable_release};
    use serde_json::json;

    #[test]
    fn compares_versions() {
        assert!(is_newer("v2.0.0-alpha.3", "2.0.0-alpha.2"));
        assert!(is_newer("2.0.0", "2.0.0-alpha.9"));
        assert!(is_newer("v2.0.1", "2.0.0"));
        assert!(is_newer("2.0.0-alpha.10", "2.0.0-alpha.9"));
        assert!(!is_newer("2.0.0-alpha.2", "2.0.0-alpha.2"));
        assert!(!is_newer("2.0.0-alpha.1", "2.0.0-alpha.2"));
        assert!(!is_newer("2.0", "2.0.0"));
        assert!(!is_newer("garbage", "2.0.0"));
    }

    #[test]
    fn selects_newest_release_with_windows_installer() {
        let releases = json!([
            {"tag_name": "v2.0.1", "draft": false, "html_url": "https://github.com/older", "assets": [{"name": "setup.exe"}]},
            {"tag_name": "v2.0.3", "draft": false, "html_url": "https://github.com/source-only", "assets": []},
            {"tag_name": "v2.0.2", "draft": false, "html_url": "https://github.com/newer", "assets": [{"name": "setup.EXE"}]},
            {"tag_name": "v2.0.4", "draft": true, "html_url": "https://github.com/draft", "assets": [{"name": "setup.exe"}]}
        ]);
        let release = newest_installable_release(&releases, "2.0.0").unwrap();
        assert_eq!(release["tag_name"], "v2.0.2");
        assert!(newest_installable_release(&releases, "2.0.2").is_none());
    }
}
