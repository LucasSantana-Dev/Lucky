//! The checked-in JSON Schema must match the payload types.
//! `UPDATE_GOLDEN=1 cargo test` rewrites `schema/recap.schema.json`.

#[test]
fn checked_in_schema_is_current() {
    let schema = schemars::schema_for!(lucky_render::RecapPayload);
    let mut actual = serde_json::to_string_pretty(&schema).unwrap();
    actual.push('\n');
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("schema/recap.schema.json");
    if std::env::var("UPDATE_GOLDEN").as_deref() == Ok("1") {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, &actual).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(&path)
        .unwrap_or_else(|_| panic!("missing {}: run UPDATE_GOLDEN=1 cargo test", path.display()));
    assert!(
        expected == actual,
        "{} is stale: run UPDATE_GOLDEN=1 cargo test and commit it",
        path.display()
    );
}
