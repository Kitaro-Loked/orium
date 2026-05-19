/**
 * Orium Skill - EastMoney (东方财富)
 * China A-share, fund, bond data API integration.
 * https://data.eastmoney.com
 */

import { Skill } from '../base';
import type { ToolSchema, ToolHandler } from '../../tools/registry';

export interface StockQuote {
  code: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  timestamp: string;
}

export interface FundQuote {
  code: string;
  name: string;
  nav: number; // Net Asset Value
  accumNav: number;
  dailyReturn: number;
  date: string;
}

export class EastMoneySkill extends Skill {
  readonly name = 'eastmoney';
  readonly description = 'EastMoney (东方财富) - China A-share, fund, and bond market data';
  readonly category = 'finance' as const;

  private apiKey?: string;
  private baseUrl = 'https://push2.eastmoney.com/api';

  constructor(config: { apiKey?: string; enabled?: boolean } = {}) {
    super({ enabled: config.enabled ?? true, apiKey: config.apiKey });
    this.apiKey = config.apiKey;
  }

  getTools(): Array<{ schema: ToolSchema; handler: ToolHandler }> {
    return [
      {
        schema: {
          name: 'eastmoney_stock_quote',
          description: 'Get real-time stock quote for China A-share (沪深A股)',
          parameters: [
            { name: 'code', type: 'string', description: 'Stock code, e.g., 000001 (平安银行), 600519 (贵州茅台)', required: true },
            { name: 'market', type: 'string', description: 'Market: SH (上海) or SZ (深圳)', required: false, enum: ['SH', 'SZ'] },
          ],
        },
        handler: async (args) => {
          return this.getStockQuote(String(args.code), args.market as string);
        },
      },
      {
        schema: {
          name: 'eastmoney_fund_quote',
          description: 'Get fund NAV (净值) data',
          parameters: [
            { name: 'code', type: 'string', description: 'Fund code, e.g., 000001', required: true },
          ],
        },
        handler: async (args) => {
          return this.getFundQuote(String(args.code));
        },
      },
      {
        schema: {
          name: 'eastmoney_market_overview',
          description: 'Get China stock market overview (上证指数, 深证成指, 创业板指)',
          parameters: [],
        },
        handler: async () => {
          return this.getMarketOverview();
        },
      },
      {
        schema: {
          name: 'eastmoney_hot_sectors',
          description: 'Get hot sectors and industry rankings',
          parameters: [
            { name: 'limit', type: 'number', description: 'Number of sectors', required: false },
          ],
        },
        handler: async (args) => {
          return this.getHotSectors(args.limit ? Number(args.limit) : 10);
        },
      },
    ];
  }

  async getStockQuote(code: string, market?: string): Promise<StockQuote | null> {
    // Auto-detect market prefix if not provided
    let secid: string;
    if (code.startsWith('6')) {
      secid = `1.${code}`; // Shanghai
    } else if (code.startsWith('0') || code.startsWith('3')) {
      secid = `0.${code}`; // Shenzhen
    } else {
      secid = market === 'SH' ? `1.${code}` : `0.${code}`;
    }

    const url = `${this.baseUrl}/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f51,f52,f57,f58,f60,f170`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      const d = data.data;
      if (!d) return null;

      return {
        code: d.f57,
        name: d.f58,
        price: d.f43 / 100, // Price is multiplied by 100
        change: d.f170 / 100,
        changePercent: d.f170 / 100,
        volume: d.f47,
        turnover: d.f48,
        high: d.f44 / 100,
        low: d.f45 / 100,
        open: d.f46 / 100,
        prevClose: d.f60 / 100,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  async getFundQuote(code: string): Promise<FundQuote | null> {
    const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;

      const text = await res.text();
      // Response is JSONP: jsonpgz({...})
      const match = text.match(/jsonpgz\((.+?)\);?$/s);
      if (!match) return null;

      const data = JSON.parse(match[1]);
      return {
        code: data.fundcode,
        name: data.name,
        nav: parseFloat(data.dwjz),
        accumNav: parseFloat(data.ljjz),
        dailyReturn: parseFloat(data.gszzl),
        date: data.jzrq,
      };
    } catch {
      return null;
    }
  }

  async getMarketOverview(): Promise<Record<string, unknown>> {
    const indices = [
      { name: '上证指数', secid: '1.000001' },
      { name: '深证成指', secid: '0.399001' },
      { name: '创业板指', secid: '0.399006' },
      { name: '科创50', secid: '1.000688' },
    ];

    const results: Record<string, unknown> = {};

    for (const idx of indices) {
      try {
        const url = `${this.baseUrl}/qt/stock/get?secid=${idx.secid}&fields=f43,f44,f45,f46,f47,f48,f57,f58,f60,f170`;
        const res = await fetch(url);
        const data = await res.json();
        const d = data.data;
        if (d) {
          results[idx.name] = {
            price: d.f43 / 100,
            change: d.f170 / 100,
            volume: d.f47,
          };
        }
      } catch {
        // Skip failed indices
      }
    }

    return results;
  }

  async getHotSectors(limit = 10): Promise<Array<{ name: string; change: number }>> {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${limit}&po=1&np=1&fltt=2&invt=2&fid=f20&fs=m:90+t:2&fields=f12,f14,f20,f104`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      const list = data.data?.diff || [];

      return list.map((item: any) => ({
        name: item.f14,
        code: item.f12,
        change: item.f104,
        turnover: item.f20,
      }));
    } catch {
      return [];
    }
  }

  async activate(): Promise<boolean> {
    // EastMoney public APIs don't require key
    return true;
  }

  async deactivate(): Promise<void> {
    // Stateless
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.getStockQuote('000001');
      return result !== null;
    } catch {
      return false;
    }
  }
}
