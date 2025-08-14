import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserFromDatabase, saveUserToDatabase } from '@/lib/mongodb'

const requestSchema = z.object({
  query: z.string().min(1).max(100),
})

interface NeynarUser {
  object: string
  fid: number
  username: string
  display_name: string
  pfp_url?: string
  profile?: {
    bio?: {
      text: string
    }
  }
  follower_count: number
  following_count: number
  verifications?: string[]
  verified_accounts?: Array<{ platform: string; username: string }>
  power_badge?: boolean
  experimental?: {
    neynar_user_score?: number
  }
}

interface NeynarUserResponse {
  user: NeynarUser
}

async function searchFarcasterUsers(query: string): Promise<NeynarUser[]> {
  // Clean the query - remove @ if present and trim whitespace
  const cleanQuery = query.replace(/^@/, '').trim()
  
  if (!cleanQuery) {
    return []
  }
console.log(cleanQuery)
  const url = `https://api.neynar.com/v2/farcaster/user/by_username/?username=${cleanQuery}`
  const options = {
    method: 'GET',
    headers: {
      'x-api-key': process.env.NEYNAR_API_KEY || '13353819-7A07-4388-9734-4DF0C57382AB',
      'x-neynar-experimental': 'false'
    }
  }

  try {
    const response = await fetch(url, options)
    // console.log( await response.json())
    if (!response.ok) {
      if (response.status === 404) {
        // User not found
        return []
      }
      throw new Error(`Neynar API error: ${response.status}`)
    }
    
    const data = await response.json()
    console.log(data)
    if (data.user) {
      return [data.user]
    }
    return []
  } catch (error) {
    console.error('Error searching users:', error)
    return []
  }
}

export async function POST(request: NextRequest) {
  try {
    const requestJson = await request.json()
    const requestBody = requestSchema.safeParse(requestJson)

    if (requestBody.success === false) {
      return Response.json(
        { success: false, errors: requestBody.error.errors },
        { status: 400 }
      )
    }

    const { query } = requestBody.data

    // Clean the query - remove @ if present and trim whitespace
    const cleanQuery = query.replace(/^@/, '').trim()
    
    if (!cleanQuery) {
      return Response.json({
        success: true,
        users: [],
        message: 'No query provided'
      })
    }

    // First, check MongoDB database for cached user
    console.log(`Checking database for user: ${cleanQuery}`)
    const cachedUser = await getUserFromDatabase(cleanQuery)
    
    if (cachedUser) {
      console.log(`User found in database: ${cachedUser.username}`)
      // Transform cached user to match our interface
      const transformedUser = {
        fid: cachedUser.fid,
        username: cachedUser.username,
        displayName: cachedUser.display_name,
        pfpUrl: cachedUser.pfp_url,
        followerCount: cachedUser.follower_count,
        followingCount: cachedUser.following_count,
        bio: cachedUser.profile?.bio?.text,
        verifiedAccounts: cachedUser.verified_accounts || []
      }

      return Response.json({
        success: true,
        users: [transformedUser],
        source: 'database'
      })
    }

    // If not in database, fetch from Neynar API
    console.log(`User not found in database, fetching from API: ${cleanQuery}`)
    const users = await searchFarcasterUsers(cleanQuery)

    if (users.length === 0) {
      return Response.json({
        success: true,
        users: [],
        message: 'No users found'
      })
    }

    // Save the user to database for future requests
    try {
      await saveUserToDatabase(users[0])
      console.log(`User saved to database: ${users[0].username}`)
    } catch (dbError) {
      console.error('Error saving user to database:', dbError)
      // Continue even if database save fails
    }

    // Transform the data to match our interface
    const transformedUsers = users.map(user => ({
      fid: user.fid,
      username: user.username,
      displayName: user.display_name,
      pfpUrl: user.pfp_url,
      followerCount: user.follower_count,
      followingCount: user.following_count,
      bio: user.profile?.bio?.text,
      verifiedAccounts: user.verified_accounts || []
    }))

    return Response.json({
      success: true,
      users: transformedUsers,
      source: 'api'
    })

  } catch (error) {
    console.error('User search error:', error)
    return Response.json(
      { 
        success: false, 
        error: 'Failed to search users. Please try again later.' 
      },
      { status: 500 }
    )
  }
}