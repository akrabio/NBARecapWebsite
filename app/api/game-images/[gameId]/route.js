import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { gameId } = await params;

    if (!gameId) {
      return NextResponse.json(
        { error: 'Game ID is required' },
        { status: 400 }
      );
    }

    // Fetch game data from ESPN which includes images
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
    const response = await fetch(espnUrl);

    if (!response.ok) {
      throw new Error('Failed to fetch game data from ESPN');
    }

    const data = await response.json();
    const images = [];

    // Helper function to check if an image is likely a team logo
    const isTeamLogo = (url) => {
      if (!url) return true;
      const lowerUrl = url.toLowerCase();
      return lowerUrl.includes('/team/') ||
             lowerUrl.includes('/logo') ||
             lowerUrl.includes('teamlogos') ||
             lowerUrl.match(/\/[a-z]{2,3}\.(png|svg|gif)/); // Short team abbreviations
    };

    // Helper to check if caption is a very generic highlight (team vs team only)
    const isVeryGenericHighlight = (caption) => {
      if (!caption) return false;
      const lowerCaption = caption.toLowerCase();

      // Only exclude the most generic captions (just team names and vs)
      const veryGenericPhrases = [
        'game preview',
        'full game',
        'extended highlights'
      ];

      // Check if it's ONLY "Team vs Team" with no other content
      const isOnlyTeamVsTeam = /^[a-z\s]+ vs\.? [a-z\s]+$/i.test(caption.trim());

      return veryGenericPhrases.some(phrase => lowerCaption.includes(phrase)) || isOnlyTeamVsTeam;
    };

    // Helper function to check if caption mentions specific player(s)
    const hasSpecificPlayer = (caption) => {
      if (!caption) return false;
      const lowerCaption = caption.toLowerCase();

      // Common player action keywords that indicate a specific player action
      const actionKeywords = [
        'scores', 'shoots', 'dunks', 'drives', 'passes',
        'rebounds', 'blocks', 'steals', 'celebrates',
        'defends', 'assists', 'layup', 'jumper', 'dribbles',
        'makes', 'hits', 'sinks', 'throws down', 'points'
      ];

      // Check if caption contains action keywords
      const hasAction = actionKeywords.some(keyword => lowerCaption.includes(keyword));

      // Check for common name patterns (capital letters suggest proper names)
      const hasCapitalizedWords = /[A-Z][a-z]+ [A-Z][a-z]+/.test(caption);

      return hasAction || hasCapitalizedWords;
    };

    // Helper to score images based on likelihood of being player action shots
    const scoreImage = (img) => {
      let score = 5; // Base score for any valid image
      const caption = img.caption || '';

      // Penalize very generic highlights
      if (isVeryGenericHighlight(caption)) {
        score -= 10;
      }

      // Reward specific player mentions
      if (hasSpecificPlayer(caption)) {
        score += 20;
      }

      // Reward "highlights" if it has other content
      if (caption.toLowerCase().includes('highlights') && caption.length > 30) {
        score += 5;
      }

      // Longer captions often describe specific actions
      if (caption.length > 40) score += 8;
      if (caption.length > 20) score += 3;

      // Prioritize video thumbnails - they almost always have player-specific captions
      if (img.type === 'video_thumbnail') score += 15;
      if (img.type === 'header') score += 5;
      if (img.type === 'article') score += 7;
      if (img.type === 'story') score += 4;
      if (img.type === 'action') score += 6;

      return score;
    };

    // Extract various in-game images from the ESPN response
    // 1. VIDEO THUMBNAILS - Best source for player action shots!
    if (data.videos) {
      data.videos.forEach((video) => {
        if (video.thumbnail && !isTeamLogo(video.thumbnail)) {
          images.push({
            url: video.thumbnail,
            caption: video.headline || video.description || '',
            credit: 'ESPN',
            type: 'video_thumbnail'
          });
        }
      });
    }

    // 2. Header/Event image (usually game action photos)
    if (data.header?.story?.images) {
      data.header.story.images.forEach((img) => {
        if (img.url && !isTeamLogo(img.url)) {
          images.push({
            url: img.url,
            caption: img.caption || '',
            credit: img.credit || '',
            type: 'header'
          });
        }
      });
    }

    // 2. Article images if available (game action photos)
    if (data.article?.images) {
      data.article.images.forEach((img) => {
        if (img.url && !isTeamLogo(img.url)) {
          images.push({
            url: img.url,
            caption: img.caption || '',
            credit: img.credit || '',
            type: 'article'
          });
        }
      });
    }

    // 3. Story images (game highlights photos)
    if (data.stories) {
      data.stories.forEach((story) => {
        if (story.images) {
          story.images.forEach((img) => {
            const caption = img.caption || story.headline || '';
            if (img.url && !isTeamLogo(img.url)) {
              images.push({
                url: img.url,
                caption: caption,
                credit: img.credit || '',
                type: 'story'
              });
            }
          });
        }
      });
    }

    // 4. Look for action photos in picturecenter if available
    if (data.picturecenter) {
      data.picturecenter.forEach((pic) => {
        if (pic.url && !isTeamLogo(pic.url)) {
          images.push({
            url: pic.url,
            caption: pic.caption || '',
            credit: pic.credit || '',
            type: 'action'
          });
        }
      });
    }

    // 5. Check for plays/highlights with player details
    if (data.plays) {
      data.plays.forEach((play) => {
        if (play.image?.url && !isTeamLogo(play.image.url)) {
          const caption = play.text || play.description || '';
          images.push({
            url: play.image.url,
            caption: caption,
            credit: play.image.credit || '',
            type: 'play'
          });
        }
      });
    }

    // Sort images by score (prioritize player action shots) and filter out negative scores
    const sortedImages = images
      .map(img => ({ ...img, score: scoreImage(img) }))
      .filter(img => img.score > 0) // Only keep images with positive scores (player-specific)
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      images: sortedImages.slice(0, 2).map(({ score, ...img }) => img),
      gameId
    });

  } catch (error) {
    console.error('Error fetching game images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game images', details: error.message },
      { status: 500 }
    );
  }
}
