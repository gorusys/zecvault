//! Tauri desktop shell: in release, load bundled frontend assets directly.

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_, _| {});
}
