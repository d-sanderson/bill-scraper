# Bill Scraper

Automated utility bill scraper that logs into utility providers, retrieves current balances, and splits the total among household members.

## Features

- 🔐 Automated login to utility provider websites
- 💰 Scrapes current balance due
- 👥 Automatically splits total among household members
- 🔌 Extensible architecture for adding new providers
- 🚀 Simple CLI interface
- 🥷 Stealth mode to avoid bot detection (realistic headers, user agent, etc.)

## Setup

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `playwright` - Browser automation
- `dotenv` - Loads environment variables from `.env` file
- `tsx` - TypeScript execution
- `typescript` - TypeScript compiler

### 2. Install Playwright Browsers

```bash
npm run install-browsers
```

### 3. Configure Credentials

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
NMG_URL=your-actual-url
NMG_USERNAME=your-actual-username
NMG_PASSWORD=your-actual-password
ELECTRIC_URL=your-actual-url
ELECTRIC_USERNAME=your-actual-username
ELECTRIC_PASSWORD=your-actual-password
HOUSEHOLD_SIZE=3
```

## Usage

Run the scraper:

```bash
npm run scrape
```

The script will:
1. Log into each configured provider
2. Scrape the current balance
3. Display individual balances
4. Calculate and display the total
5. Show the per-person split

### Example Output

```
📄 Scraping New Mexico Gas (NMG)...
✅ New Mexico Gas (NMG): $145.23

==================================================
📊 SUMMARY
==================================================
New Mexico Gas (NMG): $145.23
Electric Company: $89.50
Water Company: $45.00
--------------------------------------------------
Total Balance: $279.73
Household Size: 3 people
Per Person: $93.24
==================================================
```

## Adding New Providers

To add a new utility provider, follow these steps:

### 1. Create a Provider Implementation

In `main.ts`, add a new provider object:

```typescript
const yourProvider: BillProvider = {
  name: 'Your Utility Company',
  
  async login(page: Page, url: string, username: string, password: string): Promise<void> {
    // Navigate to login page
    await page.goto(url);
    
    // Fill in credentials
    await page.fill('input[name="username"]', username);
    await page.fill('input[name="password"]', password);
    
    // Submit form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
  },
  
  async getBalance(page: Page): Promise<number> {
    // Find balance on page (adjust selector)
    const balanceText = await page.locator('.balance-amount').textContent();
    
    // Extract number from text
    const match = balanceText?.match(/\$?([0-9,]+\.?[0-9]*)/);
    if (match) {
      return parseFloat(match[1].replace(',', ''));
    }
    
    throw new Error('Could not find balance');
  }
};
```

### 2. Register the Provider

Add it to the `PROVIDERS` registry:

```typescript
const PROVIDERS: Record<string, BillProvider> = {
  'nmg': nmgProvider,
  'electric': electricProvider,
  'water': waterProvider,
  'your-provider': yourProvider,  // Add this line
};
```

### 3. Add to Configuration

Add provider configuration in `config.ts`:

```typescript
export const config: Config = {
  providers: [
    {
      name: 'nmg',
      url: process.env.NMG_URL,
      username: process.env.NMG_USERNAME || '',
      password: process.env.NMG_PASSWORD || '',
    },
    {
      name: 'your-provider',
      url: process.env.YOUR_PROVIDER_URL,
      username: process.env.YOUR_PROVIDER_USERNAME || '',
      password: process.env.YOUR_PROVIDER_PASSWORD || '',
    },
  ],
  householdSize: parseInt(process.env.HOUSEHOLD_SIZE || '3', 10),
};
```

### 4. Add Environment Variables

Update `.env`:

```env
YOUR_PROVIDER_URL=https://your-utility.com/login
YOUR_PROVIDER_USERNAME=username
YOUR_PROVIDER_PASSWORD=password
```

## Architecture

The code is organized into several key components:

- **BillProvider Interface**: Defines the contract for provider implementations
- **Provider Implementations**: Individual provider logic (login + balance scraping)
- **Provider Registry**: Central lookup for all providers
- **Main Logic**: Orchestrates scraping and calculates splits

## Debugging

To see the browser while scraping (helpful for debugging):

In `main.ts`, change:

```typescript
const browser = await chromium.launch({
  headless: false,  // Browser will be visible
});
```

## Security Notes

- Never commit your `.env` file to version control
- Consider using a password manager or secure vault for credentials
- Some utilities may have CAPTCHAs that prevent automation

## Stealth Features

The script includes several anti-detection measures:

- **Realistic User Agent**: Mimics Chrome on Windows 10
- **Standard Headers**: Includes all typical browser headers (Accept, DNT, Sec-Fetch-*, etc.)
- **WebDriver Flag Removal**: Removes `navigator.webdriver` flag that identifies automation
- **Browser Fingerprinting**: Adds realistic plugins, languages, and chrome object
- **Launch Arguments**: Disables automation flags in Chromium
- **Viewport & Locale**: Sets standard screen size and timezone

These help the browser appear as a regular user session rather than an automated bot.

## Troubleshooting

### "Could not find balance on page"

The balance selector may have changed. Inspect the page and update the selector in the `getBalance()` method.

### Login fails

Check:
1. Credentials are correct in `.env`
2. The website hasn't changed their login form
3. No CAPTCHA is blocking automation

### Timeout errors

Increase wait times or adjust `waitForLoadState` calls to handle slower page loads.

## License

MIT
