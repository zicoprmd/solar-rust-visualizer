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

#[derive(serde::Serialize)]
pub struct SavingsResult {
    daily_kwh: f64,
    monthly_kwh: f64,
    yearly_kwh: f64,
    daily_rupiah: f64,
    monthly_rupiah: f64,
    yearly_rupiah: f64,
    daily_co2_kg: f64,
    monthly_co2_kg: f64,
    yearly_co2_kg: f64,
}

#[wasm_bindgen]
pub fn calculate_savings(ac_output_kw: f64, rate_per_kwh: f64) -> JsValue {
    // Asumsi rata-rata jam sinar matahari efektif di Indonesia: 4.5 jam/hari
    let daily_hours = 4.5;

    // Faktor emisi CO2 Indonesia: ~0.84 kg CO2 per kWh (PLN mix)
    let co2_factor = 0.84;

    let daily_kwh = ac_output_kw * daily_hours;
    let monthly_kwh = daily_kwh * 30.0;
    let yearly_kwh = daily_kwh * 365.0;

    let daily_rupiah = daily_kwh * rate_per_kwh;
    let monthly_rupiah = monthly_kwh * rate_per_kwh;
    let yearly_rupiah = yearly_kwh * rate_per_kwh;

    let daily_co2_kg = daily_kwh * co2_factor;
    let monthly_co2_kg = monthly_kwh * co2_factor;
    let yearly_co2_kg = yearly_kwh * co2_factor;

    serde_wasm_bindgen::to_value(&SavingsResult {
        daily_kwh,
        monthly_kwh,
        yearly_kwh,
        daily_rupiah,
        monthly_rupiah,
        yearly_rupiah,
        daily_co2_kg,
        monthly_co2_kg,
        yearly_co2_kg,
    }).unwrap()
}

#[derive(serde::Serialize)]
pub struct EfficiencyResult {
    panel_output: f64,      // DC dari panel (W)
    wiring_loss: f64,      // Loss di kabel (W)
    after_wiring: f64,     // Setelah kabel
    charge_loss: f64,      // Loss di charge controller (W)
    after_charge: f64,     // Setelah charge controller
    inverter_loss: f64,    // Loss di inverter (W)
    after_inverter: f64,   // AC output (W)
    battery_loss: f64,     // Loss di baterai (W)
    after_battery: f64,    // Setelah baterai (available)
    total_loss: f64,       // Total loss (W)
    overall_efficiency: f64, // Persentase efisiensi total
    wiring_eff: f64,       // Efisiensi kabel (%)
    charge_eff: f64,       // Efisiensi charge controller (%)
    inverter_eff: f64,     // Efisiensi inverter (%)
    battery_eff: f64,      // Efisiensi baterai (%)
}

#[wasm_bindgen]
pub fn calculate_efficiency(panel_watt: f64, has_battery: bool) -> JsValue {
    // Efisiensi tipikal komponen surya
    let wiring_eff = 0.98;        // 2% loss di kabel
    let charge_eff = 0.95;        // 5% loss di charge controller/MPPT
    let inverter_eff = 0.96;      // 4% loss di inverter
    let battery_eff = 0.90;       // 10% loss charge/discharge baterai

    let wiring_loss = panel_watt * (1.0 - wiring_eff);
    let after_wiring = panel_watt - wiring_loss;

    let charge_loss = after_wiring * (1.0 - charge_eff);
    let after_charge = after_wiring - charge_loss;

    let inverter_loss = after_charge * (1.0 - inverter_eff);
    let after_inverter = after_charge - inverter_loss;

    let (battery_loss, after_battery) = if has_battery {
        let loss = after_inverter * (1.0 - battery_eff);
        (loss, after_inverter - loss)
    } else {
        (0.0, after_inverter)
    };

    let total_loss = wiring_loss + charge_loss + inverter_loss + battery_loss;
    let overall_efficiency = if panel_watt > 0.0 {
        (after_battery / panel_watt) * 100.0
    } else {
        0.0
    };

    serde_wasm_bindgen::to_value(&EfficiencyResult {
        panel_output: panel_watt,
        wiring_loss,
        after_wiring,
        charge_loss,
        after_charge,
        inverter_loss,
        after_inverter,
        battery_loss,
        after_battery,
        total_loss,
        overall_efficiency,
        wiring_eff: wiring_eff * 100.0,
        charge_eff: charge_eff * 100.0,
        inverter_eff: inverter_eff * 100.0,
        battery_eff: battery_eff * 100.0,
    }).unwrap()
}