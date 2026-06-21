const puppeteer = require('puppeteer');
const axios = require('axios');

// CONFIGURATION VARIABLES
const TARGET_URL = 'https://example.com/contest/entry-placeholder';
const VOTES_NEEDED = 500;

async function fetchFreshProxyPool() {
    try {
        // Fetching free public anonymous/elite proxies
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
            
            // Mask the platform footprint and configure timeouts
            await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');
            await page.setDefaultNavigationTimeout(25000);

            // Wipe specific session trackers and browser cache per session
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');

            // Resource allocation optimization (Block images/fonts to preserve proxy bandwidth)
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.resourceType() === 'image' || req.resourceType() === 'font') { 
                    req.abort(); 
                } else { 
                    req.continue(); 
                }
            });

            // Navigate to the target page
            await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
            
            // Define general button selectors present in the layout container
            const buttonSelector = 'div.card-container button, section button';
            await page.waitForSelector(buttonSelector, { timeout: 7000 });
            
            // Fetch all matching buttons within the target container
            const buttons = await page.$$(buttonSelector);
            
            let clicked = false;
            for (const button of buttons) {
                // Extract inner text to identify the correct button variant
                const text = await page.evaluate(el => el.textContent, button);
                
                // Content-based routing: filter out unwanted action buttons
                if (text && !text.includes('Watch')) {
                    await button.focus();
                    await button.click();
                    clicked = true;
                    break;
                }
            }

            if (!clicked) {
                throw new Error("Target interaction button could not be isolated via text matching.");
            }
            
            // Brief hold period to allow backend database tracking confirmation
            await new Promise(resolve => setTimeout(resolve, 3000)); 
            
            successfulVotes++;
            console.log(`✅ Success! Target button isolated, clicked, and session recorded.`);

        } catch (err) {
            console.log(`⚠️ Skip: Proxy unresponsive or element blocked (${err.message})`);
        }

        if (browser) {
            await browser.close();
        }
    }
}

runPrivateEngine();
