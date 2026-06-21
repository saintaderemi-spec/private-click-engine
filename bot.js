const puppeteer = require('puppeteer');
const axios = require('axios');

// CONFIGURATION VARIABLES
const TARGET_URL = 'https://www.cwaynutriyo.com/story/elvis-madichie';
const VOTES_NEEDED = 500;

async function fetchFreshProxyPool() {
    try {
        // Fetching high-quality free anonymous/elite proxies
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
            
            // Mask the browser fingerprint as a mobile device
            await page.setUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36');
            await page.setDefaultNavigationTimeout(25000);

            // Wipe cookies and cache to ensure every proxy counts as a brand-new session
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');

            // Block heavy images and fonts to save proxy bandwidth and load fast
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.resourceType() === 'image' || req.resourceType() === 'font') { 
                    req.abort(); 
                } else { 
                    req.continue(); 
                }
            });

            // Navigate to Elvis's story page
            await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
            
            // Look for buttons inside the story card shell container
            const buttonSelector = 'div.story-shell button, div.story_shell button, section button';
            await page.waitForSelector(buttonSelector, { timeout: 7000 });
            
            // Grab all elements inside that container
            const buttons = await page.$$(buttonSelector);
            
            let clicked = false;
            for (const button of buttons) {
                // Read the actual text inside the button
                const text = await page.evaluate(el => el.textContent, button);
                
                // CRITICAL: Skip the 'Watch His Story' button, only tap the heart/vote button
                if (text && !text.includes('Watch')) {
                    await button.focus();
                    await button.click();
                    clicked = true;
                    break;
                }
            }

            if (!clicked) {
                throw new Error("Target heart button could not be isolated via text matching.");
            }
            
            // Brief hold period to allow the website's backend server to record the click
            await new Promise(resolve => setTimeout(resolve, 3000)); 
            
            successfulVotes++;
            console.log(`✅ Success! Heart button isolated, clicked, and vote pushed.`);

        } catch (err) {
            console.log(`⚠️ Skip: Proxy unresponsive or element blocked (${err.message})`);
        }

        if (browser) {
            await browser.close();
        }
    }
}

runPrivateEngine();
