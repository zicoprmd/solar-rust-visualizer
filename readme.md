# ☀️ Solar Rust Visualizer

Aplikasi web interaktif untuk simulasi skema sistem panel surya (off-grid) menggunakan **Rust (WebAssembly)** untuk logika perhitungan efisiensi dan **JavaScript** untuk visualisasi antarmuka.

## 🚀 Fitur Utama
- **Real-time Engineering Logic**: Perhitungan daya (kW) dan kapasitas baterai (Wh) diproses secara instan oleh mesin Rust.
- **Drag & Drop Interface**: Komponen dapat digeser untuk mengatur tata letak skema.
- **Circuit Connectivity**: Sistem hanya akan menghitung daya jika komponen terhubung secara logis (memerlukan Inverter untuk output AC).
- **Interactive Wires**: Visualisasi kabel dinamis menggunakan SVG yang mengikuti pergerakan komponen.

## 🛠️ Prasyarat (Requirements)
Sebelum menjalankan, pastikan perangkat Anda (ThinkPad/Windows) sudah terinstal:
1. **Rust & Cargo**: [rustup.rs](https://rustup.rs/)
2. **wasm-pack**: `cargo install wasm-pack`
3. **Local Server**: Node.js (untuk `serve`) atau Python.

## 📦 Cara Instalasi & Build

1. **Clone repositori ini:**
   ```bash
   git clone <url-repo-anda>
   cd solar_core
Kompilasi Rust ke WebAssembly:
Jalankan perintah ini di terminal untuk membuat folder pkg/:

PowerShell
wasm-pack build --target web
Jalankan Aplikasi:
Karena menggunakan WebAssembly, aplikasi harus dijalankan melalui server lokal.

Opsi A (VS Code): Klik kanan index.html -> Open with Live Server.
Opsi B (Python): python -m http.server 8000
Opsi C (Node.js): npx serve .

🕹️ Cara Menggunakan
Tambah Komponen: Klik tombol di sidebar untuk memunculkan Panel, Inverter, atau Baterai.

Geser Komponen: Klik dan tahan (drag) kotak untuk mengatur posisi agar tidak bertumpukan.

Pasang Kabel:

Klik sekali pada komponen pertama (akan muncul highlight kuning).

Klik sekali pada komponen kedua.

Garis kuning (arus listrik) akan muncul menghubungkan keduanya.

Baca Output:

Dashboard akan menampilkan daya dalam kW.

Ingat: Anda membutuhkan Inverter yang terhubung agar sistem menghasilkan output AC.

🏗️ Struktur Proyek
src/lib.rs: Logika inti perhitungan elektrikal (Rust).

index.html: Struktur UI dan area kanvas SVG.

main.js: Logika interaksi (drag, click, wire drawing) dan jembatan ke Rust.

pkg/: Hasil kompilasi WebAssembly (auto-generated).

Dibuat dengan ❤️ menggunakan Rust untuk simulasi Engineering.