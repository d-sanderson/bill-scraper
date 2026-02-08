import express from 'express';
import { chromium } from 'playwright';
import 'dotenv/config';
import { config } from './config';
import { runScraping } from './scraper';

const app = express();
app.use(express.json());

const PORT = 3000;

app.post('/scrape-bills', async (req, res) => {
  console.log('Received scrape request...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
    ],
  });

  try {
    // Run your scraping logic here
    const results = await runScraping(browser, config);

    // Calculate summaries
    const total = results.reduce((sum, r) => sum + r.balance, 0);
    const perPerson = total / config.householdSize;

    res.json({
      success: true,
      results: results,
      summary: {
        total: total,
        perPerson: perPerson,
        householdSize: config.householdSize
      }
    });
  } catch (error: any) {
    console.error('Scraping failed:', error);
    res.status(500).json({ success: false, error: error.message || 'Unknown error' });
  } finally {
    await browser.close();
  }
});

app.listen(PORT, () => console.log(`Bill scraper API running on port ${PORT}`));
