import { NextRequest, NextResponse } from 'next/server'
import { ethers } from 'ethers'
import PinataSDK from '@pinata/sdk'
import { addToLeaderboard } from '@/lib/mongodb'

// Initialize Pinata SDK
const pinata = new PinataSDK({
  pinataApiKey: process.env.PINATA_API_KEY!,
  pinataSecretApiKey: process.env.PINATA_SECRET_API_KEY!,
})

// NFT Contract ABI (minimal for minting)
const NFT_ABI = [
  "function mint(address to, string memory tokenURI, uint256 iqScore, string memory username, string memory displayName) external returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string memory)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenToIQScore(uint256 tokenId) external view returns (uint256)",
  "function tokenToUsername(uint256 tokenId) external view returns (string memory)",
  "function tokenToDisplayName(uint256 tokenId) external view returns (string memory)",
  "function totalSupply() external view returns (uint256)",
  "event IQScoreMinted(uint256 indexed tokenId, address indexed owner, uint256 iqScore, string username, string displayName, string tokenURI)"
]

export async function POST(request: NextRequest) {
  try {
    const { imageDataUrl, userAddress, score, username, displayName, fid, pfpUrl } = await request.json()

    if (!imageDataUrl || !userAddress || !score || !fid) {
      return NextResponse.json(
        { error: 'Missing required parameters (imageDataUrl, userAddress, score, fid)' },
        { status: 400 }
      )
    }

    // Convert base64 image to buffer
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '')
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // Upload image to Pinata
    const imageUploadResult = await pinata.pinFileToIPFS(imageBuffer, {
      pinataMetadata: {
        name: `IQ-Score-${username}-${score}`
      }
    })

    const imageCID = imageUploadResult.IpfsHash
    const imageURL = `https://gateway.pinata.cloud/ipfs/${imageCID}`

    // Create metadata JSON
    const metadata = {
      name: `${displayName}'s IQ Score NFT`,
      description: `Farcaster IQ Score NFT for ${displayName} (@${username}) with a score of ${score}`,
      image: imageURL,
      external_url: process.env.APP_URL || 'https://your-app-url.com',
      attributes: [
        {
          trait_type: "IQ Score",
          value: score,
          display_type: "number"
        },
        {
          trait_type: "Username",
          value: username
        },
        {
          trait_type: "Display Name",
          value: displayName
        },
        {
          trait_type: "Mint Date",
          value: new Date().toISOString().split('T')[0],
          display_type: "date"
        }
      ],
      properties: {
        files: [
          {
            type: "image/png",
            uri: imageURL
          }
        ],
        category: "image",
        creators: [
          {
            address: userAddress,
            share: 100
          }
        ]
      }
    }

    // Upload metadata to Pinata
    const metadataUploadResult = await pinata.pinJSONToIPFS(metadata, {
      pinataMetadata: {
        name: `IQ-Metadata-${username}-${score}`
      }
    })

    const metadataCID = metadataUploadResult.IpfsHash
    const tokenURI = `https://gateway.pinata.cloud/ipfs/${metadataCID}`

    // Mint NFT on blockchain
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/your-api-key')
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)
    
    const nftContract = new ethers.Contract(
      process.env.NFT_CONTRACT_ADDRESS!,
      NFT_ABI,
      wallet
    )

    // Mint the NFT
    const mintTx = await nftContract.mint(userAddress, tokenURI, score, username, displayName)
    const receipt = await mintTx.wait()
    
    // Get token ID from transaction logs
    const tokenId = receipt.logs[0].topics[3] // Assuming the mint event emits the token ID

    // Add user to leaderboard after successful mint
    try {
      await addToLeaderboard(fid, username, pfpUrl || '', score)
      console.log(`User ${username} added to leaderboard after successful NFT mint`)
    } catch (leaderboardError) {
      console.error('Error adding user to leaderboard:', leaderboardError)
      // Continue even if leaderboard addition fails
    }

    return NextResponse.json({
      success: true,
      tokenId: tokenId,
      tokenURI: tokenURI,
      imageURL: imageURL,
      transactionHash: receipt.hash,
      metadata: metadata
    })

  } catch (error) {
    console.error('NFT minting error:', error)
    return NextResponse.json(
      { error: 'Failed to mint NFT', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}