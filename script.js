// --- CONFIGURATION ---
const RATES = {
    rupeePerKm: 3.0,
    co2SavedPerKm: 75,
    icePerGramCO2: 3,
    netflixGrams: 55,
    pizzaGrams: 300,
    jeansKg: 20,
    treeKg: 22
};

// --- STATE ---
let tracking = false;
let watchId = null;
let startTime = null;
let totalDist = 0;
let lastLat = null;
let lastLon = null;
let rideTime = "00:00";

// Audio
const sfxStart = document.getElementById('sfx-start');
const sfxSuccess = document.getElementById('sfx-success');
const sfxClick = document.getElementById('sfx-click');

// DOM Elements
const btn = document.getElementById('action-btn');
const gpsStatus = document.getElementById('gps-status');
const mainPanel = document.getElementById('main-panel');
const reportPanel = document.getElementById('report-panel');
const liveCounters = document.getElementById('live-counters');
const lifetimeSection = document.getElementById('lifetime-section');

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
        totalCo2: 0
    }));
}

// Load and display lifetime stats on page load
displayLifetimeStats();
populateDataModal();

// --- EVENT LISTENERS ---
btn.addEventListener('click', () => {
    if (!tracking) {
        sfxStart.play().catch(e => console.log("Audio blocked"));
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

    // UI Updates
    btn.textContent = "TERMINATE RIDE";
    btn.classList.remove('start');
    btn.classList.add('stop');
    gpsStatus.textContent = "TRACKING ACTIVE";
    gpsStatus.style.color = "var(--accent-green)";
    
    // Show live counters, hide lifetime stats
    liveCounters.classList.remove('hidden');
    lifetimeSection.classList.add('hidden');
    
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
    
    btn.textContent = "INITIATE RIDE";
    btn.classList.remove('stop');
    btn.classList.add('start');
    
    generateReport();
}

function updatePosition(position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    if (lastLat) {
        const d = calculateDistance(lastLat, lastLon, lat, lon);
        if (d > 0.005) {
            totalDist += d;
            // Update live distance counter
            document.getElementById('live-distance').textContent = totalDist.toFixed(2) + " KM";
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
        rideTime = `${pad(mins)}:${pad(secs)}`;
        // Update live duration counter
        document.getElementById('live-duration').textContent = rideTime;
    }, 1000);
}
function pad(n) { return n < 10 ? '0'+n : n; }

// --- REPORT LOGIC ---
function generateReport() {
    sfxSuccess.play().catch(e => console.log("Audio blocked"));

    // Calc Current Ride Metrics
    const co2SavedGrams = totalDist * RATES.co2SavedPerKm;
    const moneySaved = totalDist * RATES.rupeePerKm;
    
    const iceSavedKg = (co2SavedGrams * RATES.icePerGramCO2) / 1000;
    const pizzaSlices = co2SavedGrams / RATES.pizzaGrams;
    const netflixHours = co2SavedGrams / RATES.netflixGrams;
    const jeansPercentRide = ((co2SavedGrams / 1000) / RATES.jeansKg) * 100;

    // Update Current Ride Report
    document.getElementById('ride-money').textContent = Math.round(moneySaved);
    document.getElementById('ride-ice').textContent = iceSavedKg.toFixed(2) + "kg";
    document.getElementById('ride-pizza').textContent = pizzaSlices.toFixed(1);
    document.getElementById('ride-netflix').textContent = netflixHours.toFixed(1) + "h";
    document.getElementById('ride-jeans').textContent = jeansPercentRide.toFixed(1) + "%";
    document.getElementById('ride-dist').textContent = totalDist.toFixed(2) + " KM";
    document.getElementById('ride-time').textContent = rideTime;

    // Update Lifetime Stats in localStorage
    updateLifetimeStats(totalDist, moneySaved, co2SavedGrams);

    // Switch to Report View
    mainPanel.classList.add('hidden');
    reportPanel.classList.remove('hidden');
    gpsStatus.textContent = "AUDIT COMPLETE";
}

function updateLifetimeStats(dist, money, co2) {
    let stats = JSON.parse(localStorage.getItem('arpan_stats'));
    
    stats.totalKm += dist;
    stats.totalRupees += money;
    stats.totalCo2 += co2;
    
    localStorage.setItem('arpan_stats', JSON.stringify(stats));
}

function displayLifetimeStats() {
    let stats = JSON.parse(localStorage.getItem('arpan_stats'));
    
    const totalCo2Grams = stats.totalCo2;
    const totalCo2Kg = totalCo2Grams / 1000;
    
    // Calculate lifetime metrics
    const lifetimeIce = (totalCo2Grams * RATES.icePerGramCO2) / 1000;
    const lifetimePizza = totalCo2Grams / RATES.pizzaGrams;
    const lifetimeNetflix = totalCo2Grams / RATES.netflixGrams;
    const lifetimeJeans = ((totalCo2Kg / RATES.jeansKg) * 100) % 100;
    
    // Forest Progress
    const treeCount = totalCo2Kg / RATES.treeKg;
    const forestProgressPercent = (treeCount / 10) * 100;
    
    // Update UI
    document.getElementById('lifetime-money').textContent = Math.floor(stats.totalRupees);
    document.getElementById('lifetime-ice').textContent = lifetimeIce.toFixed(2) + "kg";
    document.getElementById('lifetime-pizza').textContent = lifetimePizza.toFixed(1);
    document.getElementById('lifetime-netflix').textContent = lifetimeNetflix.toFixed(1) + "h";
    document.getElementById('lifetime-jeans').textContent = lifetimeJeans.toFixed(1) + "%";
    document.getElementById('forest-count').textContent = treeCount.toFixed(2);
    document.getElementById('forest-fill').style.width = Math.min(forestProgressPercent, 100) + "%";
}

function returnToMain() {
    sfxClick.play();
    mainPanel.classList.remove('hidden');
    reportPanel.classList.add('hidden');
    gpsStatus.textContent = "SYSTEM READY";
    
    // Hide live counters, show lifetime stats
    liveCounters.classList.add('hidden');
    lifetimeSection.classList.remove('hidden');
    
    // Refresh lifetime stats display
    displayLifetimeStats();
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
