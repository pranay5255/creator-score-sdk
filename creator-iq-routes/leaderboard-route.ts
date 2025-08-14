import { NextRequest, NextResponse } from 'next/server'
import { getLeaderboard, getUserRank } from '@/lib/mongodb'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const fid = searchParams.get('fid')

    // Get leaderboard entries
    const leaderboard = await getLeaderboard(limit)

    // If FID is provided, get user's rank
    let userRank = null
    if (fid) {
      userRank = await getUserRank(parseInt(fid))
    }

    return NextResponse.json({
      success: true,
      leaderboard,
      userRank,
      total: leaderboard.length
    })

  } catch (error) {
    console.error('Leaderboard error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch leaderboard' },
      { status: 500 }
    )
  }
}