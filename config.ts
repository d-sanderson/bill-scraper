import 'dotenv/config';

export interface StaticBill {
  name: string;
  amount: number;
}

export interface ProviderConfig {
  name: string;
  url: string;
  username: string;
  password: string;
}

export interface Config {
  providers: ProviderConfig[];
  staticBills?: StaticBill[];
  householdSize: number;
}


export const config: Config = {
  providers: [
    {
      name: 'nmg',
      url: process.env.NMG_URL || 'your-gas-url',
      username: process.env.NMG_USERNAME || 'your-gas-username',
      password: process.env.NMG_PASSWORD || 'your-gas-password',
    },
    // Add more providers as needed:
    {
      name: 'electric',
      url: process.env.PNM_URL || 'your-electric-url',
      username: process.env.PNM_USERNAME || 'your-electric-username',
      password: process.env.PNM_PASSWORD || 'your-electric-password',
    },
    {
      name: 'water',
      url: process.env.ABCWUA_URL || 'your-water-url',
      username: process.env.ABCWUA_ACCOUNT_NUMBER || 'your-water-account-number',
      password: process.env.ABCWUA_ZIP_CODE || 'your-water-zip-code'
    }
  ],
  staticBills: [
    {
      name: 'Mortgage',
      amount: parseFloat(process.env.MORTGAGE_AMOUNT || '0')
    },
    {
      name: 'Internet',
      amount: parseFloat(process.env.INTERNET_AMOUNT || '0')
    }
  ],
  householdSize: parseInt(process.env.HOUSEHOLD_SIZE || '3', 10),
};
