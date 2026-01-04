import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      );
    }

    // Search within TheGametimeHighlights channel
    const channelUrl = 'https://www.youtube.com/@TheGametimeHighlights/videos';
    const response = await fetch(channelUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch YouTube channel');
    }

    const html = await response.text();

    // Extract all video IDs and titles from the channel page
    // YouTube's structure has videoId and title in specific JSON objects
    // We need to find the ytInitialData object and parse it properly
    const ytInitialDataMatch = html.match(/var ytInitialData = ({.+?});/);

    if (!ytInitialDataMatch) {
      return NextResponse.json(
        { error: 'Could not parse YouTube data' },
        { status: 500 }
      );
    }

    const ytData = JSON.parse(ytInitialDataMatch[1]);
    const videos = [];

    // Navigate through YouTube's data structure to find videos
    try {
      const tabs = ytData.contents.twoColumnBrowseResultsRenderer.tabs;
      const videosTab = tabs.find(tab => tab.tabRenderer?.content?.richGridRenderer);

      if (videosTab) {
        const contents = videosTab.tabRenderer.content.richGridRenderer.contents;

        contents.forEach(item => {
          if (item.richItemRenderer?.content?.videoRenderer) {
            const video = item.richItemRenderer.content.videoRenderer;
            videos.push({
              videoId: video.videoId,
              title: video.title.runs[0].text
            });
          }
        });
      }
    } catch (e) {
      console.error('Error parsing YouTube data structure:', e);
    }

    if (videos.length === 0) {
      return NextResponse.json(
        { error: 'No videos found on channel' },
        { status: 404 }
      );
    }

    // Search for matching video based on query
    // The query format is: "TeamA vs TeamB highlights Date"
    const queryLower = query.toLowerCase();

    // Extract team names from query (everything before "highlights")
    const teamsMatch = queryLower.match(/^(.+?)\s+vs\s+(.+?)\s+highlights/);

    if (!teamsMatch) {
      // Fallback to most recent if query format is wrong
      return NextResponse.json({ videoId: videos[0].videoId });
    }

    const team1 = teamsMatch[1].trim();
    const team2 = teamsMatch[2].trim();

    // Find video that contains BOTH team names
    const matchedVideo = videos.find(video => {
      const titleLower = video.title.toLowerCase();

      // Check if both teams appear in the title
      const hasTeam1 = titleLower.includes(team1);
      const hasTeam2 = titleLower.includes(team2);

      return hasTeam1 && hasTeam2;
    });

    if (matchedVideo) {
      return NextResponse.json({ videoId: matchedVideo.videoId });
    }

    // If no exact match, try to find a video with at least one team
    const partialMatch = videos.find(video => {
      const titleLower = video.title.toLowerCase();
      return titleLower.includes(team1) || titleLower.includes(team2);
    });

    if (partialMatch) {
      return NextResponse.json({ videoId: partialMatch.videoId });
    }

    // If no match found, return the most recent video
    return NextResponse.json({ videoId: videos[0].videoId });

  } catch (error) {
    console.error('YouTube search error:', error);
    return NextResponse.json(
      { error: 'Failed to search YouTube' },
      { status: 500 }
    );
  }
}
