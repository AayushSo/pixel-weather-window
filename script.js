const canvas = document.getElementById('pixel-canvas');
const ctx = canvas.getContext('2d');

let weather = { clouds: 0, windSpeed: 0, loaded: false, timezoneOffset: 0 };
let cloudOffset = 0;

// --- DYNAMIC RESOLUTION SETTINGS ---
const pixelScale = 4; 

function resize() {
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    // Set "internal" resolution (e.g., 1000px screen becomes 250px canvas)
    canvas.width = Math.ceil(displayWidth / pixelScale);
    canvas.height = Math.ceil(displayHeight / pixelScale);
    
    initStars(); 
}
window.addEventListener('resize', resize);

// --- FPS CONTROL ---
let fps = 15; 
let fpsInterval = 1000 / fps;
let then = Date.now();

// --- STARS & TREES SETUP ---
let stars = [];
let trees = []; // New: Array to hold tree positions

function initStars() {
    stars = [];
    // Grass is always bottom 15% of screen
    const horizon = canvas.height * 0.85; 
    
    // Generate Stars
    for (let i = 0; i < 50; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * horizon, 
            size: Math.random() > 0.8 ? 2 : 1 
        });
    }

    // Generate Trees (Fixed positions relative to screen width)
    trees = [
        { x: canvas.width * 0.15, height: 25, type: 'oak' }, // Left tree
        { x: canvas.width * 0.80, height: 20, type: 'pine' } // Right tree
    ];
}

// --- TREE RENDERER ---
function drawTree(t, groundY) {
    // Calculate Sway: Sine wave over time * wind speed
    // We divide windSpeed by 10 to keep it gentle
    const sway = Math.sin(Date.now() / 500) * (weather.windSpeed * 0.1);

    // 1. Trunk (Rooted to ground)
    ctx.fillStyle = "#4a3c31"; 
    ctx.fillRect(t.x, groundY - t.height, 4, t.height);

    // 2. Leaves (Swaying)
    ctx.fillStyle = (weather.isSnowing) ? "#dff" : "#1e4d2b"; // Snowy or Green?
    
    // Draw a simple block of leaves that moves with 'sway'
    const leafWidth = 20;
    const leafHeight = 16;
    const leafX = t.x - (leafWidth / 2) + 2 + sway; // Center leaves on trunk + sway
    const leafY = groundY - t.height - leafHeight + 4; // Sit on top of trunk

    ctx.fillRect(leafX, leafY, leafWidth, leafHeight);
    
    // Optional: Add a "highlight" pixel on the leaves for depth
    ctx.fillStyle = (weather.isSnowing) ? "white" : "#2d6e3e";
    ctx.fillRect(leafX + 2, leafY + 2, 4, 4);
}

// --- COLOR & TIME LOGIC ---
function lerpColor(color1, color2, factor) {
    const r1 = parseInt(color1.substring(1, 3), 16);
    const g1 = parseInt(color1.substring(3, 5), 16);
    const b1 = parseInt(color1.substring(5, 7), 16);

    const r2 = parseInt(color2.substring(1, 3), 16);
    const g2 = parseInt(color2.substring(3, 5), 16);
    const b2 = parseInt(color2.substring(5, 7), 16);

    const r = Math.round(r1 + factor * (r2 - r1));
    const g = Math.round(g1 + factor * (g2 - g1));
    const b = Math.round(b1 + factor * (b2 - b1));
    return `rgb(${r}, ${g}, ${b})`;
}

function getSkyTheme() {
    const now = new Date();
    const utcTimestamp = now.getTime() + (now.getTimezoneOffset() * 60000);
    const localTime = new Date(utcTimestamp + (weather.timezoneOffset * 1000));
    const hour = localTime.getHours() + localTime.getMinutes() / 60;

    const themes = [
        { hr: 0,   sky: "#05050a", grass: "#050d05", sun: false },
        { hr: 6,   sky: "#ff7e5f", grass: "#228b22", sun: true },
        { hr: 12,  sky: "#87ceeb", grass: "#32cd32", sun: true },
        { hr: 18,  sky: "#feb47b", grass: "#228b22", sun: true },
        { hr: 24,  sky: "#05050a", grass: "#050d05", sun: false }
    ];

    let i = 0;
    while (i < themes.length - 1 && hour > themes[i + 1].hr) i++;
    const start = themes[i];
    const end = themes[i + 1];
    const factor = (hour - start.hr) / (end.hr - start.hr);

    return {
        sky: lerpColor(start.sky, end.sky, factor),
        grass: lerpColor(start.grass, end.grass, factor),
        sunVisible: start.sun,
        hour: hour
    };
}
// --- 2. SEARCH & WEATHER ---

const cityInput = document.getElementById('city-input');
const searchBtn = document.getElementById('search-btn');
const statusMsg = document.getElementById('status-msg');
const menuToggle = document.getElementById('menu-toggle');
const searchBox = document.getElementById('search-box');

// Fix: Explicitly handle Enter key on the input field
cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); // Stop page from refreshing
        searchCity(cityInput.value);
    }
});

searchBtn.addEventListener('click', () => searchCity(cityInput.value));
menuToggle.addEventListener('click', () => searchBox.classList.toggle('hidden'));

function showStatus(text, isError = false) {
    statusMsg.innerText = text;
    statusMsg.className = isError ? "error-text" : "";
}



// --- API FETCHING ---
async function searchCity(name) {
    if(!name) return;
    document.getElementById('status-msg').innerText = "Searching...";
    try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${name}&count=1`);
        const data = await res.json();
        if (data.results) {
            const c = data.results[0];
            document.getElementById('status-msg').innerText = `Success: ${c.name}, ${c.country}`;
            fetchWeather(c.latitude, c.longitude);
        }
    } catch { document.getElementById('status-msg').innerText = "Error"; }
}

async function fetchWeather(lat, lon) {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=cloud_cover,wind_speed_10m&timezone=auto`);
    const data = await res.json();
    weather = { 
        clouds: data.current.cloud_cover, 
        windSpeed: data.current.wind_speed_10m, 
        timezoneOffset: data.utc_offset_seconds,
        loaded: true 
    };
}

// --- DRAW LOOP ---
function draw() {
    requestAnimationFrame(draw);

    let now = Date.now();
    let elapsed = now - then;

    if (elapsed > fpsInterval) {
        then = now - (elapsed % fpsInterval);

        // DYNAMIC SIZING CALCULATIONS
        const grassHeight = canvas.height * 0.15; // Grass is 15% of screen
        const groundY = canvas.height - grassHeight;
        
        // Sun Size: 5% of width, but capped between 8px and 30px
        const sunSize = Math.max(8, Math.min(canvas.width * 0.05, 30));

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const theme = getSkyTheme();

        if (weather.loaded) {
            // 1. Sky
            ctx.fillStyle = theme.sky;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 2. Stars (behind everything)
            if (!theme.sunVisible) {
                ctx.fillStyle = "white";
                stars.forEach((star, index) => {
                     // Check if star is above ground
                    if(star.y < groundY) { 
                        if ((Math.sin(Date.now() * 0.001 + index) > -0.5)) {
                            ctx.fillRect(star.x, star.y, star.size, star.size);
                        }
                    }
                });
            }

            // 3. Sun/Moon Arc
            // We use relative radius based on screen width
            const arcRadiusX = canvas.width * 0.4;
            const arcRadiusY = canvas.height * 0.5;

            let shiftedHour = (theme.hour - 6);
            if (shiftedHour < 0) shiftedHour += 24;
            const cycleHour = shiftedHour % 12;
            const angle = (cycleHour / 12) * Math.PI;

            const sunX = (canvas.width / 2) - Math.cos(angle) * arcRadiusX;
            const sunY = groundY - Math.sin(angle) * arcRadiusY; 

            ctx.fillStyle = theme.sunVisible ? "#FFD700" : "#F0EAD6";
            ctx.fillRect(sunX, sunY, sunSize, sunSize); // Uses dynamic size

            // 4. Clouds
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            cloudOffset += (weather.windSpeed * 0.1);
            const numClouds = Math.floor(canvas.width / 40) + 1; // Density based on width
            for (let i = 0; i < numClouds; i++) {
                let x = (i * (canvas.width/numClouds) * 1.5 + cloudOffset) % (canvas.width + 60) - 60;
                let y = (canvas.height * 0.1) + (i % 3 * 15);
                ctx.fillRect(x, y, 40, 10);
            }
            
            // 5. Trees (Behind grass logic or in front?)
            // We draw trees at the specific ground Y
            trees.forEach(tree => drawTree(tree, groundY));

            // 6. Grass
            ctx.fillStyle = theme.grass;
            ctx.fillRect(0, groundY, canvas.width, grassHeight);
            
        } else {
            // Loading Screen
            ctx.fillStyle = "#111";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "white";
            ctx.fillText("WAITING FOR SATELLITE...", 10, 20);
        }
    }
}

// EVENTS
document.getElementById('search-btn').addEventListener('click', () => {
    searchCity(document.getElementById('city-input').value);
});
document.getElementById('city-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchCity(e.target.value);
});

// START
resize(); // Call resize immediately to set initial vars
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(p => fetchWeather(p.coords.latitude, p.coords.longitude), 
    () => fetchWeather(51.5, -0.11));
} else { fetchWeather(51.5, -0.11); }

draw();