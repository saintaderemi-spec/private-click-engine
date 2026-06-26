const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// CONFIGURATION VARIABLES
const TARGET_URL = 'https://www.cwaynutriyo.com/story/elvis-madichie';
const VOTES_NEEDED = 500;
const CONCURRENT_WORKERS = 3; // Number of continuous parallel windows
const CACHE_FILE = path.join(__dirname, 'used_proxies.json');

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
            console.log(`⚠️ Stream endpoint skipped: ${url.split('/')[2]} unavailable`);
        }
    }
    return [...new Set(combinedProxies.map(p => p.trim()).filter(p => p.length > 0))];
}

async function runPrivateEngine() {
    const usedProxies = loadUsedProxies();
    let proxyPool = await fetchFreshProxyPool();
    let successfulVotes = 0;

    console.log(`📊 History Filter: Loaded ${usedProxies.size} unique previously-burned IPs.`);
    console.log(`📶 Fresh Raw Pool: Fetched ${proxyPool.length} proxy nodes.`);

    // Filter out used proxies immediately before starting the workers
    let activeQueue = proxyPool.filter(proxy => !usedProxies.has(proxy));
    console.log(`⚡ Active Queue Size after filtering history: ${activeQueue.length}`);

    // Worker function that continuously pulls from the shared queue
    async function worker(workerId) {
        while (activeQueue.length > 0 && successfulVotes < VOTES_NEEDED) {
            const currentProxy = activeQueue.shift(); // Pull the next proxy out of the line
            if (!currentProxy) break;

            console.log(`[Worker ${workerId}] Launching window -> IP: ${currentProxy} (Progress: ${successfulVotes}/${VOTES_NEEDED})`);
            
            // Mark as used immediately and save to disk
            usedProxies.add(currentProxy);
            saveUsedProxies(usedProxies);

            let browser;
            try {
                browser = await puppeteer.launch({
                    headless: true,
                    args: [
                        `--proxy-server=http://${currentProxy}`,
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-blink-features=AutomationControlled',
                        '--disable-gpu',
                        '--no-zygote'
                    ]
                });

                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');
                
                // STABLE TIMEOUT: Raised back up to 22 seconds so slow proxies actually load
                await page.setDefaultNavigationTimeout(22000);

                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');
                await client.send('Network.clearBrowserCache');

                await page.setRequestInterception(true);
                page.on('request', (req) => {
                    if (['image', 'font', 'stylesheet'].includes(req.resourceType())) { req.abort(); } 
                    else { req.continue(); }
                });

                await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
                
                const buttonSelector = 'div.story-shell button, div.story_shell button, section button';
                await page.waitForSelector(buttonSelector, { timeout: 7000 });
                
                const buttons = await page.$$(buttonSelector);
                let clicked = false;
                for (const button of buttons) {
                    const text = await page.evaluate(el => el.textContent, button);
                    if (text && !text.includes('Watch')) {
                        await button.focus();
                        await button.click();
                        clicked = true;
                        break;
                    }
                }

                if (!clicked) { throw new Error("Target heart button missing."); }
                
                await new Promise(resolve => setTimeout(resolve, 3000)); 
                successfulVotes++;
                console.log(`[Worker ${workerId}] ✅ Success! Vote logged.`);

            } catch (err) {
                console.log(`[Worker ${workerId}] ⚠️ Skip: (${err.message})`);
            } finally {
                if (browser) await browser.close();
            }
        }
    }

    // Spin up independent workers that process the queue concurrently
    const workers = [];
    for (let w = 0; w < CONCURRENT_WORKERS; w++) {
        workers.push(worker(w + 1));
    }

    // Wait until all workers have completely emptied the queue
    await Promise.all(workers);
    
    saveUsedProxies(usedProxies);
    console.log('\n🎯 Target loop execution completed.');
}

runPrivateEngine();
