import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import { hasReceivedFaucetFromDatabase, saveFaucetRecord } from '@/lib/mongodb'

// Faucet wallets - 5 different private keys for rotation
const FAUCET_WALLETS = [
  process.env.FAUCET_WALLET_1_PRIVATE_KEY,
  process.env.FAUCET_WALLET_2_PRIVATE_KEY,
  process.env.FAUCET_WALLET_3_PRIVATE_KEY,
  process.env.FAUCET_WALLET_4_PRIVATE_KEY,
  process.env.FAUCET_WALLET_5_PRIVATE_KEY,
].filter(Boolean) as string[]

const FAUCET_AMOUNT = '0.000004' // 0.000004 ETH
const BASE_RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'

// Track which wallet to use next (simple round-robin)
let currentWalletIndex = 0

export async function POST(request: NextRequest) {
  try {
    const { userAddress } = await request.json()

    if (!userAddress) {
      return NextResponse.json(
        { error: 'User address is required' },
        { status: 400 }
      )
    }

    if (!ethers.isAddress(userAddress)) {
      return NextResponse.json(
        { error: 'Invalid Ethereum address' },
        { status: 400 }
      )
    }

    // Log the faucet request
    console.log(`Faucet request for address: ${userAddress}`)

    // Check if user has already received faucet from database
    const hasReceivedFaucet = await hasReceivedFaucetFromDatabase(userAddress)
    if (hasReceivedFaucet) {
      return NextResponse.json(
        { error: 'User has already received faucet funds' },
        { status: 400 }
      )
    }

    if (FAUCET_WALLETS.length === 0) {
      return NextResponse.json(
        { error: 'No faucet wallets configured' },
        { status: 500 }
      )
    }

    // Create provider for Base network
    const provider = new ethers.JsonRpcProvider(BASE_RPC_URL)

    // Get current faucet wallet
    const faucetPrivateKey = FAUCET_WALLETS[currentWalletIndex]
    const faucetWallet = new ethers.Wallet(faucetPrivateKey, provider)

    console.log(`Using faucet wallet ${currentWalletIndex + 1}:`, faucetWallet.address)

    // Check faucet wallet balance
    const faucetBalance = await provider.getBalance(faucetWallet.address)
    const requiredAmount = ethers.parseEther(FAUCET_AMOUNT)

    if (faucetBalance < requiredAmount) {
      console.log(`Faucet wallet ${currentWalletIndex + 1} has insufficient balance, trying next wallet`)
      
      // Try next wallet
      currentWalletIndex = (currentWalletIndex + 1) % FAUCET_WALLETS.length
      const nextFaucetPrivateKey = FAUCET_WALLETS[currentWalletIndex]
      const nextFaucetWallet = new ethers.Wallet(nextFaucetPrivateKey, provider)
      const nextFaucetBalance = await provider.getBalance(nextFaucetWallet.address)
      
      if (nextFaucetBalance < requiredAmount) {
        return NextResponse.json(
          { error: 'All faucet wallets have insufficient balance' },
          { status: 500 }
        )
      }
      
      // Use the next wallet
      const transaction = {
        to: userAddress,
        value: requiredAmount,
        gasLimit: 21000,
      }

      const tx = await nextFaucetWallet.sendTransaction(transaction)
      await tx.wait()

      // Save faucet record to database
      await saveFaucetRecord(userAddress, FAUCET_AMOUNT, currentWalletIndex, tx.hash)

      // Move to next wallet for next request
      currentWalletIndex = (currentWalletIndex + 1) % FAUCET_WALLETS.length

      return NextResponse.json({
        success: true,
        txHash: tx.hash,
        amount: FAUCET_AMOUNT,
        faucetWallet: nextFaucetWallet.address
      })
    }

    // Send ETH from current faucet wallet
    const transaction = {
      to: userAddress,
      value: requiredAmount,
    }

    const tx = await faucetWallet.sendTransaction(transaction)
    await tx.wait()

    // Save faucet record to database
    await saveFaucetRecord(userAddress, FAUCET_AMOUNT, currentWalletIndex, tx.hash)

    // Move to next wallet for next request
    currentWalletIndex = (currentWalletIndex + 1) % FAUCET_WALLETS.length

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      amount: FAUCET_AMOUNT,
      faucetWallet: faucetWallet.address
    })

  } catch (error) {
    console.error('Faucet error:', error)
    return NextResponse.json(
      { error: 'Failed to send faucet funds' },
      { status: 500 }
    )
  }
}
