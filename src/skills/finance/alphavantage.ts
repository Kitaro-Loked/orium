/**
 * Orium Skill - Alpha Vantage
 * Global stock, forex, and cryptocurrency data.
 * https://www.alphavantage.co
 */

import { Skill } from '../base';
import type { ToolSchema, ToolHandler } from '../../tools/registry';

export class AlphaVantageSkill extends Skill {
  readonly name = 'alphavantage';
  readonly description = 'Alpha Vantage - Global stock, forex, and crypto market data';
  readonly category = 'finance' as const;

  private apiKey: string;
  private baseUrl = 'https://www.alphavantage.co/query';

  constructor(config: { apiKey: string; enabled?: boolean }) {
    super({ enabled: config.enabled ?? true, apiKey: config.apiKey });
    this.apiKey = config.apiKey;
  }

  getTools(): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    return [
      {
        schema: {
          name: 'alphavantage_stock_quote',
          description: 'Get real-time stock quote (global markets)',
          parameters: [
            { name: 'symbol', type: 'string', description: 'Stock symbol, e.g., AAPL, MSFT, TSLA', required: true },
          ],
        },
        handler: async (args) => {
          return this.getStockQuote(String(args.symbol));
        },
      },
      {
        schema: {
          name: 'alphavantage_fx_rate',
          description: 'Get real-time foreign exchange rate',
          parameters: [
            { name: 'from', type: 'string', description: 'From currency, e.g., USD', required: true },
            { name: 'to', type: 'string', description: 'To currency, e.g., CNY', required: true },
          ],
        },
        handler: async (args) => {
          return this.getFxRate(String(args.from), String(args.to));
        },
      },
      {
        schema: {
          name: 'alphavantage_crypto',
          description: 'Get cryptocurrency exchange rate',
          parameters: [
            { name: 'symbol', type: 'string', description: 'Crypto symbol, e.g., BTC, ETH', required: true },
            { name: 'market', type: 'string', description: 'Market currency, e.g., USD, CNY', required: true },
          ],
        },
        handler: async (args) => {
          return this.getCryptoRate(String(args.symbol), String(args.market));
        },
      },
      {
        schema: {
          name: 'alphavantage_company_overview',
          description: 'Get company overview and fundamentals',
          parameters: [
            { name: 'symbol', type: 'string', description: 'Stock symbol', required: true },
          ],
        },
        handler: async (args) => {
          return this.getCompanyOverview(String(args.symbol));
        },
      },
    ];
  }

  async getStockQuote(symbol: string): Promise<unknown> {
    const url = `${this.baseUrl}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Alpha Vantage error: ${res.status}`);
    return res.json();
  }

  async getFxRate(from: string, to: string): Promise<unknown> {
    const url = `${this.baseUrl}?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=${to}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Alpha Vantage error: ${res.status}`);
    return res.json();
  }

  async getCryptoRate(symbol: string, market: string): Promise<unknown> {
    const url = `${this.baseUrl}?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol}&to_currency=${market}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Alpha Vantage error: ${res.status}`);
    return res.json();
  }

  async getCompanyOverview(symbol: string): Promise<unknown> {
    const url = `${this.baseUrl}?function=OVERVIEW&symbol=${symbol}&apikey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Alpha Vantage error: ${res.status}`);
    return res.json();
  }

  async activate(): Promise<boolean> {
    if (!this.apiKey) return false;
    return this.healthCheck();
  }

  async deactivate(): Promise<void> {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}?function=GLOBAL_QUOTE&symbol=IBM&apikey=${this.apiKey}`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
