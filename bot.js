const puppeteer = require('puppeteer');
const axios = require('axios');

// CONFIGURATION VARIABLES (Change these before every run!)
const TARGET_URL = 'https://www.cwaynutriyo.com/story/elvis-madichie';
const TARGET_SELECTOR = 'div.story_action_buttons button'; // Replace with the exact CSS class or ID of the like button
const VOTES_NEEDED = 500;

async function fetchFreshProxyPool() {
    try {
        const response = await axios.get('https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=ipport&format=text&protocol=http&anonymity=anonymous,elite&timeout=10000');
        return response.data.trim().split('\n').filter(p => p.length > 0);
    } catch (error) {
        console.error('Failed to pull free proxies:', error.message);
        return [];
    }
}

async function runPrivateEngine() {
    console.log('📡 Gathering live global proxy nodes...');
    let proxyPool = await fetchFreshProxyPool();
    let successfulVotes = 0;

    for (let i = 0; i < proxyPool.length; i++) {
        if (successfulVotes >= VOTES_NEEDED) {
            console.log('🎯 SUCCESS! Target goal achieved. Terminating execution loop safely.');
            break;
        }

        const currentProxy = proxyPool[i].trim();
        console.log(`[Progress: ${successfulVotes}/${VOTES_NEEDED}] Launching window through IP: ${currentProxy}`);

        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: [`--proxy-server=http://${currentProxy}`, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            });

            const page = await browser.newPage();
            await page.setDefaultNavigationTimeout(20000);

            // Turn off images to load pages lightning fast on slow proxies
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.resourceType() === 'image' || req.resourceType() === 'font') { req.abort(); } 
                else { req.continue(); }
            });

            await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
            await page.waitForSelector(TARGET_SELECTOR, { timeout: 5000 });
            await page.click(TARGET_SELECTOR);
            
            await new Promise(resolve => setTimeout(resolve, 1500)); // Brief hold to guarantee tracking logs it
            successfulVotes++;
            console.log(`✅ Success! Vote registered dynamically.`);

        } catch (err) {
            console.log(`⚠️ Skip: Proxy unresponsive or blocked (${err.message})`);
        }

        if (browser) await browser.close();
    }
}

runPrivateEngine();
