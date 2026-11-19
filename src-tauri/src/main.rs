//! Bahnhofsmanager als Desktop-App (RM-FR-PLAT-02, RM-FR-SEC-02).
//! Das Spiel selbst ist die Web-Version aus `dist/`; hier kommen nur dazu:
//! - Spielstand-Datei im App-Ordner (Steam Auto-Cloud gleicht sie ab, RM-FR-STEAM-03)
//! - Steam-Erfolge und Rich Presence (nur mit `--features steam`, RM-FR-STEAM-04/05)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod steam;

use std::{fs, path::PathBuf};
use tauri::Manager;

/// größer wird eine Spielstand-Datei nie (Schutz vor Unsinn)
const MAX_STORE: usize = 64 * 1024 * 1024;

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("saves");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("spielstaende.json"))
}

/// Spielstand-Datei lesen (fehlt sie, kommt `None`)
#[tauri::command]
fn store_read(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match fs::read_to_string(store_path(&app)?) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Spielstand-Datei schreiben: erst prüfen, dann über eine Zwischendatei ersetzen (nie halb geschrieben)
#[tauri::command]
fn store_write(app: tauri::AppHandle, data: String) -> Result<(), String> {
    if data.len() > MAX_STORE {
        return Err("Spielstand zu groß".into());
    }
    serde_json::from_str::<serde_json::Value>(&data).map_err(|e| e.to_string())?;
    let path = store_path(&app)?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            steam::init(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            store_read,
            store_write,
            steam::steam_unlock,
            steam::steam_presence
        ])
        .run(tauri::generate_context!())
        .expect("Bahnhofsmanager konnte nicht starten");
}
