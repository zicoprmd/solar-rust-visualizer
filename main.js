import init, { calculate_solar_power, calculate_savings, calculate_efficiency } from "./pkg/solar_core.js";

let components = [];
let connections = [];
let selectedId = null;
let draggingItem = null;
let offset = { x: 0, y: 0 };
let chartMode = 'daily';
let chartData = [];

function generateChartData(acOutputKw) {
    const data = [];
    let labels = [];
    let points = 24;

    if (chartMode === 'daily') {
        // 24 jam, dengan kurva lonceng (matahari terbit & terbenam)
        labels = Array.from({length: 24}, (_, i) => `${i}:00`);
        for (let i = 0; i < 24; i++) {
            // Kurva lonceng: puncak di jam 12, 0 di malam hari
            let factor = Math.max(0, Math.sin((i - 6) / 12 * Math.PI));
            data.push(acOutputKw * factor);
        }
    } else {
        // 7 hari, dengan variasi cuaca sederhana
        labels = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
        const weatherFactors = [0.9, 0.7, 0.85, 0.6, 0.95, 0.8, 0.75];
        for (let i = 0; i < 7; i++) {
            data.push(acOutputKw * 4.5 * weatherFactors[i]);
        }
    }

    return { labels, data };
}

function drawChart() {
    const canvas = document.getElementById('production-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 10, right: 10, bottom: 20, left: 35 };

    const result = calculate_solar_power({ components, connections });
    const chartInfo = generateChartData(result.ac_output);
    const data = chartInfo.data;
    const labels = chartInfo.labels;

    // Clear canvas
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(0, 0, width, height);

    // Calculate bounds
    const maxVal = Math.max(...data, 0.1);
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Y-axis labels
        ctx.fillStyle = '#bdc3c7';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'right';
        const labelVal = (maxVal * (4 - i) / 4).toFixed(1);
        ctx.fillText(labelVal, padding.left - 3, y + 3);
    }

    // Draw line
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((val, i) => {
        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw fill under line
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = 'rgba(241, 196, 15, 0.2)';
    ctx.fill();

    // Draw dots
    ctx.fillStyle = '#f39c12';
    data.forEach((val, i) => {
        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    // X-axis labels (show every few labels to avoid crowding)
    ctx.fillStyle = '#bdc3c7';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    const step = chartMode === 'daily' ? 6 : 1;
    labels.forEach((label, i) => {
        if (i % step === 0 || i === labels.length - 1) {
            const x = padding.left + (i / (labels.length - 1)) * chartWidth;
            ctx.fillText(label, x, height - 5);
        }
    });
}

function setChartMode(mode) {
    chartMode = mode;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    drawChart();
}

async function start() {
    await init();
    render();
    drawChart();
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
    // Di dalam function render() di main.js:

    const result = calculate_solar_power({ components, connections });
    const display = document.getElementById("power-display");

    if (display) {
        // Tentukan warna berdasarkan status pesan
        const statusColor = result.message.includes("⚠️") ? "#e67e22" :
                            result.message.includes("✅") ? "#2ecc71" : "#95a5a6";

        display.innerHTML = `
            <div style="font-size: 1.8em; font-weight: bold; color: #2ecc71;">
                ${result.ac_output.toFixed(2)} kW
            </div>
            <div style="margin: 5px 0; color: #7f8c8d;">
                📦 Kapasitas: ${result.storage_capacity} Wh
            </div>
            <div style="
                margin-top: 10px;
                padding: 8px;
                border-radius: 5px;
                background: rgba(0,0,0,0.05);
                color: ${statusColor};
                font-size: 0.9em;
                font-weight: bold;
            ">
                ${result.message}
            </div>
        `;

        // Update savings calculator
        updateSavings(result.ac_output);
        updateEfficiency();
        drawChart();
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

function formatRupiah(num) {
    return "Rp " + num.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function updateSavings(acOutputKw) {
    const rateInput = document.getElementById("rate");
    const rate = parseFloat(rateInput.value) || 1500;

    const savings = calculate_savings(acOutputKw, rate);

    document.getElementById("daily-kwh").textContent = savings.daily_kwh.toFixed(2) + " kWh";
    document.getElementById("monthly-kwh").textContent = savings.monthly_kwh.toFixed(2) + " kWh";
    document.getElementById("yearly-kwh").textContent = savings.yearly_kwh.toFixed(2) + " kWh";

    document.getElementById("daily-rupiah").textContent = formatRupiah(savings.daily_rupiah);
    document.getElementById("monthly-rupiah").textContent = formatRupiah(savings.monthly_rupiah);
    document.getElementById("yearly-rupiah").textContent = formatRupiah(savings.yearly_rupiah);

    document.getElementById("daily-co2").textContent = savings.daily_co2_kg.toFixed(2) + " kg";
    document.getElementById("monthly-co2").textContent = savings.monthly_co2_kg.toFixed(2) + " kg";
    document.getElementById("yearly-co2").textContent = savings.yearly_co2_kg.toFixed(2) + " kg";
}

function updateEfficiency() {
    const result = calculate_solar_power({ components, connections });

    // Hitung total panel watt yang terhubung
    let totalPanelWatt = 0;
    let hasBattery = false;
    connections.forEach(conn => {
        const from = components.find(c => c.id === conn.from_id);
        const to = components.find(c => c.id === conn.to_id);
        [from, to].forEach(comp => {
            if (comp && comp.kind === 'panel') {
                totalPanelWatt += comp.value;
            }
            if (comp && comp.kind === 'battery') {
                hasBattery = true;
            }
        });
    });

    // Hapus duplikat
    const seen = new Set();
    components.forEach(comp => {
        if (comp.kind === 'panel' && connections.some(c => c.from_id === comp.id || c.to_id === comp.id)) {
            if (!seen.has(comp.id)) {
                seen.add(comp.id);
            }
        }
    });

    totalPanelWatt = 0;
    seen.clear();
    components.forEach(comp => {
        if (comp.kind === 'panel') {
            const isConnected = connections.some(c => c.from_id === comp.id || c.to_id === comp.id);
            if (isConnected && !seen.has(comp.id)) {
                seen.add(comp.id);
                totalPanelWatt += comp.value;
            }
        }
        if (comp.kind === 'battery') {
            const isConnected = connections.some(c => c.from_id === comp.id || c.to_id === comp.id);
            if (isConnected) hasBattery = true;
        }
    });

    const eff = calculate_efficiency(totalPanelWatt, hasBattery);

    // Update bar values
    document.getElementById("val-panel").textContent = eff.panel_output.toFixed(0) + "W";
    document.getElementById("val-wiring").textContent = "-" + eff.wiring_loss.toFixed(0) + "W";
    document.getElementById("val-charge").textContent = "-" + eff.charge_loss.toFixed(0) + "W";
    document.getElementById("val-inverter").textContent = "-" + eff.inverter_loss.toFixed(0) + "W";
    document.getElementById("val-battery").textContent = hasBattery ? "-" + eff.battery_loss.toFixed(0) + "W" : "Skip";
    document.getElementById("overall-eff").textContent = eff.overall_efficiency.toFixed(1) + "%";

    // Update bar widths (relative to panel output)
    const maxW = eff.panel_output || 1;
    document.getElementById("bar-panel").style.width = "100%";
    document.getElementById("bar-wiring").style.width = (eff.after_wiring / maxW * 100) + "%";
    document.getElementById("bar-charge").style.width = (eff.after_charge / maxW * 100) + "%";
    document.getElementById("bar-inverter").style.width = (eff.after_inverter / maxW * 100) + "%";
    document.getElementById("bar-battery").style.width = hasBattery ? (eff.after_battery / maxW * 100) + "%" : "0%";
}

window.onrateChange = () => {
    const result = calculate_solar_power({ components, connections });
    updateSavings(result.ac_output);
};

start();