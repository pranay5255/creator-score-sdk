import { compareCoinMarketCaps } from './coinComparison';

// Example usage (wip)
async function example() {
  try {
    const result = await compareCoinMarketCaps({
      coinAddress1: '0x1234567890123456789012345678901234567890', // Replace with actual address
      coinAddress2: '0x0987654321098765432109876543210987654321', // Replace with actual address
      startTimestamp: Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60), // 7 days ago
      chainId: 8453 // Base chain
    });

    console.log('Comparison Result:', result);
    console.log(`Winner: ${result.winner}`);
    console.log(`Coin 1 (${result.coin1.symbol}): $${result.coin1.marketCapIncreaseUsdc} increase (${result.coin1.percentageIncrease.toFixed(2)}%)`);
    console.log(`Coin 2 (${result.coin2.symbol}): $${result.coin2.marketCapIncreaseUsdc} increase (${result.coin2.percentageIncrease.toFixed(2)}%)`);
    console.log(`Comparison Score: ${result.comparisonScore.toFixed(2)}`);
  } catch (error) {
    console.error('Error comparing coins:', error);
  }
}

// Uncomment to run:
// example();