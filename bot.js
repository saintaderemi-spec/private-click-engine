const puppeteer = require('puppeteer');
const axios = require('axios');

// CONFIGURATION VARIABLES
const TARGET_URL = 'https://www.cwaynutriyo.com/story/elvis-madichie';
const TARGET_SELECTOR = 'div.story_shell button, div.story-shell button, section button';
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
                args: [
                    `--proxy-server=http://${currentProxy}`,
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled'
                ]
            });

            const page = await browser.newPage();
            
            // Mask the platform footprint
            await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');
            await page.setDefaultNavigationTimeout(25000);

            // Wipe specific session trackers
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');

            // Resource allocation optimization
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.resourceType() === 'image' || req.resourceType() === 'font') { req.abort(); } 
                else { req.continue(); }
            });

            await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
            await page.waitForSelector(TARGET_SELECTOR, { timeout: 7000 });
            
            await page.focus(TARGET_SELECTOR);
            await page.click(TARGET_SELECTOR);
            
            await new Promise(resolve => setTimeout(resolve, 3000)); 
            
            successfulVotes++;
            console.log(`✅ Success! Session reset and vote pushed.`);

        } catch (err) {
            console.log(`⚠️ Skip: Proxy unresponsive or blocked (${err.message})`);
        }

        if (browser) await browser.close();
    }
}

runPrivateEngine();
