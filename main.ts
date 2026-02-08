import { chromium } from 'playwright';
import 'dotenv/config';
import { config } from './config';
import { runScraping } from './scraper';

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  const browser = await chromium.launch({
    headless: false, // Set to true for production
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
    ],
  });

  try {
    const results = await runScraping(browser, config);

    // Calculate totals
    const totalBalance = results.reduce((sum, r) => sum + r.balance, 0);
    const perPerson = totalBalance / config.householdSize;

    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));

    results.forEach(r => {
      if (r.error) {
        console.log(`${r.provider}: ERROR - ${r.error}`);
      } else {
        console.log(`${r.provider}: $${r.balance.toFixed(2)}`);
      }
    });

    console.log('-'.repeat(50));
    console.log(`Total Balance: $${totalBalance.toFixed(2)}`);
    console.log(`Household Size: ${config.householdSize} people`);
    console.log(`Per Person: $${perPerson.toFixed(2)}`);
    console.log('='.repeat(50) + '\n');

  } catch (error) {
    console.error('An unexpected error occurred:', error);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
