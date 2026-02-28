import { Browser, Page } from 'playwright';
import { Config } from './config';

// ============================================================================
// TYPES
// ============================================================================

export interface BillProvider {
  name: string;
  login: (page: Page, url: string, username: string, password: string) => Promise<void>;
  getBalance: (page: Page) => Promise<number>;
}

export interface BillResult {
  provider: string;
  balance: number;
  error?: string;
}

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

const nmgProvider: BillProvider = {
  name: 'New Mexico Gas (NMG)',

  async login(page: Page, url: string, username: string, password: string): Promise<void> {
    // Robust selectors: ID is most reliable, followed by name and placeholder
    const loginInputSelector = '#id_loginId, input[name="loginId"], input[placeholder="someone@example.com"]';
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
      if (i > 0) {
        console.log(`  🔄 Retry attempt ${i + 1}/${maxRetries} for NMG login...`);
      }

      try {
        await page.goto(url);

        // Sometimes networkidle never happens if there's a long polling request
        try {
          await page.waitForLoadState('domcontentloaded');
          await page.waitForLoadState('networkidle', { timeout: 10000 });
        } catch (e) {
          console.log('  ⚠️  Network idle timeout, continuing anyway...');
        }

        console.log(`  ℹ️  Current URL: ${page.url()}`);
        console.log('  ℹ️  Waiting for login input...');

        // DEBUG: Check for frames
        const frames = page.frames();
        console.log(`  ℹ️  Page has ${frames.length} frames`);
        if (frames.length > 1) {
          frames.forEach((f, idx) => console.log(`    Frame ${idx}: ${f.url()}`));
        }

        // Try to find selector in main page OR any frame
        let found = false;
        try {
          await page.waitForSelector(loginInputSelector, { state: 'visible', timeout: 30000 });
          found = true;
        } catch (e) {
          console.log('  ⚠️  Not found in main frame, checking child frames...');
          for (const frame of frames) {
            try {
              if (await frame.$(loginInputSelector)) {
                console.log(`  ✅ Found in frame: ${frame.url()}`);
                // We need to work with this frame now
                // NOTE: This simple login flow might need refactoring if it's in a frame,
                // but for now let's just see if we can find it.
                await frame.waitForSelector(loginInputSelector, { state: 'visible', timeout: 5000 });

                // If we are here, we found it in a frame!
                // We will just let the flow continue, but we really should fill it *in the frame*
                // For this specific debugging step, let's just switch to filling in the frame if found
                console.log(`  ℹ️  Login input visible in frame: ${frame.url()}`);
                await frame.fill(loginInputSelector, username);
                await frame.fill('input[name="password"]', password);

                // Try to find the button in the frame too
                const btnSelector = 'button[type="submit"], input[type="submit"]';
                if (await frame.$(btnSelector)) {
                  await frame.click(btnSelector);
                  found = true;
                  break; // Break the frame loop and the retry loop (via 'found' check below)
                }
              }
            } catch (err) {
              // Ignore frame failures
            }
          }
        }

        if (found) {
          // If found in a frame (and filled/clicked there), we are good.
          // If found in main page (from first try block), we proceed to standard logic below.
          // But wait! standard logic below attempts to fill `page` which is main frame.
          // If we handled it in the frame loop, we should probably return or break completely.
          // Let's restructure slightly to be cleaner.

          // Check visibility in main page again to decide if we run standard logic
          if (await page.$(loginInputSelector)) {
            // Standard logic will run after the loop
          } else {
            // It was in a frame and we already handled it?
            // Or we just failed.
            // Let's rely on standard logic but if it fails, we catch it.
            // actually, if we found and acted in a frame, we should break the outer retry loop.
            break;
          }
        }

        // If still not found, try the standard wait again which will throw and trigger retry/HTML dump
        await page.waitForSelector(loginInputSelector, { state: 'visible', timeout: 10000 });

        // If we get here, we found the input in main frame, so break the retry loop
        break;
      } catch (e) {
        console.log(`  ❌ Attempt ${i + 1} failed: ${e instanceof Error ? e.message : String(e)}`);

        // DUMP HTML on failure
        try {
          const content = await page.content();
          console.log(`  📄 Page Content Dump (first 500 chars): ${content.substring(0, 500)}...`);
          console.log(`  📄 Page Title: ${await page.title()}`);
        } catch (dumpErr) {
          console.log('  ❌ Failed to dump debug info');
        }

        if (i === maxRetries - 1) {
          throw new Error(`Failed to load NMG login page after ${maxRetries} attempts: ${e instanceof Error ? e.message : String(e)}`);
        }

        // Wait a bit before retrying
        console.log('  ⏳ Waiting 5 seconds before retrying...');
        await page.waitForTimeout(5000);
      }
    }

    // log if login input is visible
    const loginIdVisible = await page.isVisible(loginInputSelector);
    console.log(`  ℹ️  Login input visible: ${loginIdVisible}`);

    // Fill in username
    await page.fill(loginInputSelector, username);

    // Fill in password
    await page.fill('input[name="password"]', password);

    // Click login button (adjust selector as needed)
    await page.click('button[type="submit"], input[type="submit"]');

    // Wait for navigation after login
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      console.log('  ⚠️  Post-login network idle timeout, continuing...');
    }
  },

  async getBalance(page: Page): Promise<number> {
    // Wait for balance element to be visible
    // Adjust these selectors based on the actual page structure
    const balanceSelectors = [
      '.balance-amount',
      '.current-balance',
      '[data-testid="balance"]',
      'text=/\\$[0-9,.]+/'
    ];

    for (const selector of balanceSelectors) {
      try {
        const element = await page.locator(selector).first();
        if (await element.isVisible({ timeout: 5000 })) {
          const text = await element.textContent();
          if (text) {
            // Extract number from text like "$123.45"
            const match = text.match(/\$?([0-9,]+\.?[0-9]*)/);
            if (match) {
              return parseFloat(match[1].replace(',', ''));
            }
          }
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }

    throw new Error('Could not find balance on page');
  }
};

// PNM (Public Service Company of New Mexico) Provider
const pnmProvider: BillProvider = {
  name: 'PNM (Electric)',

  async login(page: Page, url: string, username: string, password: string): Promise<void> {
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    console.log('  ℹ️  Filling in username...');
    // Fill in username (email)
    await page.fill('input[name="username"]', username);

    console.log('  ℹ️  Filling in password...');
    // Fill in password
    await page.fill('input[name="password"]', password);

    console.log('  ℹ️  Looking for login button...');
    // Check if the login button exists and is visible
    const loginButton = page.locator('button[data-action-button-primary="true"]');
    const isVisible = await loginButton.isVisible();
    const count = await loginButton.count();

    console.log(`  ℹ️  Login button found: ${count} elements, visible: ${isVisible}`);

    if (!isVisible || count === 0) {
      console.log('  ⚠️  Primary selector failed, trying alternative selectors...');

      // Try alternative selectors
      const alternatives = [
        'button[name="action"][value="default"]',
        'button[type="submit"]:has-text("Log In")',
        'text=Log In',
      ];

      for (const selector of alternatives) {
        try {
          const altButton = page.locator(selector);
          if (await altButton.isVisible({ timeout: 2000 })) {
            console.log(`  ✅ Found button with selector: ${selector}`);
            await altButton.click();
            console.log('  ✅ Login button clicked!');
            break;
          }
        } catch (e) {
          console.log(`  ❌ Selector failed: ${selector}`);
        }
      }
    } else {
      console.log('  ✅ Clicking login button...');
      await loginButton.click();
      console.log('  ✅ Login button clicked!');
    }

    console.log('  ⏳ Waiting for navigation...');
    // Wait for navigation after login
    await page.waitForLoadState('networkidle');

    console.log('  ⏳ Waiting for dashboard to load...');
    // Add extra wait to ensure dashboard loads
    await page.waitForTimeout(2000);

    console.log('  ✅ Login complete!');
  },

  async getBalance(page: Page): Promise<number> {
    console.log('  ℹ️  Looking for balance...');

    // Target specific markup:
    // <div class="text-secondary">
    //   <span class="amttxt">Amount Due</span> <span class="font-weight-bold font-26 text-black">$89.35</span>
    // </div>

    // Use a precise selector finding the sibling of the Amount Due label
    const selector = 'div.text-secondary span.amttxt:has-text("Amount Due") + span';

    try {
      const element = page.locator(selector).first();

      // Wait to ensure it's loaded
      await element.waitFor({ state: 'visible', timeout: 10000 });

      const text = await element.textContent();
      if (text) {
        console.log(`  ℹ️  Found balance text: "${text}"`);
        const match = text.match(/\$?([0-9,]+\.?[0-9]*)/);
        if (match) {
          return parseFloat(match[1].replace(/,/g, ''));
        }
      }
    } catch (e) {
      console.error(`  ❌ Failed to find balance with selector: ${selector}`);
    }

    throw new Error('Could not find balance on page using specific markup selector.');
  }
};

// ABCWUA (Albuquerque Water) Provider - E-BillExpress Guest Payment
const abcwuaProvider: BillProvider = {
  name: 'ABCWUA (Water)',

  async login(page: Page, url: string, username: string, password: string): Promise<void> {
    // username = account number (10 digits)
    // password = service zip code (5 digits)

    console.log('  ℹ️  Navigating to ABCWUA E-BillExpress...');
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    console.log('  ℹ️  Filling in account number...');
    const accountField = page.locator('input[name="AccountNumber"]');
    const accountVisible = await accountField.isVisible();
    console.log(`  ℹ️  Account field visible: ${accountVisible}`);

    if (!accountVisible) {
      throw new Error('Account Number field not found');
    }

    await accountField.fill(username);
    console.log(`  ✅ Account number entered: ${username}`);

    console.log('  ℹ️  Filling in service zip code...');
    const zipField = page.locator('input[name="PIN"]');
    const zipVisible = await zipField.isVisible();
    console.log(`  ℹ️  ZIP field visible: ${zipVisible}`);

    if (!zipVisible) {
      throw new Error('Service Zip Code field not found');
    }

    await zipField.fill(password);
    console.log(`  ✅ Zip code entered: ${password}`);

    console.log('  ℹ️  Looking for "One-Time Payment" button...');
    const submitButton = page.locator('button#pay-now-button');
    const buttonVisible = await submitButton.isVisible();
    console.log(`  ℹ️  Submit button visible: ${buttonVisible}`);

    if (!buttonVisible) {
      // Try alternative selectors
      const altButton = page.locator('button:has-text("One-Time Payment")');
      if (await altButton.isVisible({ timeout: 3000 })) {
        console.log('  ✅ Found button with text selector');
        await altButton.click();
      } else {
        throw new Error('One-Time Payment button not found');
      }
    } else {
      console.log('  ✅ Clicking "One-Time Payment" button...');
      await submitButton.click();
    }

    console.log('  ⏳ Waiting for account page to load...');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Check if login was successful (should navigate away from login form)
    const currentUrl = page.url();
    console.log(`  ℹ️  Current URL: ${currentUrl}`);

    // Check for error messages
    const errorMsg = await page.locator('.alert-danger, .error-message, .field-validation-error').first().textContent().catch(() => null);
    if (errorMsg && errorMsg.trim()) {
      console.log(`  ❌ Login error: ${errorMsg}`);
      throw new Error(`Login failed: ${errorMsg}`);
    }

    console.log('  ✅ Login complete!');
  },

  async getBalance(page: Page): Promise<number> {
    console.log('  ℹ️  Looking for invoice amount input...');

    // Specific selector for ABCWUA E-BillExpress amount input
    // <input name="PaymentAmount" value="95.28" ...>
    const invoiceInput = page.locator('input[name="PaymentAmount"]');

    console.log('  ℹ️  Waiting for invoice input to be visible...');
    await invoiceInput.waitFor({ state: 'visible', timeout: 10000 });

    // For input elements, we need the value attribute, not textContent
    const value = await invoiceInput.inputValue();
    console.log(`  ℹ️  Invoice input value: "${value}"`);

    if (!value) {
      throw new Error('Invoice input found but has no value');
    }

    // Extract number from text like "95.28"
    const cleanText = value.trim().replace(/\s+/g, '').replace(/,/g, '');
    const match = cleanText.match(/([0-9]+\.?[0-9]*)/);

    if (!match) {
      throw new Error(`Could not parse amount from value: "${value}"`);
    }

    const amount = parseFloat(match[1]);
    console.log(`  ✅ Found balance: $${amount.toFixed(2)}`);

    return amount;
  }
};

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

export const PROVIDERS: Record<string, BillProvider> = {
  'nmg': nmgProvider,
  'electric': pnmProvider,
  'water': abcwuaProvider,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function scrapeBill(
  browser: Browser,
  provider: BillProvider,
  url: string,
  username: string,
  password: string
): Promise<BillResult> {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/Denver',
    permissions: ['geolocation'],
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    },
  });

  const page = await context.newPage();

  // Remove webdriver flag
  await page.addInitScript(() => {
    // Basic property overrides
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // Mock plugins to look more realistic
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    // Mock languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });

    // Add chrome object
    (window as any).chrome = {
      runtime: {},
    };
  });

  try {
    console.log(`\n📄 Scraping ${provider.name}...`);

    await provider.login(page, url, username, password);
    const balance = await provider.getBalance(page);

    console.log(`✅ ${provider.name}: $${balance.toFixed(2)}`);

    return {
      provider: provider.name,
      balance: balance
    };
  } catch (error) {
    console.error(`❌ ${provider.name}: ${error}`);
    return {
      provider: provider.name,
      balance: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  } finally {
    await context.close();
  }
}

export async function runScraping(browser: Browser, config: Config): Promise<BillResult[]> {
  const results: BillResult[] = [];

  // Scrape each provider
  for (const providerConfig of config.providers) {
    const provider = PROVIDERS[providerConfig.name];
    if (!provider) {
      console.warn(`⚠️  Unknown provider: ${providerConfig.name}`);
      continue;
    }

    const result = await scrapeBill(
      browser,
      provider,
      providerConfig.url,
      providerConfig.username,
      providerConfig.password
    );
    results.push(result);
  }

  // Process static bills
  if (config.staticBills) {
    for (const bill of config.staticBills) {
      console.log(`\n📄 Processing static bill: ${bill.name}...`);
      if (bill.amount > 0) {
        console.log(`✅ ${bill.name}: $${bill.amount.toFixed(2)}`);
        results.push({
          provider: bill.name,
          balance: bill.amount
        });
      } else {
        console.log(`⚠️ ${bill.name}: Amount is 0 or invalid`);
      }
    }
  }

  return results;
}
