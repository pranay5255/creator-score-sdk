import { 
  getCoin, 
  getCoinSwaps, 
  type CoinData,
} from '@zoralabs/coins-sdk';

export interface CoinComparisonInput {
  coinAddress1: string;
  coinAddress2: string;
  startTimestamp: number;
  chainId?: number;
}

export interface CoinMetrics {
  address: string;
  symbol: string;
  name: string;
  startMarketCap: string;
  currentMarketCap: string;
  marketCapIncreaseUsdc: string;
  percentageIncrease: number;
}

export interface CoinComparisonResult {
  coin1: CoinMetrics;
  coin2: CoinMetrics;
  comparisonScore: number; // Ratio: coin1 increase / coin2 increase
  winner: 'coin1' | 'coin2' | 'tie';
}

export async function compareCoinMarketCaps({
  coinAddress1,
  coinAddress2,
  startTimestamp,
  chainId = 8453 // Default to Base chain
}: CoinComparisonInput): Promise<CoinComparisonResult> {
  
  // Get current data for both coins
  const [coin1Result, coin2Result] = await Promise.all([
    getCoin({ address: coinAddress1, chain: chainId }),
    getCoin({ address: coinAddress2, chain: chainId })
  ]);

  if (!coin1Result.data?.zora20Token || !coin2Result.data?.zora20Token) {
    throw new Error('Failed to fetch coin data');
  }

  const coin1Data: CoinData = coin1Result.data.zora20Token;
  const coin2Data: CoinData = coin2Result.data.zora20Token;

  // Get historical data for both coins to find market cap at start timestamp
  const [coin1HistoricalCap, coin2HistoricalCap] = await Promise.all([
    getHistoricalMarketCap(coinAddress1, startTimestamp, chainId, coin1Data.totalSupply),
    getHistoricalMarketCap(coinAddress2, startTimestamp, chainId, coin2Data.totalSupply)
  ]);

  // Calculate metrics for coin1
  const coin1CurrentCap = parseFloat(coin1Data.marketCap);
  const coin1StartCap = coin1HistoricalCap;
  const coin1Increase = coin1CurrentCap - coin1StartCap;
  const coin1PercentIncrease = coin1StartCap > 0 ? (coin1Increase / coin1StartCap) * 100 : 0;

  // Calculate metrics for coin2
  const coin2CurrentCap = parseFloat(coin2Data.marketCap);
  const coin2StartCap = coin2HistoricalCap;
  const coin2Increase = coin2CurrentCap - coin2StartCap;
  const coin2PercentIncrease = coin2StartCap > 0 ? (coin2Increase / coin2StartCap) * 100 : 0;

  // Calculate comparison score and determine winner
  const comparisonScore = coin2Increase > 0 ? coin1Increase / coin2Increase : coin1Increase > 0 ? Infinity : 1;
  let winner: 'coin1' | 'coin2' | 'tie';
  
  if (Math.abs(coin1Increase - coin2Increase) < 0.01) {
    winner = 'tie';
  } else if (coin1Increase > coin2Increase) {
    winner = 'coin1';
  } else {
    winner = 'coin2';
  }

  return {
    coin1: {
      address: coinAddress1,
      symbol: coin1Data.symbol,
      name: coin1Data.name,
      startMarketCap: coin1StartCap.toFixed(2),
      currentMarketCap: coin1Data.marketCap,
      marketCapIncreaseUsdc: coin1Increase.toFixed(2),
      percentageIncrease: coin1PercentIncrease
    },
    coin2: {
      address: coinAddress2,
      symbol: coin2Data.symbol,
      name: coin2Data.name,
      startMarketCap: coin2StartCap.toFixed(2),
      currentMarketCap: coin2Data.marketCap,
      marketCapIncreaseUsdc: coin2Increase.toFixed(2),
      percentageIncrease: coin2PercentIncrease
    },
    comparisonScore,
    winner
  };
}

async function getHistoricalMarketCap(
  coinAddress: string, 
  targetTimestamp: number, 
  chainId: number,
  totalSupply: string
): Promise<number> {
  try {
    // Get swap history to find price closest to target timestamp
    const swapsResult = await getCoinSwaps({ 
      address: coinAddress, 
      chain: chainId,
      first: 100 // Get more data for better timestamp matching
    });

    // Handle the RequestResult union type properly
    if (!swapsResult || !swapsResult.data?.zora20Token?.swapActivities?.edges) {
      throw new Error('No swap data available');
    }

    const swaps = swapsResult.data.zora20Token.swapActivities.edges;
    
    // Find the swap closest to target timestamp
    let closestSwap: typeof swaps[0]['node'] | null = null;
    let smallestTimeDiff = Infinity;

    for (const edge of swaps) {
      const swap = edge.node;
      // Convert blockTimestamp (ISO string) to unix timestamp for comparison
      const swapTimestamp = new Date(swap.blockTimestamp).getTime() / 1000;
      const timeDiff = Math.abs(swapTimestamp - targetTimestamp);
      
      if (timeDiff < smallestTimeDiff && swap.currencyAmountWithPrice?.priceUsdc) {
        smallestTimeDiff = timeDiff;
        closestSwap = swap;
      }
    }

    if (closestSwap?.currencyAmountWithPrice?.priceUsdc) {
      const historicalPrice = parseFloat(closestSwap.currencyAmountWithPrice.priceUsdc);
      const supply = parseFloat(totalSupply);
      return historicalPrice * supply;
    }

    throw new Error('No historical price data found near target timestamp');
    
  } catch (error) {
    console.warn(`Could not get historical market cap for ${coinAddress}:`, error);
    // Return 0 as fallback - this means we can't calculate the increase accurately
    return 0;
  }
}