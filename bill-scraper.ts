import { chromium, Browser, Page } from 'playwright';
import 'dotenv/config';

// ============================================================================
// TYPES
// ============================================================================

interface BillProvider {
  name: string;
  login: (page: Page, username: string, password: string) => Promise<void>;
  getBalance: (page: Page) => Promise<number>;
}

interface BillResult {
  provider: string;
  balance: number;
  error?: string;
}

interface Config {
  providers: {
    name: string;
    url: string;
    username: string;
    password: string;
  }[];
  householdSize: number;
}

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

const nmgProvider: BillProvider = {
  name: 'New Mexico Gas (NMG)',

  async login(page: Page, username: string, password: string): Promise<void> {
    await page.goto('https://ipn4.paymentus.com/cp/nmg');
    await page.waitForLoadState('networkidle');

    // Fill in username
    await page.fill('input[name="loginId"]', username);

    // Fill in password
    await page.fill('input[name="password"]', password);

    // Click login button (adjust selector as needed)
    await page.click('button[type="submit"], input[type="submit"]');

    // Wait for navigation after login
    await page.waitForLoadState('networkidle');
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

  async login(page: Page, username: string, password: string): Promise<void> {
    await page.goto('https://login.pnm.com/u/login');
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

  async login(page: Page, username: string, password: string): Promise<void> {
    // username = account number (10 digits)
    // password = service zip code (5 digits)

    console.log('  ℹ️  Navigating to ABCWUA E-BillExpress...');
    await page.goto('https://www.e-billexpress.com/ebpp/ABCWUA/');
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

// Template for adding more providers
// const electricProvider: BillProvider = {
//   name: 'Electric Company',

//   async login(page: Page, username: string, password: string): Promise<void> {
//     // TODO: Implement login for electric provider
//     throw new Error('Not implemented');
//   },

//   async getBalance(page: Page): Promise<number> {
//     // TODO: Implement balance scraping for electric provider
//     throw new Error('Not implemented');
//   }
// };

// const waterProvider: BillProvider = {
//   name: 'Water Company',

//   async login(page: Page, username: string, password: string): Promise<void> {
//     // TODO: Implement login for water provider
//     throw new Error('Not implemented');
//   },

//   async getBalance(page: Page): Promise<number> {
//     // TODO: Implement balance scraping for water provider
//     throw new Error('Not implemented');
//   }
// };

// ============================================================================
// PROVIDER REGISTRY
// ============================================================================

const PROVIDERS: Record<string, BillProvider> = {
  'nmg': nmgProvider,
  'electric': pnmProvider,
  'water': abcwuaProvider,
};

// ============================================================================
// MAIN SCRAPING LOGIC
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

    await provider.login(page, username, password);
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

async function main(config: Config) {
  const browser = await chromium.launch({
    headless: false, // Set to true for production
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-web-security',
    ],
  });

  try {
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

  } finally {
    await browser.close();
  }
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

// Example configuration - in production, load from config file or env vars
const config: Config = {
  providers: [
    {
      name: 'nmg',
      url: 'https://ipn4.paymentus.com/cp/nmg',
      username: process.env.NMG_USERNAME || 'your-username',
      password: process.env.NMG_PASSWORD || 'your-password',
    },
    // Add more providers as needed:
    {
      name: 'electric',
      url: 'https://electric-company.com/login',
      username: process.env.ELECTRIC_USERNAME || '',
      password: process.env.ELECTRIC_PASSWORD || '',
    },
    {
      name: 'water',
      url: 'https://www.abcwua.org/',
      username: process.env.ABCWUA_ACCOUNT_NUMBER || 'your-account-number',
      password: process.env.ABCWUA_ZIP_CODE || 'your-zip-code'
    }
  ],
  householdSize: parseInt(process.env.HOUSEHOLD_SIZE || '3', 10),
};

main(config).catch(console.error);
