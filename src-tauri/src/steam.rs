//! Steam-Anbindung (RM-FR-STEAM-04/05). Ohne `--features steam` tun die Befehle nichts.

#[cfg(feature = "steam")]
mod imp {
    use std::{thread, time::Duration};
    use tauri::{App, Manager, State};

    /// Steam-App-ID – 480 ist Valves Test-App „Spacewar“; vor dem Release durch die eigene ersetzen
    pub const APP_ID: u32 = 480;

    pub struct Steam(pub Option<steamworks::Client>);

    pub fn init(app: &mut App) {
        let client = match steamworks::Client::init_app(APP_ID) {
            Ok(client) => {
                // Rückmeldungen von Steam regelmäßig abholen
                let c = client.clone();
                thread::spawn(move || loop {
                    c.run_callbacks();
                    thread::sleep(Duration::from_millis(100));
                });
                Some(client)
            }
            Err(e) => {
                eprintln!("Steam nicht verfügbar: {e}");
                None
            }
        };
        app.manage(Steam(client));
    }

    /// Erfolg freischalten; der API-Name in Steamworks ist die Erfolgs-ID aus dem Spiel
    #[tauri::command]
    pub fn steam_unlock(steam: State<'_, Steam>, id: String) -> bool {
        let Some(c) = &steam.0 else { return false };
        let stats = c.user_stats();
        stats.achievement(&id).set().is_ok() && stats.store_stats().is_ok()
    }

    /// Rich Presence: Text, den Freunde sehen
    #[tauri::command]
    pub fn steam_presence(steam: State<'_, Steam>, text: String) -> bool {
        let Some(c) = &steam.0 else { return false };
        let text: String = text.chars().take(200).collect();
        c.friends().set_rich_presence("steam_display", Some(&text))
    }
}

#[cfg(not(feature = "steam"))]
mod imp {
    use tauri::App;

    pub fn init(_app: &mut App) {}

    #[tauri::command]
    pub fn steam_unlock(id: String) -> bool {
        let _ = id;
        false
    }

    #[tauri::command]
    pub fn steam_presence(text: String) -> bool {
        let _ = text;
        false
    }
}

pub use imp::*;
