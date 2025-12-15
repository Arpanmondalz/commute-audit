// --- CONFIGURATION ---
const RATES = {
    rupeePerKm: 3.0,      // Fuel & Maint vs Scooter
    co2SavedPerKm: 75,    // Grams saved per km
    icePerGramCO2: 3,     // Grams ice melted per Gram CO2
    netflixGrams: 55,     // Grams CO2 per hour HD stream
    pizzaGrams: 300,      // Grams CO2 per slice
    jeansKg: 20,          // Kg CO2 per jeans
    treeKg: 22            // Kg CO2 absorbed by mature tree/year
};

// --- STATE ---
let tracking = false;
let watchId = null;
let startTime = null;
let totalDist = 0; // in km
let lastLat = null;
let lastLon = null;

// Audio
const sfxStart = document.getElementById('sfx-start');
const sfxSuccess = document.getElementById('sfx-success');
const sfxClick = document.getElementById('sfx-click');

// DOM Elements
const btn = document.getElementById('action-btn');
const gpsStatus = document.getElementById('gps-status');
const homePanel = document.getElementById('home-panel');
const reportPanel = document.getElementById('report-panel');
const activeRideStatus = document.getElementById('active-ride-status');
const rideTimerDisplay = document.getElementById('ride-timer-display');

// Modal Elements
const infoBtn = document.getElementById('info-btn');
const closeModalBtn = document.getElementById('close-modal');
const dataModal = document.getElementById('data-modal');
const logicList = document.getElementById('logic-list');

// --- INITIALIZATION ---
// Initialize Storage
if (!localStorage.getItem('arpan_stats')) {
    localStorage.setItem('arpan_stats', JSON.stringify({
        totalKm: 0,
        totalRupees: 0,
        totalCo2: 0 // in grams
    }));
}

// Render Data on Load
renderLifetimeStats();
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

    // UI Updates: Show Timer, Hide Lifetime Stats slightly or just change button
    btn.textContent = "TERMINATE RIDE";
    btn.classList.remove('start');
    btn.classList.add('stop');
    gpsStatus.textContent = "TRACKING ACTIVE";
    gpsStatus.style.color = "var(--accent-green)";
    
    // Show active ride pulse
    activeRideStatus.classList.remove('hidden');
    
    keepScreenAwake();

    watchId = navigator.geolocation.watchPosition(
        updatePosition, 
        handleError, 
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );

    startTimer();
}

function stopRide() {
    tracking = false;
    navigator.geolocation.clearWatch(watchId);
    
    // UI Reset for Button
    btn.textContent = "INITIATE RIDE";
    btn.classList.remove('stop');
    btn.classList.add('start');
    activeRideStatus.classList.add('hidden');
    
    generateReport();
}

function updatePosition(position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    // We ignore speed display now, just track distance internally

    if (lastLat) {
        const d = calculateDistance(lastLat, lastLon, lat, lon);
        if (d > 0.005) { // Filter < 5m jitter
            totalDist += d; 
        }
    }

    lastLat = lat;
    lastLon = lon;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// --- TIMER ---
let timerInterval;
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if(!tracking) { clearInterval(timerInterval); return; }
        const now = new Date();
        const diff = now - startTime;
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        // Update both timer displays if needed
        rideTimerDisplay.textContent = `${pad(mins)}:${pad(secs)}`;
    }, 1000);
}
function pad(n) { return n < 10 ? '0'+n : n; }

// --- REPORT LOGIC ---
function generateReport() {
    sfxSuccess.play().catch(e => console.log("Audio block"));

    // Calc Metrics for THIS Ride
    const co2SavedGrams = totalDist * RATES.co2SavedPerKm;
    const moneySaved = totalDist * RATES.rupeePerKm;
    
    const pizzaSlices = co2SavedGrams / RATES.pizzaGrams;
    const netflixHours = co2SavedGrams / RATES.netflixGrams;

    // Update Report UI
    document.getElementById('ride-money-saved').textContent = Math.round(moneySaved);
    document.getElementById('ride-dist-display').textContent = totalDist.toFixed(2) + " KM";
    document.getElementById('ride-time-final').textContent = rideTimerDisplay.textContent;
    document.getElementById('ride-pizza-earned').textContent = pizzaSlices.toFixed(1);
    document.getElementById('ride-netflix-time').textContent = netflixHours.toFixed(1) + "h";

    // Commit to Lifetime Stats
    updateLifetimeStats(totalDist, moneySaved, co2SavedGrams);

    // Switch Views
    homePanel.classList.add('hidden');
    reportPanel.classList.remove('hidden');
    gpsStatus.textContent = "AUDIT COMPLETE";
}

function updateLifetimeStats(dist, money, co2) {
    let stats = JSON.parse(localStorage.getItem('arpan_stats'));
    
    stats.totalKm += dist;
    stats.totalRupees += money;
    stats.totalCo2 += co2; // grams
    
    localStorage.setItem('arpan_stats', JSON.stringify(stats));
    
    // Re-render the home screen so it's updated when we go back
    renderLifetimeStats();
}

function renderLifetimeStats() {
    let stats = JSON.parse(localStorage.getItem('arpan_stats'));
    
    // Money
    document.getElementById('life-money-display').textContent = Math.floor(stats.totalRupees).toLocaleString();
    
    // Ice
    const totalIceKg = (stats.totalCo2 * RATES.icePerGramCO2) / 1000;
    document.getElementById('life-ice-display').textContent = totalIceKg.toFixed(2) + "kg";
    
    // Jeans (Total Pairs)
    const totalCo2Kg = stats.totalCo2 / 1000;
    const totalJeans = Math.floor(totalCo2Kg / RATES.jeansKg);
    document.getElementById('life-jeans-display').textContent = totalJeans;

    // Forest Progress
    const treeCount = totalCo2Kg / RATES.treeKg;
    const forestProgressPercent = (treeCount / 10) * 100;
    
    document.getElementById('home-forest-count').textContent = treeCount.toFixed(2);
    document.getElementById('home-forest-fill').style.width = Math.min(forestProgressPercent, 100) + "%";
}

function resetApp() {
    sfxClick.play();
    reportPanel.classList.add('hidden');
    homePanel.classList.remove('hidden');
    gpsStatus.textContent = "SYSTEM READY";
    // Timer resets automatically on next start
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
            <div class="data-row">
                <span>${item.label}</span>
                <span>${item.val}</span>
            </div>
        `;
    });
    logicList.innerHTML = html;
}

// --- UTILS ---
function handleError(err) {
    console.warn(err.message);
    gpsStatus.textContent = "GPS SIGNAL WEAK";
    gpsStatus.style.color = "var(--accent-red)";
}

async function keepScreenAwake() {
    if ('wakeLock' in navigator) {
        try { await navigator.wakeLock.request('screen'); }
        catch (err) { console.log("Wake Lock failed"); }
    }
}
