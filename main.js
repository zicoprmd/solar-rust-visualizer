import init, { calculate_solar_power, calculate_savings, calculate_efficiency } from "./pkg/solar_core.js";

let components = [];
let connections = [];
let selectedId = null;
let editingId = null; // komonen yang sedang di-edit
let draggingItem = null;
let offset = { x: 0, y: 0 };
let chartMode = 'daily';
let particles = [];
let animationId = null;

// ── Simulation State ──────────────────────────────────────────────────────────
let simHour = 6;
let simMinute = 0;
let simRunning = false;
let simSpeed = 10;
let simInterval = null;
let batteryCharge = 0;
let totalStorage = 0;

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

window.setChartMode = (mode, e) => {
    chartMode = mode;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (e && e.target) {
        e.target.classList.add('active');
    } else {
        document.getElementById(mode === 'daily' ? 'tab-daily' : 'tab-weekly').classList.add('active');
    }
    drawChart();
};

async function start() {
    try {
        await init();
        bindEvents();
        render();
        drawChart();
        updateSimUI();
    } catch(e) {
        console.error('start() error:', e);
    }
}

function bindEvents() {
    // Menu toggle - no need for event listeners anymore since using onclick

    // Chart tabs
    document.getElementById('tab-daily').addEventListener('click', (e) => window.setChartMode('daily', e));
    document.getElementById('tab-weekly').addEventListener('click', (e) => window.setChartMode('weekly', e));

    // Rate input
    document.getElementById('rate').addEventListener('change', () => {
        const result = calculate_solar_power({ components, connections });
        updateSavings(result.ac_output);
    });

    // Simulation controls
    document.getElementById('sim-btn').addEventListener('click', window.toggleSim);
    document.getElementById('sim-reset').addEventListener('click', window.resetSim);
    document.getElementById('sim-speed').addEventListener('input', (e) => window.onSimSpeedChange(e.target.value));

    // Edit modal buttons
    document.getElementById('modal-save').addEventListener('click', window.saveEdit);
    document.getElementById('modal-delete').addEventListener('click', window.deleteEdit);
    document.getElementById('modal-cancel').addEventListener('click', window.closeEdit);

    // Close modal on backdrop click
    document.getElementById('edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-modal') window.closeEdit();
    });
}

window.addComponent = (kind, value) => {
    console.log('addComponent called:', kind, value);
    const id = `comp_${Date.now()}`;
    components.push({ id, kind, value, x: 20 + (components.length * 10), y: 50 });
    console.log('components now:', components.length);
    render();
};

// Toggle submenu
window.toggleMenu = (id) => {
    const menu = document.getElementById(id);
    const arrow = document.getElementById('arrow-' + id);
    if (menu.style.display === 'none') {
        menu.style.display = 'block';
        if (arrow) arrow.textContent = '▲';
    } else {
        menu.style.display = 'none';
        if (arrow) arrow.textContent = '▼';
    }
};

// Add MPPT Controller (store voltage and amp rating)
window.addMppt = (voltage, amps) => {
    const id = `comp_${Date.now()}`;
    // Max watt = voltage * amps, efficiency ~95%
    const maxWatt = voltage * amps;
    components.push({
        id,
        kind: 'mppt',
        voltage: voltage,
        amps: amps,
        value: maxWatt,
        eff: 0.95,
        x: 20 + (components.length * 10),
        y: 50
    });
    render();
};

// Add Inverter (off-grid or hybrid)
window.addInverter = (invType, voltage, watt) => {
    const id = `comp_${Date.now()}`;
    // Store voltage and watt directly, efficiency varies by type
    const eff = invType === 'hybrid' ? 0.96 : 0.90;
    components.push({
        id,
        kind: 'inverter',
        invType: invType, // 'offgrid' or 'hybrid'
        voltage: voltage,
        watt: watt,
        value: watt / 1000, // store as kW for Rust calc
        eff: eff,
        x: 20 + (components.length * 10),
        y: 50
    });
    render();
};

// Add Battery with voltage and capacity
window.addBattery = (voltage, ah) => {
    const id = `comp_${Date.now()}`;
    // Wh = voltage * ampHour
    const wh = voltage * ah;
    components.push({
        id,
        kind: 'battery',
        voltage: voltage,
        ah: ah,
        value: wh,
        x: 20 + (components.length * 10),
        y: 50
    });
    render();
};

// Add Load
window.addLoad = (watt) => {
    const id = `comp_${Date.now()}`;
    components.push({
        id,
        kind: 'load',
        value: watt,
        x: 20 + (components.length * 10),
        y: 50
    });
    render();
};

window.addCustomLoad = () => {
    const watt = prompt("Masukkan daya beban (Watt):", "500");
    if (watt && !isNaN(watt) && parseInt(watt) > 0) {
        addComponent('load', parseInt(watt));
    }
};

function render() {
    console.log('render() called, components:', components.length);
    const compLayer = document.getElementById("components-layer");
    compLayer.innerHTML = "";

    // 1. Gambar Kabel (Canvas) - wireLayer is now a canvas
    drawWires();

    // 2. Gambar Komponen
    components.forEach(comp => {
        const div = document.createElement("div");
        div.className = `component ${selectedId === comp.id ? 'selected' : ''}`;
        div.style.left = comp.x + "px";
        div.style.top = comp.y + "px";

        let icon, sublabel, kindLabel;
        switch(comp.kind) {
            case 'panel':
                icon = "☀️";
                kindLabel = "PANEL";
                sublabel = `${comp.value}W`;
                break;
            case 'mppt':
                icon = "⚡";
                kindLabel = "MPPT";
                sublabel = `${comp.voltage}V ${comp.amps}A`;
                break;
            case 'inverter':
                icon = comp.invType === 'hybrid' ? "🔄" : "🔌";
                kindLabel = comp.invType === 'hybrid' ? "HYBRID" : "OFF-GRID";
                sublabel = `${comp.voltage}V ${comp.watt}W`;
                break;
            case 'battery':
                icon = "🔋";
                kindLabel = "BATTERY";
                sublabel = `${comp.voltage}V ${comp.ah}Ah`;
                break;
            case 'load':
                icon = "🏠";
                kindLabel = "LOAD";
                sublabel = `${comp.value}W`;
                break;
            default:
                icon = "❓";
                kindLabel = comp.kind.toUpperCase();
                sublabel = `${comp.value}`;
        }
        div.innerHTML = `<div style="font-size:20px;">${icon}</div><div style="font-size:10px;font-weight:bold;">${kindLabel}</div><div style="font-size:9px;color:#7f8c8d;">${sublabel}</div><div style="font-size:8px;color:#bdc3c7;margin-top:3px;">dblclick=edit</div>`;

        div.onmousedown = (e) => {
            e.preventDefault();
            draggingItem = comp;
            offset.x = e.clientX - comp.x;
            offset.y = e.clientY - comp.y;
        };

        div.ondblclick = (e) => {
            e.stopPropagation();
            openEditModal(comp.id);
        };

        div.onclick = (e) => {
            e.stopPropagation();
            handleSelect(comp.id);
        };

        compLayer.appendChild(div);
    });

    // 3. Panggil Rust
    const result = calculate_solar_power({ components, connections });
    const display = document.getElementById("power-display");

    if (display) {
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

        updateSavings(result.ac_output);
        updateEfficiency();
        updateSimStatsFromResult(result.ac_output);
        updateLoadSection(result.ac_output);
        drawChart();
        startParticleAnimation(result.ac_output);
    }
}

function updateSimStatsFromResult(acOutputKw) {
    const solarFactor = getSolarFactor(simHour);
    const peakWatt = acOutputKw * 1000;
    const solarProduction = peakWatt * solarFactor;
    const totalLoad = components.filter(c => c.kind === 'load').reduce((s, c) => s + c.value, 0);
    updateSimStats(solarProduction, totalLoad);
    updateSimUI();
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

function updateLoadSection(acOutputKw) {
    const loads = components.filter(c => c.kind === 'load');
    const loadItems = document.getElementById('load-items');
    const totalLoadEl = document.getElementById('total-load');
    const loadBalance = document.getElementById('load-balance');

    // Render list beban
    if (loadItems) {
        if (loads.length === 0) {
            loadItems.innerHTML = '<div style="font-size:11px;color:#bdc3c7;text-align:center;padding:10px 0;">Belum ada beban</div>';
        } else {
            loadItems.innerHTML = loads.map(c => `
                <div class="load-item">
                    <span>🏠 ${c.value}W</span>
                    <div>
                        <button onclick="openEditModal('${c.id}')" style="background:none;border:none;color:#3498db;cursor:pointer;font-size:10px;margin-right:5px;" title="Edit">✎</button>
                        <button onclick="removeLoad('${c.id}')" style="background:none;border:none;color:#e74c3c;cursor:pointer;font-size:10px;" title="Hapus">✕</button>
                    </div>
                </div>
            `).join('');
        }
    }

    // Total
    const totalLoad = loads.reduce((sum, c) => sum + c.value, 0);
    if (totalLoadEl) {
        totalLoadEl.textContent = totalLoad + ' W';
    }

    // Balance
    const productionW = acOutputKw * 1000;
    const balance = productionW - totalLoad;
    if (loadBalance) {
        if (balance > 0) {
            loadBalance.innerHTML = `<span style="color:#2ecc71;">⚡ Surplus: ${balance.toFixed(0)}W</span>`;
        } else if (balance < 0) {
            loadBalance.innerHTML = `<span style="color:#e74c3c;">⚠️ Deficit: ${Math.abs(balance).toFixed(0)}W</span>`;
        } else {
            loadBalance.innerHTML = '<span style="color:#f1c40f;">⚖️ Seimbang</span>';
        }
    }
}

window.removeLoad = (id) => {
    components = components.filter(c => c.id !== id);
    connections = connections.filter(c => c.from_id !== id && c.to_id !== id);
    render();
};

// ── Edit Modal ─────────────────────────────────────────────────────────────
const kindLabels = { panel: '☀️ Panel Surya', inverter: '🔄 Inverter', battery: '🔋 Baterai', load: '🏠 Beban' };

window.openEditModal = (id) => {
    const comp = components.find(c => c.id === id);
    if (!comp) return;

    editingId = id;
    const modal = document.getElementById('edit-modal');
    document.getElementById('modal-title').innerHTML = kindLabels[comp.kind] || '🏠 Komponen';
    document.getElementById('modal-kind').value = comp.kind.toUpperCase();
    document.getElementById('modal-value').value = comp.kind === 'inverter' ? (comp.value * 1000).toFixed(0) : comp.value.toFixed(0);
    document.getElementById('label-wattage').textContent = comp.kind === 'battery' ? 'Kapasitas (Wh):' : comp.kind === 'load' ? 'Daya (Watt):' : 'Wattage (W):';

    modal.classList.add('open');
};

window.closeEdit = () => {
    document.getElementById('edit-modal').classList.remove('open');
    editingId = null;
};

window.saveEdit = () => {
    if (!editingId) return;
    const comp = components.find(c => c.id === editingId);
    if (!comp) return;

    const newVal = parseFloat(document.getElementById('modal-value').value) || 0;
    if (comp.kind === 'inverter') {
        comp.value = newVal / 1000; // inverter value stored as kW ratio
    } else {
        comp.value = newVal;
    }

    closeEdit();
    render();
};

window.deleteEdit = () => {
    if (!editingId) return;
    components = components.filter(c => c.id !== editingId);
    connections = connections.filter(c => c.from_id !== editingId && c.to_id !== editingId);
    closeEdit();
    render();
};

// Tutup modal saat klik di luar content
document.addEventListener('click', (e) => {
    const modal = document.getElementById('edit-modal');
    if (e.target === modal) closeEdit();
});

window.onrateChange = () => {
    const result = calculate_solar_power({ components, connections });
    updateSavings(result.ac_output);
};

function drawWires() {
    const canvas = document.getElementById("wire-layer");
    const ctx = canvas.getContext("2d");
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    connections.forEach(conn => {
        const from = components.find(c => c.id === conn.from_id);
        const to = components.find(c => c.id === conn.to_id);
        if (from && to) {
            const x1 = from.x + 50;
            const y1 = from.y + 25;
            const x2 = to.x + 50;
            const y2 = to.y + 25;

            // Draw wire glow
            ctx.strokeStyle = "#f1c40f";
            ctx.lineWidth = 6;
            ctx.lineCap = "round";
            ctx.shadowColor = "rgba(241, 196, 15, 0.5)";
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Store wire data for particles
            conn._wire = { x1, y1, x2, y2, length: Math.hypot(x2-x1, y2-y1) };
        }
    });
}

function startParticleAnimation(acOutput) {
    if (acOutput <= 0) {
        particles = [];
        if (animationId) cancelAnimationFrame(animationId);
        return;
    }

    if (!animationId) {
        animateParticles();
    }
}

function animateParticles() {
    const canvas = document.getElementById("wire-layer");
    const ctx = canvas.getContext("2d");

    // Redraw wires
    drawWires();

    // Update and draw particles
    connections.forEach(conn => {
        if (!conn._wire) return;

        const { x1, y1, x2, y2, length } = conn._wire;
        const speed = 2 + (length / 50);

        // Spawn new particles
        if (particles.length < 30 && Math.random() > 0.5) {
            particles.push({
                connId: `${conn.from_id}-${conn.to_id}`,
                progress: 0,
                speed: speed * (0.5 + Math.random() * 0.5),
                size: 3 + Math.random() * 3,
                alpha: 0.6 + Math.random() * 0.4
            });
        }

        // Draw particles for this connection
        const connParticles = particles.filter(p => p.connId === `${conn.from_id}-${conn.to_id}`);
        connParticles.forEach(p => {
            const t = p.progress;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;

            // Glow effect
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, p.size * 2);
            gradient.addColorStop(0, `rgba(255, 255, 150, ${p.alpha})`);
            gradient.addColorStop(0.5, `rgba(241, 196, 15, ${p.alpha * 0.5})`);
            gradient.addColorStop(1, "rgba(241, 196, 15, 0)");

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, p.size * 2, 0, Math.PI * 2);
            ctx.fill();

            // Core
            ctx.fillStyle = `rgba(255, 255, 200, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, p.size * 0.5, 0, Math.PI * 2);
            ctx.fill();

            p.progress += p.speed / length;
            if (p.progress >= 1) p.progress = 0;
        });
    });

    // Clean old particles
    particles = particles.filter(p => p.progress >= 0 && p.progress <= 1);

    animationId = requestAnimationFrame(animateParticles);
}

// ── Simulation ────────────────────────────────────────────────────────────────
function getSolarFactor(hour) {
    // Kurva lonceng: 0 di jam 5/19, puncak di jam 12
    if (hour < 5 || hour > 19) return 0;
    return Math.max(0, Math.sin((hour - 5) / 14 * Math.PI));
}

function getTimePhase(hour) {
    if (hour >= 5 && hour < 10) return { label: '🌅 Pagi', phase: 'dawn' };
    if (hour >= 10 && hour < 16) return { label: '☀️ Siang', phase: 'day' };
    if (hour >= 16 && hour < 18) return { label: '🌇 Sore', phase: 'dusk' };
    return { label: '🌙 Malam', phase: 'night' };
}

function updateSimUI() {
    const hourStr = String(simHour).padStart(2, '0');
    const minStr = String(simMinute).padStart(2, '0');
    document.getElementById('sim-time').textContent = `${hourStr}:${minStr}`;

    const { label, phase } = getTimePhase(simHour);
    document.getElementById('sim-phase').textContent = label;

    // Background canvas
    const canvas = document.getElementById('canvas');
    canvas.className = phase;

    // Sun/Moon indicator
    const sunEl = document.getElementById('sun-indicator');
    if (sunEl) {
        if (phase === 'night') {
            sunEl.textContent = '🌙';
            sunEl.style.color = '#f1c40f';
        } else {
            sunEl.textContent = '☀️';
            sunEl.style.color = '#f1c40f';
        }
        // Posisi arC假装 arc matahari
        const canvasEl = document.getElementById('canvas');
        const w = canvasEl.offsetWidth;
        const h = canvasEl.offsetHeight;
        const dayMinutes = 14 * 60; // 5:00 to 19:00
        const progress = phase === 'night' ? 1 :
            ((simHour - 5) * 60 + simMinute) / dayMinutes;
        const cx = w / 2;
        const cy = h - 60;
        const r = Math.min(w, h) * 0.45;
        const angle = phase === 'night' ? Math.PI : Math.PI * (1 - progress);
        const sx = cx + r * Math.cos(angle);
        const sy = cy - r * Math.sin(angle);
        sunEl.style.left = (sx - 20) + 'px';
        sunEl.style.top = (sy - 20) + 'px';
    }

    // Battery display
    const pct = totalStorage > 0 ? Math.min(100, Math.max(0, (batteryCharge / totalStorage) * 100)) : 0;
    const simBatPct = document.getElementById('sim-battery-pct');
    const simBatBar = document.getElementById('sim-battery-bar');
    if (simBatPct) simBatPct.textContent = pct.toFixed(0) + '%';
    if (simBatBar) simBatBar.style.width = pct + '%';
}

function tickSim() {
    simMinute += simSpeed;
    while (simMinute >= 60) {
        simMinute -= 60;
        simHour++;
        if (simHour >= 24) simHour = 0;
    }

    // Calculate solar production
    const result = calculate_solar_power({ components, connections });
    const solarFactor = getSolarFactor(simHour);
    const peakWatt = result.ac_output * 1000; // max AC output in watts
    const solarProduction = peakWatt * solarFactor; // current production

    // Calculate total load
    const totalLoad = components.filter(c => c.kind === 'load').reduce((s, c) => s + c.value, 0);

    // Battery logic
    const batteries = components.filter(c => c.kind === 'battery');
    totalStorage = batteries.reduce((s, c) => s + c.value, 0);

    if (totalStorage > 0) {
        const netPower = solarProduction - totalLoad; // positive = surplus, negative = deficit

        if (netPower > 0) {
            // Charge battery (90% efficiency)
            const chargeAmount = Math.min(netPower / 6, totalStorage - batteryCharge); // Wh per minute tick
            batteryCharge = Math.min(totalStorage, batteryCharge + chargeAmount * 0.95);
        } else if (netPower < 0) {
            // Discharge battery to cover deficit
            const dischargeAmount = Math.min(Math.abs(netPower) / 6, batteryCharge);
            batteryCharge = Math.max(0, batteryCharge - dischargeAmount / 0.90);
        }
    }

    updateSimUI();
    updateSimStats(solarProduction, totalLoad);
}

function updateSimStats(solarProd, totalLoad) {
    // Update load balance in load section
    const loadBalance = document.getElementById('load-balance');
    const net = solarProd - totalLoad;
    if (loadBalance) {
        if (net > 0) {
            loadBalance.innerHTML = `<span style="color:#2ecc71;">⚡ Surplus: ${net.toFixed(0)}W</span>`;
        } else if (net < 0) {
            loadBalance.innerHTML = `<span style="color:#e74c3c;">⚠️ Deficit: ${Math.abs(net).toFixed(0)}W</span>`;
        } else {
            loadBalance.innerHTML = '<span style="color:#f1c40f;">⚖️ Seimbang</span>';
        }
    }

    // Update battery section
    const batPct = totalStorage > 0 ? Math.min(100, Math.max(0, (batteryCharge / totalStorage) * 100)) : 0;
    const batWhEl = document.getElementById('battery-wh');
    const batModeEl = document.getElementById('battery-mode');
    const batPctEl = document.getElementById('battery-percent');
    const batBarEl = document.getElementById('battery-bar');
    if (batPctEl) batPctEl.textContent = batPct.toFixed(0) + '%';
    if (batWhEl) batWhEl.textContent = batteryCharge.toFixed(0) + ' / ' + totalStorage.toFixed(0) + ' Wh';
    if (batBarEl) batBarEl.style.width = batPct + '%';
    if (batModeEl) {
        const { label } = getTimePhase(simHour);
        if (batteryCharge >= totalStorage * 0.98) batModeEl.textContent = '🔋 Penuh';
        else if (net > 0) batModeEl.textContent = '⚡ Charging';
        else if (net < 0) batModeEl.textContent = '🔽 Discharging';
        else batModeEl.textContent = label;
    }
}

window.toggleSim = () => {
    if (simRunning) {
        clearInterval(simInterval);
        simInterval = null;
        simRunning = false;
        document.getElementById('sim-btn').textContent = '▶ Mulai';
        document.getElementById('sim-btn').className = 'btn-play';
    } else {
        simRunning = true;
        document.getElementById('sim-btn').textContent = '⏸ Pause';
        document.getElementById('sim-btn').className = 'btn-pause';
        simInterval = setInterval(tickSim, 1000);
    }
};

window.resetSim = () => {
    if (simRunning) toggleSim();
    simHour = 6;
    simMinute = 0;
    batteryCharge = 0;
    updateSimUI();
};

window.onSimSpeedChange = (val) => {
    simSpeed = parseInt(val);
    document.getElementById('sim-speed-label').textContent = val + 'x';
    if (simRunning) {
        clearInterval(simInterval);
        simInterval = setInterval(tickSim, 1000);
    }
};

start();