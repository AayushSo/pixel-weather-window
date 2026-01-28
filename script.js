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
const particles = [];

// Create 100 particles for reuse
for(let i=0; i<100; i++) {
    particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        speed: 2 + Math.random() * 3, // Random fall speed
        wobble: Math.random() * Math.PI * 2
    });
}
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

    let theme = {
        sky: lerpColor(start.sky, end.sky, factor),
        grass: lerpColor(start.grass, end.grass, factor),
        sunVisible: start.sun,
        hour: hour
    };
    // --- OVERCAST OVERRIDE ---
    theme.overcast = false; // Default to clear skies
    // --- OVERCAST OVERRIDE ---
    if (weather.isRaining || weather.isSnowing) {
        theme.sky = "#4a525a";      // Slate Grey Sky
        theme.grass = "#1e2b1e";    // Darker/Wet Grass
        theme.overcast = true;      // New Flag: It's cloudy!
        // REMOVED: theme.sunVisible = false; <--- This was causing the bug
    }

    return theme;
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
    // Added 'weather_code' to the requested parameters
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=cloud_cover,wind_speed_10m,weather_code&timezone=auto`);
    const data = await res.json();
    
    const code = data.current.weather_code;

    weather = { 
        clouds: data.current.cloud_cover, 
        windSpeed: data.current.wind_speed_10m, 
        timezoneOffset: data.utc_offset_seconds,
        // WMO Codes: 51-67 (Rain), 71-77 (Snow), 80-82 (Showers), 85-86 (Snow Showers), 95+ (Thunderstorm)
        isRaining: (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95),
        isSnowing: (code >= 71 && code <= 77) || (code >= 85 && code <= 86),
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

            // ... inside draw(), replace sections 2 and 3 with this:

            // 2. Stars (behind everything)
            // Draw only if it is Night AND NOT Overcast
            if (!theme.sunVisible && !theme.overcast) {
                ctx.fillStyle = "white";
                stars.forEach((star, index) => {
                    if(star.y < groundY) { 
                        if ((Math.sin(Date.now() * 0.001 + index) > -0.5)) {
                            ctx.fillRect(star.x, star.y, star.size, star.size);
                        }
                    }
                });
            }

            // 3. Sun/Moon Arc
            // Draw only if Sky is Clear (Not Overcast)
            if (!theme.overcast) {
                // We use relative radius based on screen width
                const arcRadiusX = canvas.width * 0.4;
                const arcRadiusY = canvas.height * 0.5;

                let shiftedHour = (theme.hour - 6);
                if (shiftedHour < 0) shiftedHour += 24;
                const cycleHour = shiftedHour % 12;
                const angle = (cycleHour / 12) * Math.PI;

                const sunX = (canvas.width / 2) - Math.cos(angle) * arcRadiusX;
                const sunY = groundY - Math.sin(angle) * arcRadiusY; 

                // If sunVisible is true (Day), draw Gold Sun. If false (Night), draw Pale Moon.
                ctx.fillStyle = theme.sunVisible ? "#FFD700" : "#F0EAD6";
                ctx.fillRect(sunX, sunY, sunSize, sunSize); 
            }

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
            
            // 7. WEATHER PARTICLES (RAIN/SNOW)
            if (weather.isRaining || weather.isSnowing) {
                ctx.lineWidth = 1;
                
                particles.forEach(p => {
                    if (weather.isRaining) {
                        // Rain: Fast, blue, slanted lines
                        ctx.strokeStyle = "rgba(170, 190, 220, 0.6)";
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p.x - 1, p.y + 4); // Slant left
                        ctx.stroke();
                        p.y += p.speed * 1.5; // Rain falls fast
                    } else if (weather.isSnowing) {
                        // Snow: Slow, white, wobbling pixels
                        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                        // Math.sin creates the gentle left-right wobble
                        let wobbleX = p.x + Math.sin(Date.now() * 0.002 + p.wobble) * 3;
                        ctx.fillRect(wobbleX, p.y, 2, 2);
                        p.y += p.speed * 0.3; // Snow falls slow
                    }

                    // Loop particles when they hit the bottom
                    if (p.y > canvas.height) {
                        p.y = -5;
                        p.x = Math.random() * canvas.width;
                    }
                });
            }
            console.log("Local Hour at City:", theme.hour.toFixed(2),`and ${weather.windSpeed}km/h wind.` );
            //console.log(`Drawn with ${cloudCover}% clouds and ${windSpeed}km/h wind.`);
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

// --- SHARE BUTTON LOGIC ---
document.getElementById('share-btn').addEventListener('click', async () => {
    // 1. Get the current city name if available
    const statusText = document.getElementById('status-msg').innerText;
    let shareText = "Check out this Pixel Weather Window!";
    
    // If we have a city loaded (e.g., "Success: Tokyo, JP"), use it
    if (statusText.includes("Success:")) {
        const city = statusText.replace("Success: ", "");
        shareText = `Check out the current weather in ${city} in pixel art!`;
    }

    const shareData = {
        title: 'Pixel Weather Window',
        text: shareText,
        url: window.location.href // The link to your GitHub page
    };

    // 2. Try to use the native "Share" menu (Mobile/Modern Browsers)
    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            console.log('Share canceled:', err);
        }
    } else {
        // 3. Fallback for Desktop: Copy URL to clipboard
        try {
            await navigator.clipboard.writeText(window.location.href);
            // Temporarily change button text to show success
            const btn = document.getElementById('share-btn');
            const originalText = btn.innerText;
            btn.innerText = "✅";
            setTimeout(() => btn.innerText = originalText, 2000);
        } catch (err) {
            alert("Could not copy link. Manually copy the URL from the bar!");
        }
    }
});

// START
resize(); // Call resize immediately to set initial vars
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(p => fetchWeather(p.coords.latitude, p.coords.longitude), 
    () => fetchWeather(51.5, -0.11));
} else { fetchWeather(51.5, -0.11); }

draw();