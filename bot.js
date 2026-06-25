const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURATION VARIABLES (GENERIC STANDARD)
// ==========================================
const TARGET_URL = 'https://www.cwaynutriyo.com/story/elvis-madichie';
const RUN_LIMIT_COUNT = 1000;          // Total successful actions needed
const CONCURRENT_WORKERS = 3;        // Number of parallel workers
const CACHE_FILE = path.join(__dirname, 'used_proxies.json');

// ==========================================
// CACHE MANAGEMENT LAYER
// ==========================================
function loadUsedProxies() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE, 'utf8');
            return new Set(JSON.parse(data));
        }
    } catch (e) {
        console.log('ℹ️ Starting with a clean proxy history registry.');
    }
    return new Set();
}

function saveUsedProxies(usedSet) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify([...usedSet]), 'utf8');
    } catch (e) {
        console.error('Failed to write proxy cache file:', e.message);
    }
}

// ==========================================
// DATA ACQUISITION LAYER
// ==========================================
async function fetchFreshProxyPool() {
    console.log('📡 Aggregating proxy streams from multiple global endpoints...');
    const urls = [
        'https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=ipport&format=text&protocol=http&anonymity=anonymous,elite&timeout=10000',
        'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
        'https://raw.githubusercontent.com/Fate0/proxylist/master/proxy.list',
        'https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/http_elite.txt',
        'https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/http/data.txt',
        'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
        'https://api.openproxylist.xyz/http.txt'
    ];

    let combinedProxies = [];
    for (const url of urls) {
        try {
            const response = await axios.get(url, { timeout: 8000 });
            let lines = [];
            
            if (url.includes('proxy.list')) {
                lines = response.data.trim().split('\n').map(line => {
                    try {
                        const obj = JSON.parse(line);
                        return `${obj.host}:${obj.port}`;
                    } catch { return null; }
                }).filter(Boolean);
            } else {
                lines = response.data.trim().split('\n');
            }
            combinedProxies = combinedProxies.concat(lines);
        } catch (error) {
            console.log(`⚠️ Stream endpoint skipped: ${url.split('/')[2] || 'Host'} unavailable`);
        }
    }
    
    // Format cleanup: Strip protocols and remove duplicates
    return [...new Set(combinedProxies.map(p => p.trim().replace(/^https?:\/\//i, '')).filter(p => p.length > 0))];
}

// ==========================================
// CORE EXECUTION ENGINE
// ==========================================
async function startNetworkEngine() {
    // Correctly load tracking states at initialization
    const usedProxies = loadUsedProxies();
    const rawPool = await fetchFreshProxyPool();
    let successfulCount = 0;

    console.log(`\n📊 History Filter: Loaded ${usedProxies.size} unique previously-used entries.`);
    console.log(`📶 Fresh Raw Pool: Fetched ${rawPool.length} network targets.`);

    // Apply history filter to clean the active tracking line
    let activeQueue = rawPool.filter(proxy => !usedProxies.has(proxy));
    console.log(`⚡ Active Queue Size after history purge: ${activeQueue.length}\n`);

    // Worker Definition
    async function worker(workerId) {
        while (activeQueue.length > 0 && successfulCount < RUN_LIMIT_COUNT) {
            const currentProxy = activeQueue.shift();
            if (!currentProxy) break;

            console.log(`[Worker ${workerId}] Processing with Proxy -> ${currentProxy} (Progress: ${successfulCount}/${RUN_LIMIT_COUNT})`);
            
            // Instantly flag and commit changes to disk to guarantee cache integrity
            usedProxies.add(currentProxy);
            saveUsedProxies(usedProxies);

            const [host, port] = currentProxy.split(':');

            try {
                // Execute low-level direct data transport block using the proxy coordinate socket
                const response = await axios.post(TARGET_URL, 
                    {
                        testId: 'generic_payload_data'
                    }, 
                    {
                        timeout: 6000, 
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        proxy: {
                            protocol: 'http',
                            host: host,
                            port: parseInt(port, 10)
                        }
                    }
                );

                if (response.status === 200 || response.status === 201) {
                    successfulCount++;
                    console.log(`[Worker ${workerId}] ✅ Success! Response Code: ${response.status}`);
                }

            } catch (err) {
                if (err.response) {
                    console.log(`[Worker ${workerId}] ⚠️ Endpoint Rejected Request: Status ${err.response.status}`);
                } else {
                    console.log(`[Worker ${workerId}] ❌ Connection Dropped/Timed Out: ${err.message}`);
                }
            }
        }
    }

    // Allocate thread-like tracks based on configuration capacity limits
    const workers = [];
    for (let w = 0; w < CONCURRENT_WORKERS; w++) {
        workers.push(worker(w + 1));
    }

    // Securely await the complete resolution of all active execution tracks
    await Promise.all(workers);
    
    // Final save safeguard sync before exiting
    saveUsedProxies(usedProxies);
    console.log('\n🎯 High-velocity processing queue completed.');
}

// Fire execution
startNetworkEngine();
