// --- CONFIGURATION ---
const RATES = {
    rupeePerKm: 3.0,    // Fuel & Maint vs Scooter
    co2SavedPerKm: 75,  // Grams saved per km
    icePerGramCO2: 3,   // Grams ice melted per Gram CO2
    netflixGrams: 55,   // Grams CO2 per hour HD stream
    pizzaGrams: 300,    // Grams CO2 per slice
    jeansKg: 20,        // Kg CO2 per jeans
    treeKg: 22          // Kg CO2 absorbed by mature tree/year
};

// --- STATE ---
let tracking = false;
let watchId = null;
let startTime = null;
let totalDist = 0; // in km (Current Session)
let lastLat = null;
let lastLon = null;

// Audio
const sfxStart = document.getElementById('sfx-start');
const sfxSuccess = document.getElementById('sfx-success');
const sfxClick = document.getElementById('sfx-click');

// DOM Elements
const btn = document.getElementById('action-btn');
const gpsStatus = document.getElementById('gps-status');
const ridePanel = document.getElementById('ride-panel');
const reportPanel = document.getElementById('report-panel');
const distDisplay = document.getElementById('dist-display');
const timeDisplay = document.getElementById('time-display');
const speedDisplay = document.getElementById('speed-display');

// Modal Elements
const infoBtn = document.getElementById('info-btn');
const closeModalBtn = document.getElementById('close-modal');
const dataModal = document.getElementById('data-modal');
const logicList = document.getElementById('logic-list');

// Initialize Storage
if (!localStorage.getItem('arpan_stats')) {
    localStorage.setItem('arpan_stats', JSON.stringify({
        totalKm: 0,
        totalRupees: 0,
        totalCo2: 0 // in grams
    }));
}

// Load Lifetime Stats on Startup
loadLifetimeStats();
// Populate Modal
populateDataModal();


// --- EVENT LISTENERS ---
btn.addEventListener('click', () => {
    if (!tracking) {
        sfxStart.play().catch(e => console.log("Audio block"));
        startRide();
    } else {
        stopRide();
    }
});

infoBtn.addEventListener('click', () => {
    sfxClick.play();
    dataModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => {
    sfxClick.play();
    dataModal.classList.add('hidden');
});


// --- CORE FUNCTIONS ---

function loadLifetimeStats() {
    const stats = JSON.parse(localStorage.getItem('arpan_stats'));
    
    // Update the new HUD elements
    const lifetimeMoney = document.getElementById('lifetime-money');
    const lifetimeDist = document.getElementById('lifetime-dist');
    const forestFill = document.getElementById('forest-fill');
    const forestCount = document.getElementById('forest-count');

    if(lifetimeMoney) lifetimeMoney.textContent = "₹" + Math.round(stats.totalRupees);
    if(lifetimeDist) lifetimeDist.textContent = stats.totalKm.toFixed(1) + " KM";

    // Also update forest stats hidden in the report panel, just in case
    const totalCo2Kg = stats.totalCo2 / 1000;
    const treeCount = totalCo2Kg / RATES.treeKg;
    const forestProgressPercent = (treeCount / 10) * 100;
    
    if(forestCount) forestCount.textContent = treeCount.toFixed(2);
    if(forestFill) forestFill.style.width = Math.min(forestProgressPercent, 100) + "%";
}

function startRide() {
    if (!navigator.geolocation) {
        alert("GPS not supported");
        return;
    }
    
    tracking = true;
    startTime = new Date();
    totalDist = 0;
    lastLat = null;
    lastLon = null;

    // UI Updates
    btn.textContent = "TERMINATE RIDE";
    btn.classList.remove('start');
    btn.classList.add('stop');
    
    gpsStatus.textContent = "TRACKING ACTIVE";
    gpsStatus.style.color = "var(--accent-green)";
    
    // Reset Display
    distDisplay.textContent = "0.00 KM";
    timeDisplay.textContent = "00:00";
    speedDisplay.textContent = "0.0";

    keepScreenAwake();

    watchId = navigator.geolocation.watchPosition(
        updatePosition, 
        handleError, 
        { 
            enableHighAccuracy: true, 
            timeout: 5000, 
            maximumAge: 0 
        }
    );

    startTimer();
}

function stopRide() {
    tracking = false;
    navigator.geolocation.clearWatch(watchId);
    
    btn.textContent = "INITIATE RIDE";
    btn.classList.remove('stop');
    btn.classList.add('start');
    
    generateReport();
}

function updatePosition(position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    const speed = position.coords.speed; // m/s

    if (lastLat) {
        const d = calculateDistance(lastLat, lastLon, lat, lon);
        if (d > 0.005) { // Filter < 5m jitter
            totalDist += d;
        }
    }

    lastLat = lat;
    lastLon = lon;

    distDisplay.textContent = totalDist.toFixed(2) + " KM";
    speedDisplay.textContent = speed ? (speed * 3.6).toFixed(1) : "0.0";
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function handleError(error) {
    console.warn('GPS Error: ' + error.code);
    gpsStatus.textContent = "SIGNAL WEAK - RETRYING...";
    gpsStatus.style.color = "var(--accent-red)";
}

// --- WAKE LOCK ---
async function keepScreenAwake() {
    if ('wakeLock' in navigator) {
        try {
            await navigator.wakeLock.request('screen');
            console.log("Wake Lock Active");
        } catch (err) {
            console.log(err);
        }
    }
}

// --- TIMER ---
let timerInterval;
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if(!tracking) {
            clearInterval(timerInterval);
            return;
        }
        const now = new Date();
        const diff = now - startTime;
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        timeDisplay.textContent = `${pad(mins)}:${pad(secs)}`;
    }, 1000);
}

function pad(n) {
    return n < 10 ? '0'+n : n;
}

// --- REPORT LOGIC ---
function generateReport() {
    sfxSuccess.play().catch(e => console.log("Audio block"));

    // Calc Metrics (Session)
    const co2SavedGrams = totalDist * RATES.co2SavedPerKm;
    const moneySaved = totalDist * RATES.rupeePerKm;
    
    // Display Session Metrics
    const iceSavedKg = (co2SavedGrams * RATES.icePerGramCO2) / 1000;
    const pizzaSlices = co2SavedGrams / RATES.pizzaGrams;
    const netflixHours = co2SavedGrams / RATES.netflixGrams;
    const jeansPercentRide = ((co2SavedGrams / 1000) / RATES.jeansKg) * 100;

    // Update Hero & Grid (Session Data)
    document.getElementById('money-saved').textContent = Math.round(moneySaved);
    document.getElementById('ice-saved').textContent = iceSavedKg.toFixed(2) + "kg";
    document.getElementById('pizza-earned').textContent = pizzaSlices.toFixed(1);
    document.getElementById('netflix-time').textContent = netflixHours.toFixed(1) + "h";
    document.getElementById('jeans-percent').textContent = jeansPercentRide.toFixed(1) + "%";

    // Save to Persistent Storage
    updateLifetimeStats(totalDist, moneySaved, co2SavedGrams);

    // Show Report
    ridePanel.classList.add('hidden');
    reportPanel.classList.remove('hidden');
    gpsStatus.textContent = "AUDIT COMPLETE";
}

function updateLifetimeStats(dist, money, co2) {
    let stats = JSON.parse(localStorage.getItem('arpan_stats'));
    stats.totalKm += dist;
    stats.totalRupees += money;
    stats.totalCo2 += co2; // grams
    localStorage.setItem('arpan_stats', JSON.stringify(stats));
    
    // Refresh the HUD so the main screen is ready for next time
    loadLifetimeStats();
}

function resetApp() {
    sfxClick.play();
    ridePanel.classList.remove('hidden');
    reportPanel.classList.add('hidden');
    
    distDisplay.textContent = "0.00 KM";
    timeDisplay.textContent = "00:00";
    speedDisplay.textContent = "0.0";
    gpsStatus.textContent = "AWAITING SATELLITES...";
}


// --- MODAL DATA ---
function populateDataModal() {
    const dataPoints = [
        { label: "MONEY SAVED", val: `₹${RATES.rupeePerKm} / KM` },
        { label: "CO2 SAVED", val: `${RATES.co2SavedPerKm}g / KM` },
        { label: "ARCTIC ICE", val: `3g / 1g CO2` },
        { label: "NETFLIX 4K", val: `${RATES.netflixGrams}g / HR` },
        { label: "PIZZA SLICE", val: `${RATES.pizzaGrams}g CO2` },
        { label: "JEANS PAIR", val: `${RATES.jeansKg} KG CO2` },
        { label: "MATURE TREE", val: `${RATES.treeKg} KG CO2/YR` }
    ];

    let html = '';
    dataPoints.forEach(item => {
        html += `
        <div class="logic-row">
            <span style="color:var(--text-dim)">${item.label}</span>
            <span style="color:var(--accent-cyan)">${item.val}</span>
        </div>`;
    });
    logicList.innerHTML = html;
}
