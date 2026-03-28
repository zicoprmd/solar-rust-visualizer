use wasm_bindgen::prelude::*;
use serde::Deserialize;
// Serialize dihapus karena memang belum terpakai (menghilangkan warning)

#[derive(Deserialize)]
pub struct SolarComponent {
    pub id: String,
    pub kind: String,
    pub value: f64,
}

#[derive(Deserialize)]
pub struct Connection {
    pub from_id: String,
    pub to_id: String,
}

#[derive(Deserialize)]
pub struct SceneData {
    pub components: Vec<SolarComponent>,
    pub connections: Vec<Connection>,
}

#[wasm_bindgen]
pub fn calculate_solar_power(js_data: JsValue) -> JsValue {
    let scene: SceneData = match serde_wasm_bindgen::from_value(js_data) {
        Ok(data) => data,
        Err(_) => return serde_wasm_bindgen::to_value(&0.0).unwrap(),
    };

    // 1. Cek apakah ada inverter yang terhubung ke sesuatu?
    let has_connected_inverter = scene.components.iter().any(|c| {
        c.kind == "inverter" && scene.connections.iter().any(|conn| 
            conn.from_id == c.id || conn.to_id == c.id
        )
    });

    let mut total_panel_watt = 0.0;
    let mut total_storage = 0.0;

    // 2. Hitung semua panel yang terhubung
    for comp in &scene.components {
        let is_connected = scene.connections.iter().any(|conn| {
            conn.from_id == comp.id || conn.to_id == comp.id
        });

        if is_connected {
            if comp.kind == "panel" {
                total_panel_watt += comp.value;
            } else if comp.kind == "battery" {
                total_storage += comp.value;
            }
        }
    }

    // 3. Output hanya muncul jika ada Inverter
    let ac_output = if has_connected_inverter {
        (total_panel_watt * 0.85) / 1000.0 // Anggap efisiensi 85%
    } else {
        0.0
    };

    // Kirim hasil lengkap
    #[derive(serde::Serialize)]
    struct FinalResult {
        ac_output: f64,
        storage_capacity: f64,
        message: String,
    }

    let message = if !has_connected_inverter && total_panel_watt > 0.0 {
        "⚠️ Tambahkan & hubungkan Inverter!".to_string()
    } else if total_panel_watt > 0.0 {
        "✅ Sistem Menghasilkan Listrik".to_string()
    } else {
        "Menunggu koneksi...".to_string()
    };

    serde_wasm_bindgen::to_value(&FinalResult {
        ac_output,
        storage_capacity: total_storage,
        message,
    }).unwrap()
}