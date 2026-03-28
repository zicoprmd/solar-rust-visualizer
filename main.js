import init, { calculate_solar_power } from "./pkg/solar_core.js";

let components = [];
let connections = [];
let selectedId = null;
let draggingItem = null;
let offset = { x: 0, y: 0 }; // Untuk mencegah kotak "melompat" saat diklik

async function start() {
    await init();
    render();
}

window.addComponent = (kind, value) => {
    const id = `comp_${Date.now()}`;
    // Tambah sedikit variasi posisi agar tidak menumpuk di satu titik awal
    components.push({ id, kind, value, x: 20 + (components.length * 10), y: 50 });
    render();
};

function render() {
    const compLayer = document.getElementById("components-layer");
    const wireLayer = document.getElementById("wire-layer");
    compLayer.innerHTML = "";
    wireLayer.innerHTML = "";

    // 1. Gambar Kabel (SVG)
    connections.forEach(conn => {
        const from = components.find(c => c.id === conn.from_id);
        const to = components.find(c => c.id === conn.to_id);
        if (from && to) {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", from.x + 50);
            line.setAttribute("y1", from.y + 25);
            line.setAttribute("x2", to.x + 50);
            line.setAttribute("y2", to.y + 25);
            // Cari bagian line.setAttribute("stroke", "#2c3e50") dan ganti dengan ini:
            line.setAttribute("stroke", "#f1c40f"); // Warna Kuning Solar
            line.setAttribute("stroke-width", "5");
            line.setAttribute("stroke-linecap", "round");
            line.setAttribute("style", "filter: drop-shadow(0px 0px 3px rgba(241, 196, 15, 0.8));");
            line.setAttribute("stroke-width", "4");
            wireLayer.appendChild(line);
        }
    });

    // 2. Gambar Komponen
    components.forEach(comp => {
        const div = document.createElement("div");
        div.className = `component ${selectedId === comp.id ? 'selected' : ''}`;
        div.style.left = comp.x + "px";
        div.style.top = comp.y + "px";
        
        let icon = comp.kind === 'panel' ? "☀️" : comp.kind === 'inverter' ? "🔄" : "🔋";
        div.innerText = `${icon} ${comp.kind.toUpperCase()}`;
        
        // MOUSE DOWN: Mulai Drag
        div.onmousedown = (e) => {
            e.preventDefault();
            draggingItem = comp;
            // Hitung jarak antara mouse dan pojok kiri atas kotak
            offset.x = e.clientX - comp.x;
            offset.y = e.clientY - comp.y;
        };

        // CLICK: Untuk Kabel (Hanya jika tidak sedang drag jauh)
        div.onclick = (e) => {
            handleSelect(comp.id);
        };

        compLayer.appendChild(div);
    });

    // 3. Panggil Rust
    const result = calculate_solar_power({ components, connections });
    const display = document.getElementById("power-display");
    if(display) {
        display.innerHTML = `
            <span style="font-size: 1.5em; color: #2ecc71;">${result.ac_output.toFixed(2)} kW</span><br>
            <small>Penyimpanan: ${result.storage_capacity} Wh</small>
        `;
    }
}

// GLOBAL EVENT: Untuk menggerakkan kotak di seluruh area kanvas
window.onmousemove = (e) => {
    if (draggingItem) {
        // Update posisi berdasarkan mouse minus offset
        draggingItem.x = e.clientX - offset.x;
        draggingItem.y = e.clientY - offset.y;
        render(); // Re-render agar garis kabel ikut bergerak
    }
};

window.onmouseup = () => {
    draggingItem = null;
};

function handleSelect(id) {
    if (selectedId === null) {
        selectedId = id;
    } else {
        if (selectedId !== id) {
            const exists = connections.some(c => 
                (c.from_id === selectedId && c.to_id === id) || 
                (c.from_id === id && c.to_id === selectedId)
            );
            if (!exists) {
                connections.push({ from_id: selectedId, to_id: id });
            }
        }
        selectedId = null;
    }
    render();
}

start();