// Finds a game's highlights video on TheGametimeHighlights channel by
// scraping the channel's latest uploads (about the last 30).
import { parseDateKey } from "@/lib/dates";

const CHANNEL_URL = "https://www.youtube.com/@TheGametimeHighlights/videos";
const CHANNEL_TTL = 30 * 60 * 1000;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

let channelCache = { at: 0, videos: [] };

// A grid item → { videoId, title }. YouTube serves the newer lockupViewModel
// shape; videoRenderer is the older one.
function toVideo(content) {
  const lockup = content?.lockupViewModel;
  if (lockup?.contentId) {
    return { videoId: lockup.contentId, title: lockup.metadata?.lockupMetadataViewModel?.title?.content || "" };
  }
  const video = content?.videoRenderer;
  if (video?.videoId) {
    return { videoId: video.videoId, title: video.title?.runs?.map((r) => r.text).join("") || "" };
  }
  return null;
}

// Latest uploads ({ videoId, title }), newest first. Concurrent callers (e.g.
// warming a whole day's games) share one in-flight request.
let inflight = null;

function getChannelVideos() {
  if (Date.now() - channelCache.at < CHANNEL_TTL && channelCache.videos.length) {
    return Promise.resolve(channelCache.videos);
  }
  inflight ??= fetchChannelVideos().finally(() => {
    inflight = null;
  });
  return inflight;
}

// The channel page embeds its uploads as JSON in `var ytInitialData = {...};</script>`.
async function fetchChannelVideos() {
  const response = await fetch(CHANNEL_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store", // the page is larger than Next's data cache allows; cached in memory instead
  });
  if (!response.ok) throw new Error(`YouTube channel request failed: ${response.status}`);

  const html = await response.text();
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!match) throw new Error("Could not find ytInitialData");

  const tabs = JSON.parse(match[1]).contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const grid = tabs.find((tab) => tab.tabRenderer?.content?.richGridRenderer)?.tabRenderer.content.richGridRenderer;
  const videos = (grid?.contents || []).map((item) => toVideo(item.richItemRenderer?.content)).filter(Boolean);

  channelCache = { at: Date.now(), videos };
  return videos;
}

// "Los Angeles Lakers" → /\blakers\b/i. Whole words, so "Nets" doesn't match "Hornets".
function nicknamePattern(team) {
  const nickname = /trail blazers/i.test(team) ? "Blazers" : team.trim().split(/\s+/).pop();
  return new RegExp(`\\b${nickname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
}

// A month-name date in the title ("Oct 22, 2025", "October 22"), or null.
function titleDate(title, year) {
  const match = title.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s*(\d{4}))?/i);
  if (!match) return null;
  return new Date(Number(match[3]) || year, MONTHS.indexOf(match[1].toLowerCase()), Number(match[2]));
}

// The video for a game among `videos` ({ videoId, title }, newest first), or
// null. Both teams must be in the title. Titles that carry a date must be
// within a day of the game, so another meeting (e.g. the previous playoff
// game) isn't picked up.
export function matchVideo(videos, awayTeam, homeTeam, dateKey) {
  const date = parseDateKey(dateKey);
  if (!awayTeam || !homeTeam || !date) return null;
  const awayRe = nicknamePattern(awayTeam);
  const homeRe = nicknamePattern(homeTeam);
  const match = videos.find(({ title }) => {
    if (!awayRe.test(title) || !homeRe.test(title)) return false;
    const dated = titleDate(title, date.getFullYear());
    return !dated || Math.abs(dated - date) <= DAY_MS;
  });
  return match?.videoId || null;
}

// The video id for a game, or null if the channel's recent uploads don't have it.
export async function findHighlightsVideo(awayTeam, homeTeam, dateKey) {
  if (!awayTeam || !homeTeam || !parseDateKey(dateKey)) return null;
  return matchVideo(await getChannelVideos(), awayTeam, homeTeam, dateKey);
}
