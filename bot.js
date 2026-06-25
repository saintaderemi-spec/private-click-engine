const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURATION VARIABLES (GENERIC STANDARD)
// ==========================================
const TARGET_URL = 'https://www.cwaynutriyo.com/api/vote';
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
    
    // Format cleanup: Strip protocols, remove duplicates, and filter non-proxy strings
    return [...new Set(combinedProxies
        .map(p => p.trim().replace(/^https?:\/\//i, ''))
        // 1. Keep lines that are not empty
        // 2. Drop lines that start with Markdown or text comments (#)
        // 3. Verify the line contains numbers (avoids string/text headers)
        // 4. Verify it has a colon separating IP and Port
        .filter(p => p.length > 0 && !p.startsWith('#') && /\d/.test(p) && p.includes(':'))
    )];
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
                       event: "vote_cast", 
campaign: "",
device: "mobile",
event: "vote_cast",
language: "en-US",
medium: "direct",
referrerHost: "",
sessionId: "4glmfuwckhvmqu2beka",
source: "direct",
targetId: "b0a496bb1f124a7c",
targetType: "story",
ts: 1782425843078,
url: "/story/elvis-madichie",
visitorType: "new" 
                    }, 
                    {
                        timeout: 12000, // Raised to 12s to help slow free proxies clear TLS handshakes
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
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
                    if (err.response.status === 407) {
                        console.log(`[Worker ${workerId}] 🔒 Proxy Requires Authentication (407) -> Skipping Node.`);
                    } else {
                        console.log(`[Worker ${workerId}] ⚠️ Endpoint Rejected Request: Status ${err.response.status}`);
                    }
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
