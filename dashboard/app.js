// State management
let currentData = null;
let currentMode = "monthly"; // "daily", "weekly", "monthly", "state_matrix"
let currentGroup = "all";    // "all", "Peninsular Malaysia", "Sabah & Sarawak", "Sumatera", "Kalimantan", "Sulawesi", "Papua"
let currentYear = 2026;
let selectedStateId = null;
let matrixSelectedStates = []; // Array of selected state IDs for State Matrix mode
let multiStateViewMode = "combined"; // "combined" or "breakdown"
let matrixDensity = localStorage.getItem("matrix_density") || "compact"; // "compact", "dense", "standard"
let isStatePickerCollapsed = false;
let currentChart = null;

// State Matrix Filters
let matrixSelectedYears = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010];
let matrixSelectedMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// Color Grading Function according to User Specifications:
// 5.5 - 6.5 mm/day: Average / Neutral
// Below 5.5: Gets more and more red the less it gets
// Above 6.5: Gets more and more green the higher it gets
function getRainColor(val) {
    if (val === null || val === undefined || isNaN(val)) {
        return { bg: "#f1f5f9", text: "#94a3b8" };
    }
    
    // 5.5 to 6.5 is neutral
    if (val >= 5.5 && val <= 6.5) {
        return { bg: "#e2e8f0", text: "#1e293b" };
    }
    
    // Below 5.5: progressively red
    if (val < 5.5) {
        if (val >= 4.2) return { bg: "#fed7aa", text: "#7c2d12" };       // Light peach
        if (val >= 3.0) return { bg: "#fdba74", text: "#7c2d12" };       // Soft orange
        if (val >= 2.0) return { bg: "#fb923c", text: "#ffffff" };       // Orange
        if (val >= 1.0) return { bg: "#ef4444", text: "#ffffff" };       // Red
        return { bg: "#991b1b", text: "#ffffff" };                       // Deep dark red (<1.0)
    }
    
    // Above 6.5: progressively green
    if (val > 6.5) {
        if (val <= 8.0)  return { bg: "#bbf7d0", text: "#14532d" };      // Light green
        if (val <= 11.0) return { bg: "#86efac", text: "#14532d" };      // Soft green
        if (val <= 15.0) return { bg: "#4ade80", text: "#14532d" };      // Medium green
        if (val <= 20.0) return { bg: "#16a34a", text: "#ffffff" };      // Rich green
        return { bg: "#14532d", text: "#ffffff" };                       // Dark forest green (>20)
    }

    return { bg: "#e2e8f0", text: "#1e293b" };
}

// Load data
async function initDashboard() {
    try {
        if (window.RAIN_DATA) {
            currentData = window.RAIN_DATA;
        } else {
            const resp = await fetch("data_cache.json");
            currentData = await resp.json();
        }
        
        if (currentData && currentData.locations && currentData.locations.length > 0) {
            selectedStateId = currentData.locations[0].id; // default to first state (Perlis)
            if (!matrixSelectedStates || matrixSelectedStates.length === 0) {
                matrixSelectedStates = [selectedStateId];
            }
        }

        const urlParams = new URLSearchParams(window.location.search);
        let stateParam = urlParams.get("state");
        let modeParam = urlParams.get("mode");
        let viewParam = urlParams.get("view");
        let densityParam = urlParams.get("density");
        let collapseParam = urlParams.get("collapse");

        if (window.location.hash) {
            const hashParts = window.location.hash.substring(1).split("&");
            hashParts.forEach(p => {
                const [k, v] = p.split("=");
                if (k === "state" && v) stateParam = v;
                if (k === "mode" && v) modeParam = v;
                if (k === "view" && v) viewParam = v;
                if (k === "density" && v) densityParam = v;
                if (k === "collapse" && v) collapseParam = v;
                if (!v && ["monthly", "weekly", "daily", "state_matrix"].includes(k)) modeParam = k;
            });
        }

        if (densityParam && ["compact", "dense", "standard"].includes(densityParam)) {
            matrixDensity = densityParam;
        }

        if (collapseParam === "true" || collapseParam === "1") {
            isStatePickerCollapsed = true;
        }

        if (viewParam === "breakdown" || viewParam === "combined") {
            multiStateViewMode = viewParam;
        }

        if (stateParam) {
            const pLocs = stateParam.split(",").map(s => s.trim().toLowerCase());
            const matched = currentData.locations.filter(l => pLocs.includes(l.id.toLowerCase()));
            if (matched.length > 0) {
                matrixSelectedStates = matched.map(m => m.id);
                selectedStateId = matrixSelectedStates[0];
            }
        }

        renderHeaderKPIs();
        populateYearSelect();
        populateStateSelect();
        initMatrixFilters();

        if (modeParam && ["monthly", "weekly", "daily", "state_matrix"].includes(modeParam)) {
            setMode(modeParam);
        } else {
            renderTable();
        }
    } catch (e) {
        console.error("Failed to load rainfall data:", e);
        document.getElementById("table-container").innerHTML = `
            <div style="padding: 40px; text-align: center; color: #ef4444;">
                <h3>Failed to load rainfall data</h3>
                <p>Please ensure fetch_historicals.py or update_daily.py has generated data_cache.json.</p>
            </div>
        `;
    }
}

function renderHeaderKPIs() {
    if (!currentData || !currentData.kpis) return;
    const k = currentData.kpis;
    document.getElementById("kpi-date").innerText = `Latest: ${k.latest_date}`;
    document.getElementById("kpi-my-val").innerText = `${k.malaysia_avg.toFixed(1)} mm/d`;
    document.getElementById("kpi-id-val").innerText = `${k.indonesia_avg.toFixed(1)} mm/d`;
    
    if (k.driest_state && k.driest_state.name) {
        document.getElementById("kpi-dry-val").innerText = `${k.driest_state.name}`;
        document.getElementById("kpi-dry-sub").innerText = `${k.driest_state.precipitation_mm.toFixed(1)} mm • ${k.driest_state.major_group}`;
    }
    if (k.wettest_state && k.wettest_state.name) {
        document.getElementById("kpi-wet-val").innerText = `${k.wettest_state.name}`;
        document.getElementById("kpi-wet-sub").innerText = `${k.wettest_state.precipitation_mm.toFixed(1)} mm • ${k.wettest_state.major_group}`;
    }
}

function populateYearSelect() {
    const sel = document.getElementById("year-select");
    sel.innerHTML = "";
    for (let y = 2026; y >= 2010; y--) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.innerText = y;
        if (y === currentYear) opt.selected = true;
        sel.appendChild(opt);
    }
    sel.addEventListener("change", (e) => {
        currentYear = parseInt(e.target.value);
        renderTable();
    });
}

function populateStateSelect() {
    const sel = document.getElementById("state-select");
    if (!sel || !currentData) return;
    sel.innerHTML = "";

    // Group locations by Major Group
    const groups = {};
    currentData.locations.forEach(loc => {
        const g = `${loc.country} - ${loc.major_group}`;
        groups[g] = groups[g] || [];
        groups[g].push(loc);
    });

    Object.keys(groups).forEach(gName => {
        const optgroup = document.createElement("optgroup");
        optgroup.label = gName;
        groups[gName].forEach(loc => {
            const opt = document.createElement("option");
            opt.value = loc.id;
            opt.innerText = loc.name;
            if (matrixSelectedStates.includes(loc.id)) opt.selected = true;
            optgroup.appendChild(opt);
        });
        sel.appendChild(optgroup);
    });

    sel.addEventListener("change", (e) => {
        matrixSelectedStates = [e.target.value];
        selectedStateId = e.target.value;
        renderStatePills();
        renderTable();
    });
}

function setMode(mode) {
    currentMode = mode;
    document.querySelectorAll(".segmented-btn[data-mode]").forEach(b => {
        b.classList.toggle("active", b.dataset.mode === mode);
    });
    
    // Toggle controls visibility based on mode
    document.getElementById("year-select-container").style.display = (mode === "monthly") ? "flex" : "none";
    document.getElementById("region-filter-container").style.display = (mode === "state_matrix") ? "none" : "inline-flex";
    document.getElementById("state-select-container").style.display = "none";
    document.getElementById("matrix-filter-bar").style.display = (mode === "state_matrix") ? "flex" : "none";
    
    if (mode === "state_matrix") {
        renderStatePills();
    }

    renderTable();
}

function setGroup(grp) {
    currentGroup = grp;
    document.querySelectorAll(".segmented-btn[data-group]").forEach(b => {
        b.classList.toggle("active", b.dataset.group === grp);
    });
    renderTable();
}

function getFilteredLocations() {
    if (!currentData) return [];
    let locs = currentData.locations;
    if (currentGroup !== "all") {
        locs = locs.filter(l => l.major_group === currentGroup);
    }
    return locs.sort((a, b) => a.sort_order - b.sort_order);
}

function renderTable() {
    if (!currentData) return;
    const locations = getFilteredLocations();

    if (currentMode === "monthly") {
        renderMonthlyTable(locations);
    } else if (currentMode === "daily") {
        renderDailyTable(locations);
    } else if (currentMode === "weekly") {
        renderWeeklyTable(locations);
    } else if (currentMode === "state_matrix") {
        renderStateYearByMonthMatrix(selectedStateId);
    }
}

// -------------------------------------------------------------
// 1. MONTHLY VIEW
// -------------------------------------------------------------
function renderMonthlyTable(locations) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let thead = `
        <tr>
            <th>Country</th>
            <th>Region / Island</th>
            <th>State / Province</th>
    `;
    monthNames.forEach(m => {
        thead += `<th style="text-align:center;">${m}</th>`;
    });
    thead += `<th style="text-align:center;">Year Avg</th><th style="text-align:center;">Baseline</th></tr>`;

    let tbody = "";
    locations.forEach(loc => {
        const lid = loc.id;
        const locMonthly = (currentData.monthly_data[lid] && currentData.monthly_data[lid][currentYear]) || {};
        const baseline = currentData.baseline_monthly[lid] || {};

        let rowHtml = `
            <tr>
                <td><strong>${loc.country}</strong></td>
                <td><span class="group-badge">${loc.major_group}</span></td>
                <td class="col-state" onclick="viewStateInMatrix('${lid}')" title="Click to view full 2010-2026 Year x Month Matrix">${loc.name}</td>
        `;

        let yearSum = 0;
        let yearDays = 0;

        for (let m = 1; m <= 12; m++) {
            const mData = locMonthly[m];
            if (mData) {
                const avg = mData.avg_mm_day;
                yearSum += mData.total_mm;
                yearDays += mData.days;
                const c = getRainColor(avg);
                rowHtml += `
                    <td class="rain-cell">
                        <span class="rain-badge" style="background-color: ${c.bg}; color: ${c.text};" title="${mData.total_mm}mm total in ${mData.days} days">
                            ${avg.toFixed(1)}
                        </span>
                    </td>
                `;
            } else {
                rowHtml += `<td class="rain-cell"><span style="color:#cbd5e1;">-</span></td>`;
            }
        }

        const yearAvg = yearDays > 0 ? (yearSum / yearDays) : null;
        if (yearAvg !== null) {
            const yc = getRainColor(yearAvg);
            rowHtml += `
                <td class="rain-cell">
                    <span class="rain-badge" style="background-color: ${yc.bg}; color: ${yc.text}; font-weight:800;">
                        ${yearAvg.toFixed(1)}
                    </span>
                </td>
            `;
        } else {
            rowHtml += `<td class="rain-cell">-</td>`;
        }

        const baseVals = Object.values(baseline);
        const baseAvg = baseVals.length > 0 ? (baseVals.reduce((a, b) => a + b, 0) / baseVals.length) : null;
        if (baseAvg !== null) {
            const bc = getRainColor(baseAvg);
            rowHtml += `
                <td class="rain-cell">
                    <span class="rain-badge" style="background-color: ${bc.bg}; color: ${bc.text}; opacity: 0.85;">
                        ${baseAvg.toFixed(1)}
                    </span>
                </td>
            `;
        } else {
            rowHtml += `<td class="rain-cell">-</td>`;
        }

        rowHtml += `</tr>`;
        tbody += rowHtml;
    });

    document.getElementById("table-container").innerHTML = `
        <table class="rainfall-table" id="exportable-table">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
        </table>
    `;
}

// -------------------------------------------------------------
// 2. DAILY VIEW (Recent 14 Days Matrix + Averages)
// -------------------------------------------------------------
function renderDailyTable(locations) {
    const dates = currentData.recent_daily_dates.slice(-14);
    let thead = `
        <tr>
            <th>Country</th>
            <th>Region / Island</th>
            <th>State / Province</th>
    `;
    dates.forEach(d => {
        const shortDate = d.substring(5);
        thead += `<th style="text-align:center;">${shortDate}</th>`;
    });
    thead += `<th style="text-align:center;">7d Avg</th><th style="text-align:center;">14d Avg</th></tr>`;

    let tbody = "";
    locations.forEach(loc => {
        const lid = loc.id;
        const locDaily = currentData.recent_daily[lid] || {};

        let rowHtml = `
            <tr>
                <td><strong>${loc.country}</strong></td>
                <td><span class="group-badge">${loc.major_group}</span></td>
                <td class="col-state" onclick="viewStateInMatrix('${lid}')">${loc.name}</td>
        `;

        let sum14 = 0;
        let sum7 = 0;

        dates.forEach((d, idx) => {
            const val = locDaily[d] !== undefined ? locDaily[d] : null;
            if (val !== null) {
                sum14 += val;
                if (idx >= 7) sum7 += val;
                const c = getRainColor(val);
                rowHtml += `
                    <td class="rain-cell">
                        <span class="rain-badge" style="background-color: ${c.bg}; color: ${c.text};">
                            ${val.toFixed(1)}
                        </span>
                    </td>
                `;
            } else {
                rowHtml += `<td class="rain-cell">-</td>`;
            }
        });

        const avg7 = sum7 / 7;
        const avg14 = sum14 / 14;
        const c7 = getRainColor(avg7);
        const c14 = getRainColor(avg14);

        rowHtml += `
            <td class="rain-cell"><span class="rain-badge" style="background-color: ${c7.bg}; color: ${c7.text}; font-weight:800;">${avg7.toFixed(1)}</span></td>
            <td class="rain-cell"><span class="rain-badge" style="background-color: ${c14.bg}; color: ${c14.text}; font-weight:800;">${avg14.toFixed(1)}</span></td>
        </tr>`;

        tbody += rowHtml;
    });

    document.getElementById("table-container").innerHTML = `
        <table class="rainfall-table" id="exportable-table">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
        </table>
    `;
}

// -------------------------------------------------------------
// 3. WEEKLY VIEW
// -------------------------------------------------------------
function renderWeeklyTable(locations) {
    const allWeeks = new Set();
    locations.forEach(loc => {
        const wData = currentData.weekly_data[loc.id] || {};
        Object.keys(wData).forEach(w => allWeeks.add(w));
    });
    const sortedWeeks = Array.from(allWeeks).sort().slice(-12);

    let thead = `
        <tr>
            <th>Country</th>
            <th>Region / Island</th>
            <th>State / Province</th>
    `;
    sortedWeeks.forEach(w => {
        thead += `<th style="text-align:center;">${w}</th>`;
    });
    thead += `<th style="text-align:center;">Period Avg</th></tr>`;

    let tbody = "";
    locations.forEach(loc => {
        const lid = loc.id;
        const wData = currentData.weekly_data[lid] || {};

        let rowHtml = `
            <tr>
                <td><strong>${loc.country}</strong></td>
                <td><span class="group-badge">${loc.major_group}</span></td>
                <td class="col-state" onclick="viewStateInMatrix('${lid}')">${loc.name}</td>
        `;

        let totalAvg = 0;
        let count = 0;

        sortedWeeks.forEach(w => {
            const item = wData[w];
            if (item) {
                totalAvg += item.avg_mm_day;
                count++;
                const c = getRainColor(item.avg_mm_day);
                rowHtml += `
                    <td class="rain-cell">
                        <span class="rain-badge" style="background-color: ${c.bg}; color: ${c.text};" title="${item.total_mm}mm total">
                            ${item.avg_mm_day.toFixed(1)}
                        </span>
                    </td>
                `;
            } else {
                rowHtml += `<td class="rain-cell">-</td>`;
            }
        });

        const periodAvg = count > 0 ? (totalAvg / count) : 0;
        const pc = getRainColor(periodAvg);
        rowHtml += `
            <td class="rain-cell"><span class="rain-badge" style="background-color: ${pc.bg}; color: ${pc.text}; font-weight:800;">${periodAvg.toFixed(1)}</span></td>
        </tr>`;

        tbody += rowHtml;
    });

    document.getElementById("table-container").innerHTML = `
        <table class="rainfall-table" id="exportable-table">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
        </table>
    `;
}

// -------------------------------------------------------------
// 4. STATE MATRIX: YEAR BY MONTH IN SQUARES (MULTI-STATE SUPPORT)
// -------------------------------------------------------------
function initMatrixFilters() {
    renderStatePills();
    renderYearPills();
    renderMonthPills();
    updateYearPresetButtons();
    updateMonthPresetButtons();

    if (isStatePickerCollapsed) {
        const container = document.getElementById("matrix-state-pills-container");
        const btn = document.getElementById("toggle-state-picker-btn");
        if (container) container.style.display = "none";
        if (btn) {
            btn.innerText = "▼ Show State Picker";
            btn.style.background = "#f1f5f9";
            btn.style.color = "var(--text-secondary)";
            btn.style.borderColor = "var(--border-color)";
        }
    }
}

function renderStatePills() {
    const container = document.getElementById("matrix-state-pills-container");
    if (!container || !currentData) return;
    container.innerHTML = "";

    const regionGroups = [
        { key: "Peninsular Malaysia", label: "Peninsular" },
        { key: "Sabah & Sarawak", label: "Sabah & Sarawak" },
        { key: "Sumatera", label: "Sumatera" },
        { key: "Kalimantan", label: "Kalimantan" },
        { key: "Sulawesi", label: "Sulawesi" },
        { key: "Papua", label: "Papua" }
    ];

    regionGroups.forEach(rg => {
        const row = document.createElement("div");
        row.className = "state-region-row";

        const title = document.createElement("div");
        title.className = "state-region-title";
        title.innerText = rg.label;
        row.appendChild(title);

        const pills = document.createElement("div");
        pills.className = "state-region-pills";

        const locs = currentData.locations.filter(l => l.major_group === rg.key);
        locs.forEach(loc => {
            const pill = document.createElement("button");
            pill.type = "button";
            const isSelected = matrixSelectedStates.includes(loc.id);
            pill.className = `state-toggle-pill ${isSelected ? "active" : ""}`;
            pill.innerText = loc.name;
            pill.title = `Click to toggle ${loc.name}`;
            pill.onclick = () => toggleState(loc.id);
            pills.appendChild(pill);
        });

        row.appendChild(pills);
        container.appendChild(row);
    });

    updateSelectedStateBadge();
}

function toggleState(locId) {
    if (matrixSelectedStates.includes(locId)) {
        if (matrixSelectedStates.length === 1) {
            return; // Keep at least 1 state selected
        }
        matrixSelectedStates = matrixSelectedStates.filter(id => id !== locId);
    } else {
        matrixSelectedStates.push(locId);
    }
    selectedStateId = matrixSelectedStates[0];

    // Sync dropdown if exists
    const sel = document.getElementById("state-select");
    if (sel) sel.value = selectedStateId;

    renderStatePills();
    renderTable();
}

function selectRegionStates(regionName) {
    if (!currentData) return;
    const regionLocs = currentData.locations.filter(l => l.major_group === regionName).map(l => l.id);
    matrixSelectedStates = [...regionLocs];
    selectedStateId = matrixSelectedStates[0];
    renderStatePills();
    renderTable();
}

function selectAllStates() {
    if (!currentData) return;
    matrixSelectedStates = currentData.locations.map(l => l.id);
    selectedStateId = matrixSelectedStates[0];
    renderStatePills();
    renderTable();
}

function clearStateSelection() {
    if (!currentData) return;
    matrixSelectedStates = [currentData.locations[0].id];
    selectedStateId = matrixSelectedStates[0];
    renderStatePills();
    renderTable();
}

function setMultiStateView(viewMode) {
    multiStateViewMode = viewMode;
    const btnCombined = document.getElementById("btn-view-combined");
    const btnBreakdown = document.getElementById("btn-view-breakdown");
    if (btnCombined) btnCombined.classList.toggle("active", viewMode === "combined");
    if (btnBreakdown) btnBreakdown.classList.toggle("active", viewMode === "breakdown");
    renderTable();
}

function updateSelectedStateBadge() {
    const badge = document.getElementById("selected-state-count-badge");
    const options = document.getElementById("matrix-multi-state-options");
    if (!badge || !currentData) return;

    const count = matrixSelectedStates.length;
    if (count === 1) {
        const loc = currentData.locations.find(l => l.id === matrixSelectedStates[0]);
        badge.innerText = `1 State: ${loc ? loc.name : ""}`;
        if (options) options.style.display = "none";
    } else if (count === currentData.locations.length) {
        badge.innerText = `All ${count} States Selected`;
        if (options) options.style.display = "flex";
    } else {
        const names = matrixSelectedStates.map(id => {
            const l = currentData.locations.find(x => x.id === id);
            return l ? l.name : id;
        });
        badge.innerText = count <= 3 ? `${count} States: ${names.join(", ")}` : `${count} States Selected`;
        if (options) options.style.display = "flex";
    }

    const btnCombined = document.getElementById("btn-view-combined");
    const btnBreakdown = document.getElementById("btn-view-breakdown");
    if (btnCombined) btnCombined.classList.toggle("active", multiStateViewMode === "combined");
    if (btnBreakdown) btnBreakdown.classList.toggle("active", multiStateViewMode === "breakdown");
}

function toggleStatePicker() {
    isStatePickerCollapsed = !isStatePickerCollapsed;
    const container = document.getElementById("matrix-state-pills-container");
    const btn = document.getElementById("toggle-state-picker-btn");
    if (!container || !btn) return;
    
    if (isStatePickerCollapsed) {
        container.style.display = "none";
        btn.innerText = "▼ Show State Picker";
        btn.style.background = "#f1f5f9";
        btn.style.color = "var(--text-secondary)";
        btn.style.borderColor = "var(--border-color)";
    } else {
        container.style.display = "flex";
        btn.innerText = "▲ Hide State Picker";
        btn.style.background = "#e0f2fe";
        btn.style.color = "#0369a1";
        btn.style.borderColor = "#bae6fd";
    }
}

function getDensitySelectorHtml() {
    return `
        <div class="density-selector-group" style="display: flex; align-items: center; gap: 4px; background: #f8fafc; padding: 2px 6px; border-radius: 6px; border: 1px solid var(--border-color);">
            <span style="font-size: 10.5px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; margin-right: 2px;">Cell Size:</span>
            <button class="pill-btn ${matrixDensity === 'compact' ? 'active' : ''}" id="density-compact-btn" type="button" onclick="setMatrixDensity('compact')" style="padding: 2px 7px; font-size: 11px;">Compact</button>
            <button class="pill-btn ${matrixDensity === 'dense' ? 'active' : ''}" id="density-dense-btn" type="button" onclick="setMatrixDensity('dense')" style="padding: 2px 7px; font-size: 11px;">Ultra-Dense</button>
            <button class="pill-btn ${matrixDensity === 'standard' ? 'active' : ''}" id="density-standard-btn" type="button" onclick="setMatrixDensity('standard')" style="padding: 2px 7px; font-size: 11px;">Large</button>
        </div>
    `;
}

function setMatrixDensity(density) {
    matrixDensity = density;
    localStorage.setItem("matrix_density", density);
    applyMatrixDensity();
}

function applyMatrixDensity() {
    const container = document.getElementById("table-container");
    if (!container) return;
    container.classList.remove("matrix-compact", "matrix-dense", "matrix-standard");
    container.classList.add(`matrix-${matrixDensity}`);

    document.querySelectorAll("[id^='density-']").forEach(btn => {
        btn.classList.toggle("active", btn.id === `density-${matrixDensity}-btn`);
    });
}

function renderYearPills() {
    const container = document.getElementById("year-pill-selector");
    if (!container) return;
    container.innerHTML = "";

    for (let y = 2026; y >= 2010; y--) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `year-toggle-pill ${matrixSelectedYears.includes(y) ? "active" : ""}`;
        btn.innerText = y;
        btn.title = `Click to toggle ${y}`;
        btn.onclick = () => toggleYear(y);
        container.appendChild(btn);
    }
}

function toggleYear(y) {
    if (matrixSelectedYears.includes(y)) {
        if (matrixSelectedYears.length === 1) return; // keep at least 1 year
        matrixSelectedYears = matrixSelectedYears.filter(x => x !== y);
    } else {
        matrixSelectedYears.push(y);
        matrixSelectedYears.sort((a, b) => b - a); // descending
    }
    updateYearPresetButtons();
    renderYearPills();
    renderTable();
}

function setYearPreset(preset) {
    if (preset === "all") {
        matrixSelectedYears = [];
        for (let y = 2026; y >= 2010; y--) matrixSelectedYears.push(y);
    } else if (preset === "last5") {
        matrixSelectedYears = [2026, 2025, 2024, 2023, 2022];
    } else if (preset === "last10") {
        matrixSelectedYears = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017];
    } else if (preset === "elnino") {
        matrixSelectedYears = [2026, 2016, 2015];
    }
    updateYearPresetButtons();
    renderYearPills();
    renderTable();
}

function updateYearPresetButtons() {
    document.querySelectorAll("[data-ypreset]").forEach(btn => {
        const p = btn.dataset.ypreset;
        let isActive = false;
        if (p === "all" && matrixSelectedYears.length === 17) isActive = true;
        else if (p === "last5" && JSON.stringify(matrixSelectedYears) === "[2026,2025,2024,2023,2022]") isActive = true;
        else if (p === "last10" && matrixSelectedYears.length === 10 && matrixSelectedYears[0] === 2026 && matrixSelectedYears[9] === 2017) isActive = true;
        else if (p === "elnino" && JSON.stringify(matrixSelectedYears) === "[2026,2016,2015]") isActive = true;
        btn.classList.toggle("active", isActive);
    });
}

function renderMonthPills() {
    const container = document.getElementById("month-pill-selector");
    if (!container) return;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    container.innerHTML = "";

    for (let m = 1; m <= 12; m++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `month-toggle-pill ${matrixSelectedMonths.includes(m) ? "active" : ""}`;
        btn.innerText = monthNames[m - 1];
        btn.title = `Click to toggle ${monthNames[m - 1]}`;
        btn.onclick = () => toggleMonth(m);
        container.appendChild(btn);
    }
}

function toggleMonth(m) {
    if (matrixSelectedMonths.includes(m)) {
        if (matrixSelectedMonths.length === 1) return; // keep at least 1 month
        matrixSelectedMonths = matrixSelectedMonths.filter(x => x !== m);
    } else {
        matrixSelectedMonths.push(m);
        matrixSelectedMonths.sort((a, b) => a - b);
    }
    updateMonthPresetButtons();
    renderMonthPills();
    renderTable();
}

function setMonthPreset(preset) {
    if (preset === "all") {
        matrixSelectedMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    } else if (preset === "q1") {
        matrixSelectedMonths = [1, 2, 3];
    } else if (preset === "q2") {
        matrixSelectedMonths = [4, 5, 6];
    } else if (preset === "q3") {
        matrixSelectedMonths = [7, 8, 9];
    } else if (preset === "q4") {
        matrixSelectedMonths = [10, 11, 12];
    }
    updateMonthPresetButtons();
    renderMonthPills();
    renderTable();
}

function updateMonthPresetButtons() {
    document.querySelectorAll("[data-mpreset]").forEach(btn => {
        const p = btn.dataset.mpreset;
        let isActive = false;
        if (p === "all" && matrixSelectedMonths.length === 12) isActive = true;
        else if (p === "q1" && JSON.stringify(matrixSelectedMonths) === "[1,2,3]") isActive = true;
        else if (p === "q2" && JSON.stringify(matrixSelectedMonths) === "[4,5,6]") isActive = true;
        else if (p === "q3" && JSON.stringify(matrixSelectedMonths) === "[7,8,9]") isActive = true;
        else if (p === "q4" && JSON.stringify(matrixSelectedMonths) === "[10,11,12]") isActive = true;
        btn.classList.toggle("active", isActive);
    });
}

function viewStateInMatrix(locId) {
    matrixSelectedStates = [locId];
    selectedStateId = locId;
    const sel = document.getElementById("state-select");
    if (sel) sel.value = locId;
    renderStatePills();
    setMode("state_matrix");
}

function renderStateYearByMonthMatrix() {
    if (!currentData || !currentData.locations) return;

    // Ensure valid selection
    if (!matrixSelectedStates || matrixSelectedStates.length === 0) {
        matrixSelectedStates = [currentData.locations[0].id];
    }
    const selectedLocs = currentData.locations.filter(l => matrixSelectedStates.includes(l.id));
    if (selectedLocs.length === 0) {
        matrixSelectedStates = [currentData.locations[0].id];
        selectedLocs.push(currentData.locations[0]);
    }
    selectedStateId = matrixSelectedStates[0];
    updateSelectedStateBadge();

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const yearsToShow = matrixSelectedYears.length > 0 ? [...matrixSelectedYears].sort((a, b) => b - a) : [2026];
    const activeMonths = matrixSelectedMonths.length > 0 ? [...matrixSelectedMonths].sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    let yearSpanText = "";
    if (yearsToShow.length === 17) {
        yearSpanText = "2010 &ndash; 2026";
    } else if (yearsToShow.length <= 4) {
        yearSpanText = yearsToShow.join(", ");
    } else {
        yearSpanText = `${yearsToShow.length} Years Selected`;
    }

    const monthSpanText = activeMonths.length === 12 ? "All Months" : activeMonths.map(m => monthNames[m - 1]).join(", ");

    // 1. SINGLE STATE VIEW
    if (selectedLocs.length === 1) {
        const loc = selectedLocs[0];
        const { thead, tbody, grandDailyAvg } = buildMatrixTableForLocation(loc, yearsToShow, activeMonths, monthNames);

        let headerHtml = `
            <div class="state-matrix-header">
                <div class="state-matrix-title">
                    <h2>${loc.name} &bull; Rainfall Matrix &bull; ${yearSpanText}</h2>
                    <p>${loc.country} &bull; ${loc.major_group} &bull; Showing: ${monthSpanText}</p>
                </div>
                <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
                    ${getDensitySelectorHtml()}
                    <div style="text-align: right;">
                        <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Filtered Daily Avg</div>
                        <div style="font-size: 20px; font-weight: 800; color: var(--text-primary);">${grandDailyAvg.toFixed(2)} mm / day</div>
                    </div>
                    <button class="btn btn-secondary" onclick="openDrilldown('${loc.id}')" style="background: #09444c; color: white;">
                        View Chart Trend &rarr;
                    </button>
                </div>
            </div>
        `;

        document.getElementById("table-container").innerHTML = `
            ${headerHtml}
            <div style="overflow-x: auto;">
                <table class="matrix-table" id="exportable-table">
                    ${thead}
                    ${tbody}
                </table>
            </div>
        `;
        applyMatrixDensity();
        return;
    }

    // 2. MULTIPLE STATES VIEW (COMBINED AVERAGE MATRIX)
    const { thead: combThead, tbody: combTbody, grandDailyAvg: combDailyAvg } = buildCombinedMatrixTable(selectedLocs, yearsToShow, activeMonths, monthNames);

    const stateNamesSummary = selectedLocs.length <= 5 
        ? selectedLocs.map(l => l.name).join(", ") 
        : `${selectedLocs.slice(0, 4).map(l => l.name).join(", ")} +${selectedLocs.length - 4} more`;

    let headerHtml = `
        <div class="state-matrix-header">
            <div class="state-matrix-title">
                <h2>Combined Average Matrix &bull; ${selectedLocs.length} States &bull; ${yearSpanText}</h2>
                <p>States: ${stateNamesSummary} &bull; Showing: ${monthSpanText}</p>
            </div>
            <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
                ${getDensitySelectorHtml()}
                <div style="text-align: right;">
                    <div style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">Combined Daily Avg</div>
                    <div style="font-size: 20px; font-weight: 800; color: var(--text-primary);">${combDailyAvg.toFixed(2)} mm / day</div>
                </div>
            </div>
        </div>
    `;

    let outputHtml = `
        ${headerHtml}
        <div style="overflow-x: auto;">
            <table class="matrix-table" id="exportable-table">
                ${combThead}
                ${combTbody}
            </table>
        </div>
    `;

    // If breakdown view is selected, render individual tables below
    if (multiStateViewMode === "breakdown") {
        outputHtml += `
            <div class="breakdown-state-block">
                <div style="margin-bottom: 16px;">
                    <h3 style="font-size: 18px; font-weight: 800; color: var(--text-primary);">Individual State Breakdowns &bull; ${selectedLocs.length} States</h3>
                    <p style="font-size: 12px; color: var(--text-secondary);">Separate Year &times; Month matrices for each selected state:</p>
                </div>
        `;

        selectedLocs.forEach(loc => {
            const { thead: locThead, tbody: locTbody, grandDailyAvg: locDailyAvg } = buildMatrixTableForLocation(loc, yearsToShow, activeMonths, monthNames);
            outputHtml += `
                <div style="margin-top: 24px; padding: 16px 20px; background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px;">
                    <div class="breakdown-state-header">
                        <div>
                            <h3>${loc.name} &bull; ${loc.major_group}</h3>
                            <p>${loc.country} &bull; Filtered Daily Avg: <strong>${locDailyAvg.toFixed(2)} mm / day</strong></p>
                        </div>
                        <button class="btn btn-secondary" onclick="openDrilldown('${loc.id}')" style="background: #09444c; color: white; padding: 4px 10px; font-size: 12px;">
                            View Chart Trend &rarr;
                        </button>
                    </div>
                    <div style="overflow-x: auto;">
                        <table class="matrix-table">
                            ${locThead}
                            ${locTbody}
                        </table>
                    </div>
                </div>
            `;
        });

        outputHtml += `</div>`;
    }

    document.getElementById("table-container").innerHTML = outputHtml;
    applyMatrixDensity();
}

function buildMatrixTableForLocation(loc, yearsToShow, activeMonths, monthNames) {
    const locMonthly = currentData.monthly_data[loc.id] || {};
    const baseline = currentData.baseline_monthly[loc.id] || {};

    let grandSum = 0;
    let grandDays = 0;
    yearsToShow.forEach(y => {
        if (locMonthly[y]) {
            activeMonths.forEach(m => {
                if (locMonthly[y][m]) {
                    grandSum += locMonthly[y][m].total_mm;
                    grandDays += locMonthly[y][m].days;
                }
            });
        }
    });
    const grandDailyAvg = grandDays > 0 ? (grandSum / grandDays) : 0;

    let thead = `
        <thead>
            <tr>
                <th style="width: 80px; text-align: right; padding-right: 14px;">Year</th>
    `;
    activeMonths.forEach(m => {
        thead += `<th>${monthNames[m - 1]}</th>`;
    });
    thead += `<th style="text-align: center;">Filtered Avg</th></tr></thead>`;

    let tbody = "<tbody>";
    yearsToShow.forEach(y => {
        const yData = locMonthly[y] || {};
        let rowSum = 0;
        let rowDays = 0;

        let rowHtml = `
            <tr>
                <td class="matrix-year-cell">${y}</td>
        `;

        activeMonths.forEach(m => {
            const mInfo = yData[m];
            if (mInfo) {
                const avg = mInfo.avg_mm_day;
                rowSum += mInfo.total_mm;
                rowDays += mInfo.days;
                const c = getRainColor(avg);
                const tooltip = `${monthNames[m-1]} ${y}: ${avg.toFixed(1)} mm/day (${mInfo.total_mm} mm in ${mInfo.days} days)`;

                rowHtml += `
                    <td>
                        <div class="matrix-square-cell" style="background-color: ${c.bg}; color: ${c.text};" title="${tooltip}">
                            <span>${avg.toFixed(1)}</span>
                            <span class="matrix-square-total">${Math.round(mInfo.total_mm)}mm</span>
                        </div>
                    </td>
                `;
            } else {
                rowHtml += `
                    <td>
                        <div class="matrix-square-cell" style="background-color: #f8fafc; color: #cbd5e1; border: 1px dashed #e2e8f0;">
                            <span>-</span>
                        </div>
                    </td>
                `;
            }
        });

        const yAvg = rowDays > 0 ? (rowSum / rowDays) : null;
        if (yAvg !== null) {
            const yc = getRainColor(yAvg);
            rowHtml += `
                <td>
                    <div class="matrix-square-cell" style="background-color: ${yc.bg}; color: ${yc.text}; border: 2px solid rgba(0,0,0,0.15);" title="Selected Months ${y}: ${yAvg.toFixed(1)} mm/day (${Math.round(rowSum)} mm total)">
                        <span style="font-weight: 900;">${yAvg.toFixed(1)}</span>
                        <span class="matrix-square-total">${Math.round(rowSum)}mm</span>
                    </div>
                </td>
            `;
        } else {
            rowHtml += `<td><div class="matrix-square-cell" style="background: #f8fafc; color: #cbd5e1;">-</div></td>`;
        }

        rowHtml += `</tr>`;
        tbody += rowHtml;
    });

    // Baseline Normal Row
    let baselineSum = 0;
    let baseCount = 0;
    let baseCells = `
        <tr class="baseline-row">
            <td class="matrix-year-cell" style="color: #0284c7; font-weight: 800; font-size: 11.5px; text-transform: uppercase;">
                Normal<br><span style="font-size: 9.5px; color: #64748b;">2010–25</span>
            </td>
    `;
    activeMonths.forEach(m => {
        const bVal = baseline[m];
        if (bVal !== undefined) {
            baselineSum += bVal;
            baseCount++;
            const bc = getRainColor(bVal);
            baseCells += `
                <td>
                    <div class="matrix-square-cell" style="background-color: ${bc.bg}; color: ${bc.text}; outline: 2px solid #0284c7; outline-offset: -2px;" title="Historical Normal ${monthNames[m-1]}: ${bVal.toFixed(1)} mm/day">
                        <span>${bVal.toFixed(1)}</span>
                        <span class="matrix-square-total">Normal</span>
                    </div>
                </td>
            `;
        } else {
            baseCells += `<td>-</td>`;
        }
    });

    const fullBaseAvg = baseCount > 0 ? (baselineSum / baseCount) : 0;
    const fbc = getRainColor(fullBaseAvg);
    baseCells += `
        <td>
            <div class="matrix-square-cell" style="background-color: ${fbc.bg}; color: ${fbc.text}; outline: 2px solid #0284c7; font-weight: 900;" title="Historical Normal Filtered Months: ${fullBaseAvg.toFixed(1)} mm/day">
                <span>${fullBaseAvg.toFixed(1)}</span>
                <span class="matrix-square-total">Normal</span>
            </div>
        </td>
    </tr>`;

    tbody += baseCells + "</tbody>";
    return { thead, tbody, grandDailyAvg };
}

function buildCombinedMatrixTable(selectedLocs, yearsToShow, activeMonths, monthNames) {
    let grandSum = 0;
    let grandDays = 0;

    yearsToShow.forEach(y => {
        activeMonths.forEach(m => {
            selectedLocs.forEach(loc => {
                const mData = currentData.monthly_data[loc.id] && currentData.monthly_data[loc.id][y] && currentData.monthly_data[loc.id][y][m];
                if (mData) {
                    grandSum += mData.total_mm;
                    grandDays += mData.days;
                }
            });
        });
    });
    const grandDailyAvg = grandDays > 0 ? (grandSum / grandDays) : 0;

    let thead = `
        <thead>
            <tr>
                <th style="width: 80px; text-align: right; padding-right: 14px;">Year</th>
    `;
    activeMonths.forEach(m => {
        thead += `<th>${monthNames[m - 1]}</th>`;
    });
    thead += `<th style="text-align: center;">Combined Avg</th></tr></thead>`;

    let tbody = "<tbody>";
    yearsToShow.forEach(y => {
        let rowSum = 0;
        let rowDays = 0;

        let rowHtml = `
            <tr>
                <td class="matrix-year-cell">${y}</td>
        `;

        activeMonths.forEach(m => {
            let cellSum = 0;
            let cellDays = 0;
            let locsWithData = 0;

            selectedLocs.forEach(loc => {
                const mData = currentData.monthly_data[loc.id] && currentData.monthly_data[loc.id][y] && currentData.monthly_data[loc.id][y][m];
                if (mData) {
                    cellSum += mData.total_mm;
                    cellDays += mData.days;
                    locsWithData++;
                }
            });

            if (cellDays > 0) {
                const avg = cellSum / cellDays;
                rowSum += cellSum;
                rowDays += cellDays;
                const c = getRainColor(avg);
                const avgTotalPerState = cellSum / selectedLocs.length;
                const tooltip = `${monthNames[m-1]} ${y}: ${avg.toFixed(1)} mm/day combined across ${locsWithData} states`;

                rowHtml += `
                    <td>
                        <div class="matrix-square-cell" style="background-color: ${c.bg}; color: ${c.text};" title="${tooltip}">
                            <span>${avg.toFixed(1)}</span>
                            <span class="matrix-square-total">${Math.round(avgTotalPerState)}mm</span>
                        </div>
                    </td>
                `;
            } else {
                rowHtml += `
                    <td>
                        <div class="matrix-square-cell" style="background-color: #f8fafc; color: #cbd5e1; border: 1px dashed #e2e8f0;">
                            <span>-</span>
                        </div>
                    </td>
                `;
            }
        });

        const yAvg = rowDays > 0 ? (rowSum / rowDays) : null;
        if (yAvg !== null) {
            const yc = getRainColor(yAvg);
            const avgYearTotalPerState = rowSum / selectedLocs.length;
            rowHtml += `
                <td>
                    <div class="matrix-square-cell" style="background-color: ${yc.bg}; color: ${yc.text}; border: 2px solid rgba(0,0,0,0.15);" title="Combined ${y}: ${yAvg.toFixed(1)} mm/day (Avg ${Math.round(avgYearTotalPerState)} mm/state)">
                        <span style="font-weight: 900;">${yAvg.toFixed(1)}</span>
                        <span class="matrix-square-total">${Math.round(avgYearTotalPerState)}mm</span>
                    </div>
                </td>
            `;
        } else {
            rowHtml += `<td><div class="matrix-square-cell" style="background: #f8fafc; color: #cbd5e1;">-</div></td>`;
        }

        rowHtml += `</tr>`;
        tbody += rowHtml;
    });

    // Baseline Normal Row
    let baselineSum = 0;
    let baseCount = 0;
    let baseCells = `
        <tr class="baseline-row">
            <td class="matrix-year-cell" style="color: #0284c7; font-weight: 800; font-size: 11.5px; text-transform: uppercase;">
                Normal<br><span style="font-size: 9.5px; color: #64748b;">2010–25</span>
            </td>
    `;

    activeMonths.forEach(m => {
        let mBaseSum = 0;
        let mBaseCount = 0;
        selectedLocs.forEach(loc => {
            const b = currentData.baseline_monthly[loc.id] && currentData.baseline_monthly[loc.id][m];
            if (b !== undefined) {
                mBaseSum += b;
                mBaseCount++;
            }
        });

        if (mBaseCount > 0) {
            const bVal = mBaseSum / mBaseCount;
            baselineSum += bVal;
            baseCount++;
            const bc = getRainColor(bVal);
            baseCells += `
                <td>
                    <div class="matrix-square-cell" style="background-color: ${bc.bg}; color: ${bc.text}; outline: 2px solid #0284c7; outline-offset: -2px;" title="Historical Normal ${monthNames[m-1]}: ${bVal.toFixed(1)} mm/day combined">
                        <span>${bVal.toFixed(1)}</span>
                        <span class="matrix-square-total">Normal</span>
                    </div>
                </td>
            `;
        } else {
            baseCells += `<td>-</td>`;
        }
    });

    const fullBaseAvg = baseCount > 0 ? (baselineSum / baseCount) : 0;
    const fbc = getRainColor(fullBaseAvg);
    baseCells += `
        <td>
            <div class="matrix-square-cell" style="background-color: ${fbc.bg}; color: ${fbc.text}; outline: 2px solid #0284c7; font-weight: 900;" title="Historical Normal Filtered Months: ${fullBaseAvg.toFixed(1)} mm/day combined">
                <span>${fullBaseAvg.toFixed(1)}</span>
                <span class="matrix-square-total">Normal</span>
            </div>
        </td>
    </tr>`;

    tbody += baseCells + "</tbody>";
    return { thead, tbody, grandDailyAvg };
}

// -------------------------------------------------------------
// 5. DRILLDOWN MODAL & HISTORICAL CHART (2010 - 2026)
// -------------------------------------------------------------
function openDrilldown(locId) {
    const loc = currentData.locations.find(l => l.id === locId);
    if (!loc) return;

    document.getElementById("modal-title").innerText = `${loc.name} • ${loc.major_group}`;
    document.getElementById("modal-subtitle").innerText = `${loc.country} • Coordinates: ${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)}`;
    
    document.getElementById("drilldown-modal").classList.add("active");

    renderDrilldownChart(loc);
}

function closeModal() {
    document.getElementById("drilldown-modal").classList.remove("active");
    if (currentChart) {
        currentChart.destroy();
        currentChart = null;
    }
}

function renderDrilldownChart(loc) {
    const ctx = document.getElementById("drilldown-chart").getContext("2d");
    if (currentChart) {
        currentChart.destroy();
    }

    const locMonthly = currentData.monthly_data[loc.id] || {};
    const baseline = currentData.baseline_monthly[loc.id] || {};

    const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const d2026 = [];
    const d2025 = [];
    const d2024 = [];
    const dBase = [];

    for (let m = 1; m <= 12; m++) {
        d2026.push(locMonthly[2026] && locMonthly[2026][m] ? locMonthly[2026][m].avg_mm_day : null);
        d2025.push(locMonthly[2025] && locMonthly[2025][m] ? locMonthly[2025][m].avg_mm_day : null);
        d2024.push(locMonthly[2024] && locMonthly[2024][m] ? locMonthly[2024][m].avg_mm_day : null);
        dBase.push(baseline[m] !== undefined ? baseline[m] : null);
    }

    currentChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: monthLabels,
            datasets: [
                {
                    label: "2026 Daily Avg (mm/day)",
                    data: d2026,
                    borderColor: "#0284c7",
                    backgroundColor: "rgba(2, 132, 199, 0.1)",
                    borderWidth: 3,
                    fill: true,
                    tension: 0.2
                },
                {
                    label: "2025 Daily Avg (mm/day)",
                    data: d2025,
                    borderColor: "#64748b",
                    borderWidth: 2,
                    borderDash: [4, 4],
                    fill: false,
                    tension: 0.2
                },
                {
                    label: "2024 Daily Avg (mm/day)",
                    data: d2024,
                    borderColor: "#cbd5e1",
                    borderWidth: 1.5,
                    fill: false,
                    tension: 0.2
                },
                {
                    label: "Historical Normal (2010-2025 Avg)",
                    data: dBase,
                    borderColor: "#10b981",
                    borderWidth: 2,
                    fill: false,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "top" },
                tooltip: {
                    callbacks: {
                        label: function(c) {
                            return `${c.dataset.label}: ${c.raw !== null ? c.raw.toFixed(1) + ' mm/day' : 'N/A'}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: "Average Rainfall (mm / day)" },
                    grid: { color: "#f1f5f9" }
                },
                x: {
                    grid: { color: "#f1f5f9" }
                }
            }
        }
    });
}

// -------------------------------------------------------------
// 6. CSV EXPORT
// -------------------------------------------------------------
function exportTableToCSV() {
    const table = document.getElementById("exportable-table");
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll("tr");
    for (let r of rows) {
        let cols = [];
        for (let c of r.querySelectorAll("th, td")) {
            let txt = c.innerText.replace(/(\r\n|\n|\r)/gm, " ").trim();
            txt = txt.replace(/"/g, '""');
            cols.push(`"${txt}"`);
        }
        csv.push(cols.join(","));
    }

    const csvStr = csv.join("\n");
    const blob = new Blob([csvStr], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rainfall_Export_${currentMode}_${selectedStateId || currentGroup}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Initialize on DOM load
window.addEventListener("DOMContentLoaded", initDashboard);
