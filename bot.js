const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// CONFIGURATION VARIABLES
const TARGET_URL = 'https://www.cwaynutriyo.com/story/elvis-madichie';
const VOTES_NEEDED = 600;
const CACHE_FILE = path.join(__dirname, 'used_proxies.json');

// Helper to load previously used IPs from the GitHub Actions cache
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

// Helper to save used IPs back to the cache file
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
        'https://raw.githubusercontent.com/Fate0/proxylist/master/proxy.list'
    ];

    let combinedProxies = [];

    for (const url of urls) {
        try {
            const response = await axios.get(url, { timeout: 8000 });
            let lines = [];
            
            // Handle JSON-lines format vs standard plain-text raw lists
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

    // Clean formatting and remove duplicates within the current pull
    return [...new Set(combinedProxies.map(p => p.trim()).filter(p => p.length > 0))];
}

async function runPrivateEngine() {
    const usedProxies = loadUsedProxies();
    let proxyPool = await fetchFreshProxyPool();
    let successfulVotes = 0;

    console.log(`📊 History Filter: Loaded ${usedProxies.size} unique previously-burned IPs.`);
    console.log(`📶 Fresh Raw Pool: Fetched ${proxyPool.length} proxy nodes.`);

    for (let i = 0; i < proxyPool.length; i++) {
        if (successfulVotes >= VOTES_NEEDED) {
            console.log('🎯 SUCCESS! Target goal achieved. Terminating execution loop safely.');
            break;
        }

        const currentProxy = proxyPool[i];

        // DEDUPLICATION CHECK: Skip immediately if we used this node in an older run
        if (usedProxies.has(currentProxy)) {
            continue;
        }

        console.log(`[Progress: ${successfulVotes}/${VOTES_NEEDED}] Launching window through IP: ${currentProxy}`);
        usedProxies.add(currentProxy);
        saveUsedProxies(usedProxies); // Instantly write state to prevent overlapping data losses

        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: [
                    `--proxy-server=http://${currentProxy}`,
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled'
                ]
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');
            await page.setDefaultNavigationTimeout(25000);

            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');

            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.resourceType() === 'image' || req.resourceType() === 'font') { req.abort(); } 
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
            console.log(`✅ Success! Unique session vote pushed successfully.`);

        } catch (err) {
            console.log(`⚠️ Skip: Proxy unresponsive or element blocked (${err.message})`);
        }

        if (browser) await browser.close();
    }
    
    // Final state preservation pass at workflow tear-down
    saveUsedProxies(usedProxies);
}

runPrivateEngine();
