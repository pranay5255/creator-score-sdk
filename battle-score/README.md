# Battle Scores

A TypeScript SDK for comparing Zora creator coin market cap performance over time periods.

## Overview

This package provides functionality to compare two creator coins' market cap changes and determine which performed better over a specified time period.

## Documentation

https://docs.zora.co/coins/sdk/queries/explore#usage-example

## Installation

```bash
npm install @zoralabs/coins-sdk
```

## API Reference

### `compareCoinMarketCaps(input: CoinComparisonInput): Promise<CoinComparisonResult>`

Compares market cap performance between two creator coins over a specified time period.

#### Parameters

```typescript
interface CoinComparisonInput {
  coinAddress1: string;    // First creator coin contract address
  coinAddress2: string;    // Second creator coin contract address  
  startTimestamp: number;  // Unix timestamp to start measuring from
  chainId?: number;        // Optional chain ID (defaults to 8453 - Base)
}
```

#### Return Value

```typescript
interface CoinComparisonResult {
  coin1: CoinMetrics;
  coin2: CoinMetrics;
  comparisonScore: number;           // Ratio: coin1_increase / coin2_increase
  winner: 'coin1' | 'coin2' | 'tie';
}

interface CoinMetrics {
  address: string;              // Contract address
  symbol: string;               // Coin symbol
  name: string;                 // Coin name
  startMarketCap: string;       // Market cap at start timestamp (USDC)
  currentMarketCap: string;     // Current market cap (USDC)
  marketCapIncreaseUsdc: string; // Absolute increase in USDC
  percentageIncrease: number;   // Percentage increase
}
```

#### Algorithm

1. **Current Data Retrieval**: Fetches current market cap data for both coins using `getCoin()`
2. **Historical Price Discovery**: Uses `getCoinSwaps()` to find the swap activity closest to the `startTimestamp`
3. **Market Cap Calculation**: 
   - Historical market cap = `historical_price * total_supply`
   - Current market cap = `current_price * total_supply`
   - Increase = `current_market_cap - historical_market_cap`
4. **Comparison Scoring**:
   - `comparisonScore = coin1_increase / coin2_increase`
   - Winner determined by highest absolute USDC increase
   - Tie if increases differ by less than $0.01

#### Usage Example

```typescript
import { compareCoinMarketCaps } from './coinComparison';

async function example() {
  const result = await compareCoinMarketCaps({
    coinAddress1: '0x1234567890123456789012345678901234567890',
    coinAddress2: '0x0987654321098765432109876543210987654321',
    startTimestamp: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60), // 7 days ago
    chainId: 8453 // Base chain
  });

  console.log(`Winner: ${result.winner}`);
  console.log(`${result.coin1.symbol}: $${result.coin1.marketCapIncreaseUsdc} (+${result.coin1.percentageIncrease.toFixed(2)}%)`);
  console.log(`${result.coin2.symbol}: $${result.coin2.marketCapIncreaseUsdc} (+${result.coin2.percentageIncrease.toFixed(2)}%)`);
  console.log(`Comparison Score: ${result.comparisonScore.toFixed(2)}`);
}
```

#### Error Handling

- Throws error if coin addresses are invalid or not found
- Returns `0` for historical market cap if no swap data exists near `startTimestamp`
- Gracefully handles missing price data with fallback values
- Network errors are propagated to caller

#### Limitations

- Historical accuracy depends on swap activity frequency
- Limited by available historical data depth in the Zora API
- Requires at least one swap transaction near the start timestamp for accurate historical pricing
- Market cap calculations assume consistent total supply (doesn't account for burns/mints between timestamps)

#### Supported Networks

- Base (Chain ID: 8453) - Default
- Other networks supported by @zoralabs/coins-sdk

#### Dependencies

- `@zoralabs/coins-sdk` - For accessing Zora coin data and swap history