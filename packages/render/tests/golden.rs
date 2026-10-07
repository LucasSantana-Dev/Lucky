//! Golden SVG snapshots. `UPDATE_GOLDEN=1 cargo test` rewrites them.

use std::path::{Path, PathBuf};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests")
}

pub fn check(path: &Path, actual: &str) {
    if std::env::var_os("UPDATE_GOLDEN").is_some() {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, actual).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(path)
        .unwrap_or_else(|_| panic!("missing {}: run UPDATE_GOLDEN=1 cargo test", path.display()));
    assert!(
        expected == actual,
        "{} is stale: run UPDATE_GOLDEN=1 cargo test and review the diff",
        path.display()
    );
}

fn golden(name: &str) {
    let json = std::fs::read_to_string(root().join("fixtures").join(format!("{name}.json")))
        .expect("fixture");
    let payload: lucky_render::RecapPayload = serde_json::from_str(&json).expect("payload");
    let (svg, dropped) = lucky_render::build_svg_counted(&payload);
    assert_eq!(dropped, 0, "golden fixtures use valid covers only");
    check(&root().join("golden").join(format!("{name}.svg")), &svg);
}

#[test]
fn grid_1() {
    golden("grid1");
}

#[test]
fn grid_2x2() {
    golden("grid2x2");
}

#[test]
fn grid_3x3() {
    golden("grid3x3");
}

#[test]
fn grid_5x5() {
    golden("grid5x5");
}

#[test]
fn rtl_cjk_emoji_and_escaping() {
    golden("rtl_cjk");
}
