import { nbaEnToHe } from "./consts";

/**
 * Extract team record from game title string
 * Supports both English and Hebrew team names
 * @param {string} title - Game title containing team records
 * @param {string} teamName - English team name
 * @returns {string|null} - Record string (e.g., "23-19") or null
 */
export function extractRecord(title, teamName) {
  if (!title || !teamName) return null;

  // Normalize apostrophes in title (Hebrew geresh ׳ and regular apostrophe ')
  const normalizedTitle = title.replace(/[׳']/g, "'");

  // Try English name first (format: "Lakers (23-19)")
  let regex = new RegExp(`${teamName}[^(]*\\((\\d+-\\d+)\\)`, 'i');
  let match = normalizedTitle.match(regex);
  if (match) return match[1];

  // Try Hebrew name if available
  const hebrewName = nbaEnToHe[teamName];
  if (hebrewName) {
    // Normalize the Hebrew name as well to match normalized title
    const normalizedHebrewName = hebrewName.replace(/[׳']/g, "'");
    regex = new RegExp(`${normalizedHebrewName}\\s*\\((\\d+-\\d+)\\)`, 'i');
    match = normalizedTitle.match(regex);
    if (match) return match[1];
  }

  return null;
}

/**
 * Generate team logo URL path
 * @param {string} teamName - English team name
 * @returns {string} - Logo URL path
 */
export function getTeamLogoUrl(teamName) {
  if (!teamName) return '/logos/default.png';
  return `/logos/${teamName.toLowerCase().replace(/\s+/g, '-')}.png`;
}

/**
 * Get team initials for fallback display
 * @param {string} teamName - Team name (English or Hebrew)
 * @returns {string} - Two-letter initials
 */
export function getTeamInitials(teamName) {
  if (!teamName) return 'TM';

  // For Hebrew names, take first two characters
  if (/[\u0590-\u05FF]/.test(teamName)) {
    return teamName.substring(0, 2);
  }

  // For English names, take initials of words
  return teamName
    .split(' ')
    .map(w => w[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
}
