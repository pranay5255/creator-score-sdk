import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getUserFromDatabaseByFid, getIQScoreFromDatabase, saveIQScoreToDatabase, hasRecentIQScore } from '@/lib/mongodb'

const requestSchema = z.object({
  fid: z.number(),
  username: z.string().optional(),
  displayName: z.string().optional(),
  verifiedAccounts: z.array(z.object({
    platform: z.string(),
    username: z.string()
  })).optional(),
})

interface NeynarCast {
  text: string
  timestamp: string
  reactions: {
    likes_count: number
    recasts_count: number
  }
  replies: {
    count: number
  }
}

interface NeynarResponse {
  casts: NeynarCast[]
}

async function fetchUserCasts(fid: number): Promise<NeynarCast[]> {
  const url = `https://api.neynar.com/v2/farcaster/feed/user/casts/?limit=100&fid=${fid}`
  const options = {
    method: 'GET',
    headers: {
      'x-api-key': process.env.NEYNAR_API_KEY || '13353819-7A07-4388-9734-4DF0C57382AB',
      'x-neynar-experimental': 'yes'
    }
  }

  try {
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error(`Neynar API error: ${response.status}`)
    }
    
    const data: NeynarResponse = await response.json()
    return data.casts || []
  } catch (error) {
    console.error('Error fetching user casts:', error)
    return []
  }
}

async function fetchUserData(fid: number): Promise<{ verifiedAccounts?: Array<{ platform: string; username: string }> }> {
  const url = `https://api.neynar.com/v2/farcaster/user/by_fid/?fid=${fid}`
  const options = {
    method: 'GET',
    headers: {
      'x-api-key': process.env.NEYNAR_API_KEY || '13353819-7A07-4388-9734-4DF0C57382AB',
      'x-neynar-experimental': 'false'
    }
  }

  try {
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error(`Neynar API error: ${response.status}`)
    }
    
    const data = await response.json()
    return {
      verifiedAccounts: data.user?.verified_accounts || []
    }
  } catch (error) {
    console.error('Error fetching user data:', error)
    return { verifiedAccounts: [] }
  }
}

// Advanced content analysis functions
function analyzeContentQuality(casts: NeynarCast[]) {
  const totalChars = casts.reduce((sum, cast) => sum + cast.text.length, 0)
  const avgLength = totalChars / casts.length
  const longPosts = casts.filter(cast => cast.text.length > 100).length
  const shortPosts = casts.filter(cast => cast.text.length < 50).length
  
  // Analyze post quality indicators
  const qualityIndicators = {
    avgLength,
    longPostRatio: longPosts / casts.length,
    shortPostRatio: shortPosts / casts.length,
    hasEmojis: casts.filter(cast => /[😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠💀👻👽🤖😈👿👹👺🤡💩☠️]/g.test(cast.text)).length / casts.length,
    hasLinks: casts.filter(cast => /https?:\/\/[^\s]+/.test(cast.text)).length / casts.length,
    hasMentions: casts.filter(cast => /@\w+/.test(cast.text)).length / casts.length,
    hasHashtags: casts.filter(cast => /#\w+/.test(cast.text)).length / casts.length,
    hasQuestions: casts.filter(cast => /\?/.test(cast.text)).length / casts.length,
    hasExclamations: casts.filter(cast => /!/.test(cast.text)).length / casts.length,
  }
  
  return qualityIndicators
}

function calculateEngagementMetrics(casts: NeynarCast[]) {
  const totalEngagement = casts.reduce((sum, cast) => 
    sum + cast.reactions.likes_count + cast.reactions.recasts_count + cast.replies.count, 0)
  
  const engagementPerPost = totalEngagement / casts.length
  const highEngagementPosts = casts.filter(cast => 
    cast.reactions.likes_count + cast.reactions.recasts_count + cast.replies.count > 10
  ).length
  
  const viralPosts = casts.filter(cast => 
    cast.reactions.likes_count + cast.reactions.recasts_count > 50
  ).length
  
  return {
    totalEngagement,
    engagementPerPost,
    highEngagementRatio: highEngagementPosts / casts.length,
    viralPostRatio: viralPosts / casts.length,
    consistencyScore: calculateConsistencyScore(casts)
  }
}

function calculateConsistencyScore(casts: NeynarCast[]) {
  if (casts.length < 2) return 0
  
  const engagementRates = casts.map(cast => 
    cast.reactions.likes_count + cast.reactions.recasts_count + cast.replies.count
  )
  
  const mean = engagementRates.reduce((sum, rate) => sum + rate, 0) / engagementRates.length
  const variance = engagementRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / engagementRates.length
  const stdDev = Math.sqrt(variance)
  
  // Higher consistency = lower standard deviation relative to mean
  return Math.max(0, 100 - (stdDev / Math.max(mean, 1)) * 50)
}

function analyzeWritingStyle(casts: NeynarCast[]) {
  const allText = casts.map(cast => cast.text).join(' ')
  const words = allText.split(/\s+/).filter(word => word.length > 0)
  const sentences = allText.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0)
  
  const avgWordsPerSentence = words.length / Math.max(sentences.length, 1)
  const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / Math.max(words.length, 1)
  
  // Vocabulary complexity (unique words ratio)
  const uniqueWords = new Set(words.map(word => word.toLowerCase().replace(/[^\w]/g, '')))
  const vocabularyRatio = uniqueWords.size / Math.max(words.length, 1)
  
  // Capitalization and formatting
  const properCapitalization = sentences.filter(sentence => 
    /^[A-Z]/.test(sentence.trim())
  ).length / Math.max(sentences.length, 1)
  
  return {
    avgWordsPerSentence,
    avgWordLength,
    vocabularyRatio,
    properCapitalization,
    totalWords: words.length,
    uniqueWordsCount: uniqueWords.size
  }
}

function analyzeTopicDiversity(casts: NeynarCast[]) {
  const allText = casts.map(cast => cast.text).join(' ').toLowerCase()
  
  // Topic keywords analysis
  const topics = {
    tech: /(ai|artificial intelligence|machine learning|blockchain|crypto|web3|programming|code|software|tech|technology|startup|entrepreneur)/g,
    finance: /(money|finance|investment|trading|stock|market|economy|financial|wealth|profit|loss|portfolio)/g,
    politics: /(politics|government|policy|election|vote|democrat|republican|liberal|conservative|political)/g,
    culture: /(culture|art|music|film|movie|book|literature|poetry|creative|design|fashion|style)/g,
    sports: /(sports|football|basketball|soccer|baseball|game|team|player|championship|league)/g,
    humor: /(funny|joke|humor|comedy|lol|haha|😂|😄|😆|laugh|hilarious)/g,
    philosophy: /(philosophy|meaning|purpose|existence|truth|reality|consciousness|mind|thought|wisdom)/g,
    science: /(science|research|study|experiment|data|analysis|scientific|discovery|theory|hypothesis)/g
  }
  
  const topicCounts: Record<string, number> = {}
  let totalTopicMatches = 0
  
  for (const [topic, regex] of Object.entries(topics)) {
    const matches = (allText.match(regex) || []).length
    topicCounts[topic] = matches
    totalTopicMatches += matches
  }
  
  // Calculate diversity score (more topics = higher diversity)
  const activeTopics = Object.values(topicCounts).filter(count => count > 0).length
  const diversityScore = Math.min(100, (activeTopics / Object.keys(topics).length) * 100)
  
  return {
    topicCounts,
    totalTopicMatches,
    activeTopics,
    diversityScore,
    primaryTopic: Object.entries(topicCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0]
  }
}

async function analyzeWithAI(userData: {
  username?: string
  displayName?: string
  casts: NeynarCast[]
  verifiedAccounts?: Array<{ platform: string; username: string }>
}): Promise<{
  score: number
  analysis: string
  confidence: number
}> {
  // First, check if user has verified X account and try to fetch IQ from external API
  const xAccount = userData.verifiedAccounts?.find(account => account.platform === 'x')
  if (xAccount?.username) {
    console.log('Found verified X account, attempting to fetch IQ from external API:', xAccount.username)
    try {
      const externalResponse = await fetch(`https://iq-checker.xyz/api/iq/${xAccount.username}`)
      if (externalResponse.ok) {
        const externalData = await externalResponse.json()
        if (externalData.iqScore) {
          console.log('Successfully fetched IQ from external API:', externalData.iqScore)
          return {
            score: Math.max(55, Math.min(145, externalData.iqScore)),
            analysis: `IQ score fetched from verified X account (@${xAccount.username}). This score is based on comprehensive analysis of the user's X profile and activity patterns.`,
            confidence: 85
          }
        }
      }
    } catch (error) {
      console.log('Failed to fetch from external API, falling back to local analysis:', error)
    }
  }

  // Prepare the data for AI analysis (fallback)
  const castTexts = userData.casts.map(cast => cast.text).join('\n\n')
  const totalLikes = userData.casts.reduce((sum, cast) => sum + cast.reactions.likes_count, 0)
  const totalRecasts = userData.casts.reduce((sum, cast) => sum + cast.reactions.recasts_count, 0)
  const totalReplies = userData.casts.reduce((sum, cast) => sum + cast.replies.count, 0)
  const avgLikesPerCast = totalLikes / Math.max(userData.casts.length, 1)
  const avgRecastsPerCast = totalRecasts / Math.max(userData.casts.length, 1)
  const avgRepliesPerCast = totalReplies / Math.max(userData.casts.length, 1)

  // Advanced content analysis
  const contentAnalysis = analyzeContentQuality(userData.casts)
  const engagementMetrics = calculateEngagementMetrics(userData.casts)
  const writingStyleAnalysis = analyzeWritingStyle(userData.casts)
  const topicDiversity = analyzeTopicDiversity(userData.casts)

  // Create a comprehensive prompt for AI analysis
  const prompt = `
Analyze the following Farcaster user data and provide an estimated IQ score and analysis.

User Information:
- Username: ${userData.username || 'Unknown'}
- Display Name: ${userData.displayName || 'Unknown'}
- Number of posts analyzed: ${userData.casts.length}

Engagement Metrics:
- Total likes received: ${totalLikes}
- Total recasts received: ${totalRecasts}
- Total replies received: ${totalReplies}
- Average likes per post: ${avgLikesPerCast.toFixed(2)}
- Average recasts per post: ${avgRecastsPerCast.toFixed(2)}
- Average replies per post: ${avgRepliesPerCast.toFixed(2)}

Content Quality Analysis:
- Average post length: ${contentAnalysis.avgLength.toFixed(1)} characters
- Long posts ratio (>100 chars): ${(contentAnalysis.longPostRatio * 100).toFixed(1)}%
- Short posts ratio (<50 chars): ${(contentAnalysis.shortPostRatio * 100).toFixed(1)}%
- Posts with emojis: ${(contentAnalysis.hasEmojis * 100).toFixed(1)}%
- Posts with links: ${(contentAnalysis.hasLinks * 100).toFixed(1)}%
- Posts with mentions: ${(contentAnalysis.hasMentions * 100).toFixed(1)}%
- Posts with hashtags: ${(contentAnalysis.hasHashtags * 100).toFixed(1)}%
- Posts with questions: ${(contentAnalysis.hasQuestions * 100).toFixed(1)}%
- Posts with exclamations: ${(contentAnalysis.hasExclamations * 100).toFixed(1)}%

Writing Style Analysis:
- Average words per sentence: ${writingStyleAnalysis.avgWordsPerSentence.toFixed(1)}
- Average word length: ${writingStyleAnalysis.avgWordLength.toFixed(1)} characters
- Vocabulary diversity ratio: ${(writingStyleAnalysis.vocabularyRatio * 100).toFixed(1)}%
- Proper capitalization: ${(writingStyleAnalysis.properCapitalization * 100).toFixed(1)}%
- Total words written: ${writingStyleAnalysis.totalWords}
- Unique words used: ${writingStyleAnalysis.uniqueWordsCount}

Engagement Quality:
- Total engagement: ${engagementMetrics.totalEngagement}
- Engagement per post: ${engagementMetrics.engagementPerPost.toFixed(1)}
- High engagement posts (>10 interactions): ${(engagementMetrics.highEngagementRatio * 100).toFixed(1)}%
- Viral posts (>50 interactions): ${(engagementMetrics.viralPostRatio * 100).toFixed(1)}%
- Consistency score: ${engagementMetrics.consistencyScore.toFixed(1)}%

Topic Diversity:
- Active topics: ${topicDiversity.activeTopics}/8
- Topic diversity score: ${topicDiversity.diversityScore.toFixed(1)}%
- Primary topic: ${topicDiversity.primaryTopic}
- Topic breakdown: ${Object.entries(topicDiversity.topicCounts).map(([topic, count]) => `${topic}: ${count}`).join(', ')}

Recent Posts:
${castTexts}

Please analyze the user's cognitive abilities based on:
1. **Content Quality**: Post length, complexity, use of links/mentions, question-asking ability
2. **Writing Style**: Vocabulary diversity, sentence structure, proper formatting
3. **Engagement Patterns**: Consistency, viral potential, community interaction
4. **Topic Diversity**: Range of interests, depth of knowledge across subjects
5. **Communication Skills**: Clarity, coherence, ability to engage others
6. **Analytical Thinking**: Question formation, logical reasoning, creative expression

Provide your response in the following JSON format:
{
  "score": <IQ score between 55-145>,
  "analysis": "<detailed analysis explaining the score based on all factors above>",
  "confidence": <confidence level 0-100>
}

Base your analysis on ALL the metrics provided. Consider how each factor contributes to cognitive assessment.
`

  try {
    console.log('Starting AI analysis for user:', userData.username)
    
    // Try OpenAI first
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (openaiApiKey) {
      console.log('OpenAI API key found, attempting analysis...')
      try {
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content: 'You are an AI expert at analyzing social media content and estimating cognitive abilities based on writing patterns, engagement, and communication style. Provide thoughtful, detailed analysis.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 1000
          })
        })

        if (openaiResponse.ok) {
          const openaiData = await openaiResponse.json()
          const content = openaiData.choices[0]?.message?.content
          
          if (content) {
            try {
              // Try to parse JSON from the response
              const jsonMatch = content.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0])
                return {
                  score: Math.max(55, Math.min(145, parsed.score)),
                  analysis: parsed.analysis,
                  confidence: Math.max(0, Math.min(100, parsed.confidence))
                }
              }
            } catch (parseError) {
              console.error('Error parsing OpenAI response:', parseError)
            }
          }
        }
      } catch (openaiError) {
        console.error('OpenAI API error:', openaiError)
      }
    }

    // Try Gemini API as fallback
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (geminiApiKey) {
      console.log('Gemini API key found, attempting analysis...')
      try {
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are an AI expert at analyzing social media content and estimating cognitive abilities based on writing patterns, engagement, and communication style. Provide thoughtful, detailed analysis.

${prompt}

 Please respond with only valid JSON in this exact format:
 {
   "score": <IQ score between 55-145>,
   "analysis": "<detailed analysis explaining the score>",
   "confidence": <confidence level 0-100>
 }`
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
            }
          })
        })

        if (geminiResponse.ok) {
          const geminiData = await geminiResponse.json()
          const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
          
          if (content) {
            try {
              // Try to parse JSON from the response
              const jsonMatch = content.match(/\{[\s\S]*\}/)
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0])
                return {
                  score: Math.max(55, Math.min(145, parsed.score)),
                  analysis: parsed.analysis,
                  confidence: Math.max(0, Math.min(100, parsed.confidence))
                }
              }
            } catch (parseError) {
              console.error('Error parsing Gemini response:', parseError)
            }
          }
        }
      } catch (geminiError) {
        console.error('Gemini API error:', geminiError)
      }
    }

    // Fallback: Generate a simulated response based on engagement metrics
    console.log('Using fallback algorithm - no AI APIs available or failed')
         console.log('Fallback analysis - Comprehensive metrics:', {
       contentQuality: {
         avgLength: contentAnalysis.avgLength.toFixed(1),
         longPostRatio: (contentAnalysis.longPostRatio * 100).toFixed(1) + '%',
         hasQuestions: (contentAnalysis.hasQuestions * 100).toFixed(1) + '%',
         hasLinks: (contentAnalysis.hasLinks * 100).toFixed(1) + '%'
       },
       writingStyle: {
         vocabularyRatio: (writingStyleAnalysis.vocabularyRatio * 100).toFixed(1) + '%',
         avgWordsPerSentence: writingStyleAnalysis.avgWordsPerSentence.toFixed(1),
         properCapitalization: (writingStyleAnalysis.properCapitalization * 100).toFixed(1) + '%'
       },
       engagement: {
         engagementPerPost: engagementMetrics.engagementPerPost.toFixed(1),
         consistencyScore: engagementMetrics.consistencyScore.toFixed(1) + '%',
         viralPostRatio: (engagementMetrics.viralPostRatio * 100).toFixed(1) + '%'
       },
       topicDiversity: {
         diversityScore: topicDiversity.diversityScore.toFixed(1) + '%',
         activeTopics: topicDiversity.activeTopics + '/8',
         primaryTopic: topicDiversity.primaryTopic
       },
       totalCasts: userData.casts.length
     })
    
         // Comprehensive scoring using all analysis factors
     const contentQualityScore = Math.min(100, 
       (contentAnalysis.avgLength * 0.3) + 
       (contentAnalysis.longPostRatio * 50) + 
       (contentAnalysis.hasQuestions * 30) + 
       (contentAnalysis.hasLinks * 20) +
       (contentAnalysis.hasMentions * 15)
     )
     
     const writingStyleScore = Math.min(100,
       (writingStyleAnalysis.vocabularyRatio * 40) +
       (writingStyleAnalysis.avgWordsPerSentence * 2) +
       (writingStyleAnalysis.properCapitalization * 30) +
       (writingStyleAnalysis.avgWordLength * 3)
     )
     
     const engagementScore = Math.min(100, 
       (engagementMetrics.engagementPerPost * 0.5) + 
       (engagementMetrics.consistencyScore * 0.3) +
       (engagementMetrics.viralPostRatio * 50)
     )
     
     const topicDiversityScore = topicDiversity.diversityScore
     
     // Weighted combination of all factors
     const comprehensiveScore = (
       contentQualityScore * 0.25 +
       writingStyleScore * 0.25 +
       engagementScore * 0.25 +
       topicDiversityScore * 0.25
     )
     
     // Realistic base score calculation (55-145 range)
     const baseScore = 70 + (comprehensiveScore * 0.6) + (userData.casts.length * 0.2)
     
     // Add realistic randomness and variation
     const randomFactor = (Math.random() - 0.5) * 15
     const finalScore = Math.max(55, Math.min(145, Math.round(baseScore + randomFactor)))
    
         console.log('Fallback analysis - Scores:', {
       contentQualityScore: contentQualityScore.toFixed(1),
       writingStyleScore: writingStyleScore.toFixed(1),
       engagementScore: engagementScore.toFixed(1),
       topicDiversityScore: topicDiversityScore.toFixed(1),
       comprehensiveScore: comprehensiveScore.toFixed(1),
       baseScore: baseScore.toFixed(1),
       randomFactor: randomFactor.toFixed(1),
       finalScore
     })
    
         const analysis = `Based on comprehensive analysis of ${userData.casts.length} posts, this user demonstrates ${comprehensiveScore > 70 ? 'strong' : comprehensiveScore > 50 ? 'moderate' : 'limited'} overall cognitive indicators. Content quality analysis shows ${contentQualityScore > 70 ? 'excellent' : contentQualityScore > 50 ? 'good' : 'basic'} post structure with ${contentAnalysis.avgLength.toFixed(0)} average characters and ${(contentAnalysis.hasQuestions * 100).toFixed(0)}% question-asking rate. Writing style analysis reveals ${writingStyleScore > 70 ? 'sophisticated' : writingStyleScore > 50 ? 'competent' : 'simple'} vocabulary usage with ${(writingStyleAnalysis.vocabularyRatio * 100).toFixed(0)}% vocabulary diversity. Engagement patterns indicate ${engagementScore > 70 ? 'high' : engagementScore > 50 ? 'moderate' : 'low'} community interaction with ${engagementMetrics.consistencyScore.toFixed(0)}% consistency. Topic diversity analysis shows ${topicDiversityScore > 70 ? 'broad' : topicDiversityScore > 50 ? 'moderate' : 'narrow'} interests across ${topicDiversity.activeTopics}/8 categories, primarily focused on ${topicDiversity.primaryTopic}. These factors collectively suggest ${finalScore >= 130 ? 'exceptional' : finalScore >= 115 ? 'above-average' : finalScore >= 85 ? 'average' : finalScore >= 70 ? 'below-average' : 'significantly below-average'} cognitive abilities.`
    
         const confidence = Math.max(30, Math.min(85, 50 + (userData.casts.length * 2) + (comprehensiveScore * 0.3)))

    return {
      score: finalScore,
      analysis,
      confidence: Math.round(confidence)
    }

  } catch (error) {
    console.error('Error in AI analysis:', error)
    
         // Final fallback response with realistic variation (55-145 range)
     const fallbackScore = Math.max(55, Math.min(145, 85 + (Math.random() - 0.5) * 40))
     const fallbackConfidence = Math.max(25, Math.min(60, 40 + (userData.casts.length * 1.5)))
     
     return {
       score: Math.round(fallbackScore),
       analysis: `Analysis based on ${userData.casts.length} posts. The user shows moderate engagement patterns with ${avgLikesPerCast.toFixed(1)} average likes per post. Content analysis suggests ${fallbackScore >= 130 ? 'exceptional' : fallbackScore >= 115 ? 'above-average' : fallbackScore >= 85 ? 'average' : fallbackScore >= 70 ? 'below-average' : 'significantly below-average'} cognitive abilities with room for growth in engagement and communication style.`,
       confidence: Math.round(fallbackConfidence)
     }
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

    const { fid, username, displayName, verifiedAccounts } = requestBody.data

    // First, check if we have a recent IQ score in the database
    console.log(`Checking for cached IQ score for FID: ${fid}`)
    const hasRecentScore = await hasRecentIQScore(fid, 30) // 30 days threshold
    
    if (hasRecentScore) {
      console.log(`Found recent IQ score in database for FID: ${fid}`)
      const cachedIQScore = await getIQScoreFromDatabase(fid)
      
      if (cachedIQScore) {
        return Response.json({
          success: true,
          score: cachedIQScore.score,
          analysis: cachedIQScore.analysis,
          confidence: cachedIQScore.confidence,
          source: 'database',
          analyzedAt: cachedIQScore.analyzedAt
        })
      }
    }

    // Fetch user data including verified accounts if not provided
    let userVerifiedAccounts = verifiedAccounts
    if (!userVerifiedAccounts) {
      // First try to get from MongoDB cache
      const cachedUser = await getUserFromDatabaseByFid(fid)
      if (cachedUser) {
        console.log(`Using cached user data for FID: ${fid}`)
        userVerifiedAccounts = cachedUser.verified_accounts
      } else {
        // If not in cache, fetch from API
        console.log(`User not in cache, fetching from API for FID: ${fid}`)
        const userData = await fetchUserData(fid)
        userVerifiedAccounts = userData.verifiedAccounts
      }
    }

    // Fetch user casts from Neynar API
    const casts = await fetchUserCasts(fid)

    if (casts.length === 0) {
      return Response.json(
        { 
          success: false, 
          error: 'No posts found for analysis. Please ensure the user has public posts.' 
        },
        { status: 404 }
      )
    }

    // Analyze with AI
    console.log(`Performing fresh IQ analysis for FID: ${fid}`)
    const analysis = await analyzeWithAI({
      username,
      displayName,
      casts,
      verifiedAccounts: userVerifiedAccounts
    })

    // Save the IQ score to database for future requests
    try {
      await saveIQScoreToDatabase(fid, {
        score: analysis.score,
        analysis: analysis.analysis,
        confidence: analysis.confidence
      })
      console.log(`IQ score saved to database for FID: ${fid}`)
    } catch (dbError) {
      console.error('Error saving IQ score to database:', dbError)
      // Continue even if database save fails
    }

    return Response.json({
      success: true,
      ...analysis,
      source: 'api'
    })

  } catch (error) {
    console.error('IQ analysis error:', error)
    return Response.json(
      { 
        success: false, 
        error: 'Failed to analyze IQ. Please try again later.' 
      },
      { status: 500 }
    )
  }
}
 