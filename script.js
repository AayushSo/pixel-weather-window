const canvas = document.getElementById('pixel-canvas');
const ctx = canvas.getContext('2d');

let weather = { clouds: 0, windSpeed: 0, loaded: false, timezoneOffset: 0 };
let cloudOffset = 0;

// Auto scene

let currentScene = 'pasture';
let sceneObjects = []; // Will hold trees, buildings, etc.

const sceneConfig = {
    pasture: {
        groundHeight: 0.15, // 15% of screen
        colors: { day: "#228b22", night: "#050d05" },
        init: () => {
            // Generate Trees
            sceneObjects = [
                { x: canvas.width * 0.15, height: 25, type: 'tree' },
                { x: canvas.width * 0.80, height: 20, type: 'tree' }
            ];
        },
        draw: (ctx, groundY, theme) => {
            // Draw Trees
            sceneObjects.forEach(obj => drawTree(obj, groundY));
            // Draw Grass
            ctx.fillStyle = theme.ground;
            ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
        }
    },
    city: {
        groundHeight: 0.10, // 10% (Road)
        colors: { day: "#555555", night: "#111111" },
        init: () => {
            // Generate Skyline (Random Buildings)
            sceneObjects = [];
            let x = canvas.width/2;
            while (x < canvas.width) {
                const w = 25 + Math.random() * 30; // Slightly wider buildings for windows
                const h = 40 + Math.random() * 60; // Taller buildings
                sceneObjects.push({ x: x, w: w, h: h, type: 'building' });
                x += w - 2; // Overlap slightly (-2) to avoid gaps
            }
        },
        draw: (ctx, groundY, theme) => {
            // 1. Draw Buildings (Silhouettes)
            // Day: Dark Grey | Night: Black
            const bldgColor = theme.sunVisible ? "#2a2a2a" : "#050505";
            
            sceneObjects.forEach(b => {
                ctx.fillStyle = bldgColor;
                ctx.fillRect(b.x, groundY - b.h, b.w, b.h);
                
                // --- WINDOW GENERATION ---
                const winW = 4; // Window Width
                const winH = 6; // Window Height
                const gap = 4;  // Space between windows
                
                // Calculate columns and rows based on building size
                const cols = Math.floor((b.w - gap) / (winW + gap));
                const rows = Math.floor((b.h - gap) / (winH + gap));

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        
                        // Pseudo-random check: Should this window be lit?
                        // We use the coordinates to create a stable "random" pattern that doesn't flicker
                        const isLit = Math.sin(b.x * r * c) > 0.5; // 70% of lights on

                        // COLOR LOGIC
                        if (theme.sunVisible) {
                            // DAY: Windows reflect the sky (Use theme.sky)
                            ctx.fillStyle = theme.sky; 
                        } else {
                            // NIGHT: Lights are Yellow (if lit), otherwise dark grey
                            // We lower the opacity slightly so they aren't blindingly bright
                            ctx.fillStyle = isLit ? "#F0E68C" : "#1a1a1a"; 
                        }

                        // Coordinates for this specific window
                        const wx = b.x + gap + c * (winW + gap);
                        const wy = (groundY - b.h) + gap + r * (winH + gap);

                        // Draw Window Pane
                        ctx.fillRect(wx, wy, winW, winH);

                        // DRAW GLEAM (The shiny glass reflection)
                        // A simple diagonal white line with transparency
                        if (theme.sunVisible || isLit) {
                            ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
                            ctx.fillRect(wx, wy, 1, 1);       // Top-left pixel
                            ctx.fillRect(wx + 1, wy + 1, 1, 1); // Diagonal pixel
                        }
                    }
                }
            });

            // 2. Draw Road
            ctx.fillStyle = theme.ground;
            ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
        }
    },
    beach: {
        groundHeight: 0.25, // More ground (Sand + Water)
        colors: { day: "#eecfa1", night: "#4b3d2a" }, // Sand colors
        init: () => {
            // Single Palm Tree
            sceneObjects = [{ x: canvas.width * 0.7, height: 40, type: 'palm' }];
        },
        draw: (ctx, groundY, theme) => {
            // Draw Ocean (Horizon line)
            const waterColor = theme.sunVisible ? "#1da2d8" : "#0f2d40";
            ctx.fillStyle = waterColor;
            ctx.fillRect(0, groundY - 10, canvas.width, 10); // Water strip above sand
            
            // Draw Palm Tree (Reuse tree logic or custom)
            sceneObjects.forEach(obj => drawTree(obj, groundY)); // Use basic tree for now or tweak
            
            // Draw Sand
            ctx.fillStyle = theme.ground;
            ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
        }
    }
};
// --- DYNAMIC RESOLUTION SETTINGS ---
const pixelScale = 4; 

function resize() {
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    // Set "internal" resolution (e.g., 1000px screen becomes 250px canvas)
    canvas.width = Math.ceil(displayWidth / pixelScale);
    canvas.height = Math.ceil(displayHeight / pixelScale);
    
    initStars(); 
    sceneConfig[currentScene].init();
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

    // --- EXPANDED THEMES ARRAY ---
    // We add "guard rows" (e.g., 5.0 and 7.0) to lock colors in place
    // so they don't fade continuously.
    const themes = [
        { hr: 0,   sky: "#05050a", sun: false }, // Midnight (Dark)
        { hr: 5,   sky: "#05050a", sun: false }, // 5 AM (Still Dark - No change since midnight)
        { hr: 6,   sky: "#ff7e5f", sun: true },  // 6 AM (Sunrise - Orange)
        { hr: 7,   sky: "#87ceeb", sun: true },  // 7 AM (Day Blue - Rapid fade from Orange)
        { hr: 12,  sky: "#87ceeb", sun: true },  // Noon (Day Blue - No change since 7 AM)
        { hr: 17,  sky: "#87ceeb", sun: true },  // 5 PM (Day Blue - Start of sunset soon)
        { hr: 18,  sky: "#feb47b", sun: true },  // 6 PM (Sunset - Orange)
        { hr: 19,  sky: "#05050a", sun: false }, // 7 PM (Night - Rapid fade to Dark)
        { hr: 24,  sky: "#05050a", sun: false }  // Midnight (Dark)
    ];

    // Find the correct time slot
    let i = 0;
    while (i < themes.length - 1 && hour > themes[i + 1].hr) i++;
    const start = themes[i];
    const end = themes[i + 1];
    
    // Calculate progress between these two specific timestamps
    const factor = (hour - start.hr) / (end.hr - start.hr);

    // 1. GET CURRENT SCENE DATA
    const sceneColors = sceneConfig[currentScene].colors;

    let theme = {
        sky: lerpColor(start.sky, end.sky, factor),
        
        // 2. DYNAMIC GROUND COLOR
        // Use Day color if sun is visible, otherwise Night color
        ground: start.sun ? sceneColors.day : sceneColors.night,
        
        sunVisible: start.sun,
        hour: hour,
        overcast: false
    };

    // 3. WEATHER OVERRIDES
    if (weather.isRaining || weather.isSnowing) {
        theme.sky = "#4a525a";      // Slate Grey Sky
        theme.ground = sceneColors.night; // Wet/Dark ground
        theme.overcast = true;      // Hide sun/moon
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
        const groundHeight = canvas.height * sceneConfig[currentScene].groundHeight;
        const groundY = canvas.height - groundHeight;
            
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
            
            // 5. DRAW SCENE (Delegated)
            
            // Pass control to the specific scene renderer
            sceneConfig[currentScene].draw(ctx, groundY, theme);
            
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
document.getElementById('scene-select').addEventListener('change', (e) => {
    currentScene = e.target.value;
    resize(); // Trigger regeneration of objects (stars/buildings)
});

// --- SHARE BUTTON LOGIC ---
document.getElementById('share-btn').addEventListener('click', async () => {
    // 1. Get the current city name if available
    const statusText = document.getElementById('status-msg').innerText;
    let shareText = "Check out this Pixel Weather Window!";
    
    // If we have a city loaded, use it
    if (statusText.includes("Success:")) {
        const city = statusText.replace("Success: ", "");
        shareText = `Check out the current weather in ${city} in pixel art!`;
    }

    const shareData = {
        title: 'Pixel Weather Window',
        text: shareText,
        url: window.location.href
    };

    // 2. Try native Share (Mobile/Tablets)
    if (navigator.share) {
        try {
            await navigator.share(shareData);
            return; // If share works, stop here
        } catch (err) {
            console.log('Share canceled or failed, trying clipboard...', err);
            // If share fails, fall through to clipboard logic below
        }
    }

    // 3. Clipboard Logic (Desktop/Fallback)
    try {
        // Method A: Modern API (Requires HTTPS)
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(window.location.href);
        } else {
            throw new Error("Clipboard API unavailable");
        }
    } catch (err) {
        // Method B: Legacy Fallback (Works on HTTP/Older browsers)
        const textArea = document.createElement("textarea");
        textArea.value = window.location.href;
        
        // Ensure it's not visible but part of the DOM
        textArea.style.position = "fixed"; 
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy'); 
        } catch (e) {
            alert("Could not copy link automatically. Please copy from the address bar.");
            document.body.removeChild(textArea);
            return;
        }
        document.body.removeChild(textArea);
    }

    // 4. Visual Feedback (Show ✅)
    const btn = document.getElementById('share-btn');
    const originalText = btn.innerText;
    btn.innerText = "✅";
    setTimeout(() => btn.innerText = originalText, 2000);
});

// START
// FORCE UI SYNC: Ensure the dropdown matches the default 'pasture' variable
document.getElementById('scene-select').value = currentScene;
resize(); // Call resize immediately to set initial vars
if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(p => fetchWeather(p.coords.latitude, p.coords.longitude), 
    () => fetchWeather(51.5, -0.11));
} else { fetchWeather(51.5, -0.11); }

draw();