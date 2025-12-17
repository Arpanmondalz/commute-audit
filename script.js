// --- CONFIGURATION ---
const CONFIG = {
    roadCorrectionFactor: 1.3, // Est. road distance vs straight line
    minDistanceKm: 0.1         // Min distance to count as a ride
};

const RATES = {
    rupeePerKm: 3.0,
    co2SavedPerKm: 75,
    icePerGramCO2: 3,
    netflixGrams: 55,
    pizzaGrams: 300,
    jeansKg: 20,
    treeKg: 22
};

// --- STATE MANAGEMENT ---
// We do not "live" state variables. 
// Everything relies on what is in localStorage.

// Audio
const sfxStart = document.getElementById('sfx-start');
const sfxSuccess = document.getElementById('sfx-success');
const sfxClick = document.getElementById('sfx-click');

// DOM Elements
const btn = document.getElementById('action-btn');
const gpsStatus = document.getElementById('gps-status');
const mainPanel = document.getElementById('main-panel');
const reportPanel = document.getElementById('report-panel');
const liveCounters = document.getElementById('live-counters'); // Will be hidden mostly
const lifetimeSection = document.getElementById('lifetime-section');

// Modal Elements
const infoBtn = document.getElementById('info-btn');
const closeModalBtn = document.getElementById('close-modal');
const dataModal = document.getElementById('data-modal');
const logicList = document.getElementById('logic-list');

// --- INITIALIZATION ---

// 1. Setup Storage
if (!localStorage.getItem('arpan_stats')) {
    localStorage.setItem('arpan_stats', JSON.stringify({
        totalKm: 0,
        totalRupees: 0,
        totalCo2: 0
    }));
}

// 2. Load UI based on State
checkRideState(); 
displayLifetimeStats();
populateDataModal();

// 3. NFC Command Check (The "Toggle" Logic)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('action') === 'toggle') {
    console.log("NFC Command: Toggle");
    
    // Clean URL
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({path: newUrl}, '', newUrl);

    // Trigger Action
    setTimeout(() => {
        handleMainButtonClick();
    }, 800);
}

// --- EVENT LISTENERS ---
btn.addEventListener('click', handleMainButtonClick);

infoBtn.addEventListener('click', () => {
    sfxClick.play();
    dataModal.classList.remove('hidden');
});
closeModalBtn.addEventListener('click', () => {
    sfxClick.play();
    dataModal.classList.add('hidden');
});


// --- CORE LOGIC ---

function checkRideState() {
    const activeRide = localStorage.getItem('arpan_active_ride');
    
    if (activeRide) {
        // RIDE IS ACTIVE (User is currently riding)
        const rideData = JSON.parse(activeRide);
        
        // UI: Show "Stop" State
        btn.textContent = "TERMINATE RIDE";
        btn.classList.remove('start');
        btn.classList.add('stop');
        
        gpsStatus.textContent = "RIDE IN PROGRESS (PASSIVE)";
        gpsStatus.style.color = "var(--accent-green)";
        
        // Show start time instead of live counters
        const startDate = new Date(rideData.startTime);
        const timeStr = startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        liveCounters.classList.remove('hidden');
        lifetimeSection.classList.add('hidden');
        document.getElementById('live-distance').textContent = "--- KM";
        document.getElementById('live-duration').textContent = "STARTED: " + timeStr;

    } else {
        // IDLE STATE
        btn.textContent = "INITIATE RIDE";
        btn.classList.remove('stop');
        btn.classList.add('start');
        
        gpsStatus.textContent = "SYSTEM READY";
        gpsStatus.style.color = "var(--text-dim)";
        
        liveCounters.classList.add('hidden');
        lifetimeSection.classList.remove('hidden');
    }
}

function handleMainButtonClick() {
    const activeRide = localStorage.getItem('arpan_active_ride');
    
    if (!activeRide) {
        // START NEW RIDE
        sfxStart.play().catch(e => console.log("Audio blocked"));
        initiateRide();
    } else {
        // END CURRENT RIDE
        finalizeRide();
    }
}

function initiateRide() {
    if (!navigator.geolocation) {
        alert("GPS Error");
        return;
    }

    gpsStatus.textContent = "ACQUIRING ORBIT...";
    
    navigator.geolocation.getCurrentPosition((position) => {
        
        const accuracy = position.coords.accuracy;
        
        // SAFETY: Reject bad locks
        if(accuracy > 50) {
            alert(`GPS Accuracy too low (${Math.round(accuracy)}m). Move outside and try again.`);
            gpsStatus.textContent = "WEAK SIGNAL";
            return;
        }
        
        // SAFETY: Reject invalid coords
        if(position.coords.latitude === 0 && position.coords.longitude === 0) {
            alert("Invalid GPS Data. Try again outside.");
            return;
        }

        // 1. Save Start Data
        const startData = {
            startTime: new Date().getTime(),
            startLat: position.coords.latitude,
            startLon: position.coords.longitude
        };
        
        localStorage.setItem('arpan_active_ride', JSON.stringify(startData));
        
        // 2. Update UI
        checkRideState();
        gpsStatus.textContent = "ORBIT LOCKED ✓";
        
    }, (error) => {
        alert("GPS Lock Failed. Check settings.");
        gpsStatus.textContent = "GPS ERROR";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}



function finalizeRide() {
    gpsStatus.textContent = "TRIANGULATING ENDPOINT...";
    
    navigator.geolocation.getCurrentPosition((position) => {
        // 1. Get End Data
        const endLat = position.coords.latitude;
        const endLon = position.coords.longitude;
        const endTime = new Date().getTime();
        const accuracy = position.coords.accuracy; // meters
        
        // SAFETY: Check GPS Accuracy
        if(accuracy > 50) {
            alert(`GPS Accuracy too low (${Math.round(accuracy)}m). Move to open sky and try again.`);
            gpsStatus.textContent = "POOR SIGNAL - RETRY";
            return;
        }
        
        // 2. Retrieve Start Data
        const rideData = JSON.parse(localStorage.getItem('arpan_active_ride'));
        
        // 3. Calculate Physics
        const linearDist = calculateHaversine(rideData.startLat, rideData.startLon, endLat, endLon);
        const roadDist = linearDist * CONFIG.roadCorrectionFactor;
        
        // SAFETY: Minimum Distance Check (100m = 0.1km)
        if(roadDist < CONFIG.minDistanceKm) {
            const shouldCancel = confirm(`Distance too short (${(roadDist*1000).toFixed(0)}m). Likely GPS drift. Cancel ride?`);
            if(shouldCancel) {
                localStorage.removeItem('arpan_active_ride');
                checkRideState();
                return;
            }
        }
        
        // Time Calculation
        const durationMs = endTime - rideData.startTime;
        const mins = Math.floor(durationMs / 60000);
        const secs = Math.floor((durationMs % 60000) / 1000);
        const timeString = `${pad(mins)}:${pad(secs)}`;

        // 4. Generate Report
        generateReport(roadDist, timeString);
        
        // 5. Clear Active Ride (Reset State)
        localStorage.removeItem('arpan_active_ride');
        
        // Reset Button State
        btn.textContent = "INITIATE RIDE";
        btn.classList.remove('stop');
        btn.classList.add('start');

    }, (error) => {
        alert("Could not lock destination. Ride not saved.");
        gpsStatus.textContent = "GPS LOCK FAILED";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}


function generateReport(distKm, timeStr) {
    sfxSuccess.play().catch(e => console.log("Audio blocked"));

    // Calc Metrics
    const co2SavedGrams = distKm * RATES.co2SavedPerKm;
    const moneySaved = distKm * RATES.rupeePerKm;
    
    const iceSavedKg = (co2SavedGrams * RATES.icePerGramCO2) / 1000;
    const pizzaSlices = co2SavedGrams / RATES.pizzaGrams;
    const netflixHours = co2SavedGrams / RATES.netflixGrams;
    const jeansPercentRide = ((co2SavedGrams / 1000) / RATES.jeansKg) * 100;

    // Update Report UI
    document.getElementById('ride-money').textContent = Math.round(moneySaved);
    document.getElementById('ride-ice').textContent = iceSavedKg.toFixed(2) + "kg";
    document.getElementById('ride-pizza').textContent = pizzaSlices.toFixed(1);
    document.getElementById('ride-netflix').textContent = netflixHours.toFixed(1) + "h";
    document.getElementById('ride-jeans').textContent = jeansPercentRide.toFixed(1) + "%";
    
    document.getElementById('ride-dist').textContent = distKm.toFixed(2) + " KM";
    document.getElementById('ride-time').textContent = timeStr;

    // Update Lifetime Stats
    updateLifetimeStats(distKm, moneySaved, co2SavedGrams);

    // Show Report Screen
    mainPanel.classList.add('hidden');
    reportPanel.classList.remove('hidden');
    gpsStatus.textContent = "AUDIT COMPLETE";
}


// --- UTILITIES ---

function calculateHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth Radius km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
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
    
    // Refresh Stats
    checkRideState();
    displayLifetimeStats();
}

function pad(n) { return n < 10 ? '0'+n : n; }

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
