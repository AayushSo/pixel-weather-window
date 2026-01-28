const canvas = document.getElementById('pixel-canvas');
const ctx = canvas.getContext('2d');

let weather = { 
    clouds: 0, 
    windSpeed: 0, 
    loaded: false, 
    timezoneOffset: 0 // New: difference in seconds from UTC
};
let cloudOffset = 0;
// --- FPS CONTROL ---
let fps = 5; // Set to 12 or 15 for a retro feel
let fpsInterval = 1000 / fps;
let then = Date.now();

const stars = [];
const numStars = 100;

// Generate stars once at the start
for (let i = 0; i < numStars; i++) {
    stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * 170, // Keep stars above the grass line
        size: Math.random() > 0.8 ? 2 : 1 // Some stars are 2x2 pixels
    });
}

// --- 1. TIME & COLOR LOGIC ---

// Helper to blend two colors (Linear Interpolation)
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
    // 1. Get current UTC time
    const now = new Date();
    const utcTimestamp = now.getTime() + (now.getTimezoneOffset() * 60000);
    
    // 2. Add the city's offset (weather.timezoneOffset is in seconds, convert to ms)
    const localTime = new Date(utcTimestamp + (weather.timezoneOffset * 1000));
    
    // 3. Convert to decimal hours
    const hour = localTime.getHours() + localTime.getMinutes() / 60;

    const themes = [
        { hr: 0,  sky: "#05050a", grass: "#050d05", sun: false }, // Midnight
        { hr: 6.25,  sky: "#2c1647", grass: "#0d1a0d", sun: false },  // Pre-dawn
        { hr: 6.5, sky: "#ff7e5f", grass: "#228b22", sun: true }, // Sunrise
        { hr: 6.75, sky: "#87ceeb", grass: "#32cd32", sun: true },  // Mid-morning
        { hr: 13, sky: "#87ceeb", grass: "#32cd32", sun: true },  // Mid-afternoon
        { hr: 17.25, sky: "#87ceeb", grass: "#32cd32", sun: true },  // Evening
        { hr: 17.5, sky: "#feb47b", grass: "#228b22", sun: true }, // Sunset
        { hr: 17.75, sky: "#1a1a2e", grass: "#0d1a0d", sun: true }, // Early night
        { hr: 20, sky: "#1a1a2e", grass: "#0d1a0d", sun: false }, // Dusk
        { hr: 24, sky: "#05050a", grass: "#050d05", sun: false }  // Midnight end
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

async function searchCity(name) {
    try {
        showStatus("Searching...");
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${name}&count=1`);
        const data = await res.json();
        if (data.results) {
            const c = data.results[0];
            showStatus(`Success: ${c.name}`);
            fetchWeather(c.latitude, c.longitude);
        } else { showStatus("Not found", true); }
    } catch { showStatus("Error", true); }
}

async function fetchWeather(lat, lon) {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=cloud_cover,wind_speed_10m&timezone=auto`);
    const data = await res.json();
    
    weather = { 
        clouds: data.current.cloud_cover, 
        windSpeed: data.current.wind_speed_10m, 
        timezoneOffset: data.utc_offset_seconds, // Grab the offset
        loaded: true 
    };
}

// --- 3. DRAWING ENGINE ---

function draw() {
    requestAnimationFrame(draw);

    // --- FPS THROTTLE CHECK ---
    let now = Date.now();
    let elapsed = now - then;

    if (elapsed > fpsInterval) {
        // Adjust 'then' to maintain consistent speed
        then = now - (elapsed % fpsInterval);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const theme = getSkyTheme();

        if (!weather.loaded) {
            ctx.fillStyle = "#111";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            // 1. Draw Sky
            ctx.fillStyle = theme.sky;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (!theme.sunVisible) {
                ctx.fillStyle = "white";
                // We can even make them "twinkle" by using the theme.hour
                stars.forEach((star, index) => {
                    // Simple twinkle: hide a star occasionally based on index and time
                    if ((Math.sin(Date.now() * 0.001 + index) > -0.5)) {
                        ctx.fillRect(star.x, star.y, star.size, star.size);
                    }
                });
            }
            // 2. Solar Arc Math (Fixed for visibility)
            //const angle = ((theme.hour-6) / 24) * Math.PI * 2 ;
            //let angle_final = angle;
            //if (angle > Math.PI) let angle_final = angle - Math.PI  ;
            //const sunX = Math.cos(angle) * 150 + 20;
            //const sunY =  Math.sin(angle) * 120 ;
            //const sunX = 150 - Math.cos(angle_final) * 130 ;
            //const sunY = 150 - Math.sin(angle_final) * 100 ;
            let shiftedHour = (theme.hour - 6);
            if (shiftedHour < 0) shiftedHour += 24; // Handle hours before 6 AM

            // 2. Use modulo 12 so that 6 AM - 6 PM AND 6 PM - 6 AM both result in 0 - 12
            const cycleHour = shiftedHour % 12;

            // 3. Map 0-12 hours to 0 to PI (180 degrees)
            // At 0h (6 AM), angle is 0. At 6h (Noon), angle is PI/2. At 12h (6 PM), angle is PI.
            const angle_final = (cycleHour / 12) * Math.PI;

            // 4. Calculate Coordinates
            // We use canvas.width/2 to center it. 
            // We SUBTRACT Sin because in Canvas, Y increases as you go DOWN. 
            // To go UP into the sky, we need to subtract.
            const sunX = (canvas.width / 2) - Math.cos(angle_final) * 130;
            const sunY = 170 - Math.sin(angle_final) * 100; // 170 is the grass line
            ctx.fillStyle = theme.sunVisible ? "#FFD700" : "#F0EAD6";
            ctx.fillRect(sunX, sunY, 20, 20);

            // 3. Clouds
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            cloudOffset += (weather.windSpeed * 0.1); // Increased speed slightly for the 15fps look
            for (let i = 0; i < (weather.clouds / 10) + 1; i++) {
                let x = (i * 80 + cloudOffset) % (canvas.width + 60) - 60;
                ctx.fillRect(x, 50 + (i % 3 * 15), 40, 10);
            }

            // 4. Grass
            ctx.fillStyle = theme.grass;
            ctx.fillRect(0, 170, canvas.width, 30);
        }
        console.log("Local Hour at City:", theme.hour.toFixed(2), "Windspeed:", weather.windSpeed);
    }
}

document.getElementById('search-btn').addEventListener('click', () => {
    searchCity(document.getElementById('city-input').value);
});

// Start
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(p => fetchWeather(p.coords.latitude, p.coords.longitude), () => fetchWeather(51.5, 0));
}
draw();