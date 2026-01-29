import { nbaEnToHe } from "./consts";

/**
 * Normalize apostrophe-like characters to a standard apostrophe
 * @param {string} str - String to normalize
 * @returns {string} - Normalized string
 */
function normalizeApostrophes(str) {
  return str.replace(/[׳''']/g, "'");
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Edit distance
 */
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Find a fuzzy match for a team name in the title and extract the record
 * @param {string} title - Normalized title string
 * @param {string} targetName - Team name to find (normalized)
 * @param {number} maxDistance - Maximum Levenshtein distance allowed
 * @returns {string|null} - Record string or null
 */
function fuzzyExtractRecord(title, targetName, maxDistance = 3) {
  // Find all patterns like "text (record)" in the title
  const recordPattern = /([^\d(]+?)\s*\((\d+[:-]\d+)\)/g;
  let match;

  while ((match = recordPattern.exec(title)) !== null) {
    const foundName = match[1].trim();
    const record = match[2];

    // Check if the found name is close enough to the target
    const distance = levenshtein(normalizeApostrophes(foundName), targetName);
    if (distance <= maxDistance) {
      return record;
    }
  }

  return null;
}

/**
 * Extract team record from game title string
 * Supports both English and Hebrew team names with fuzzy matching
 * @param {string} title - Game title containing team records
 * @param {string} teamName - English team name
 * @returns {string|null} - Record string (e.g., "23-19") or null
 */
export function extractRecord(title, teamName) {
  if (!title || !teamName) return null;

  const normalizedTitle = normalizeApostrophes(title);

  // Try English name first (exact match)
  let regex = new RegExp(`${teamName}[^(]*\\((\\d+[:-]\\d+)\\)`, 'i');
  let match = normalizedTitle.match(regex);
  if (match) return match[1];

  // Try Hebrew name if available
  const hebrewName = nbaEnToHe[teamName];
  if (hebrewName) {
    const normalizedHebrewName = normalizeApostrophes(hebrewName);

    // Try exact match first
    regex = new RegExp(`${normalizedHebrewName}\\s*\\((\\d+[:-]\\d+)\\)`, 'i');
    match = normalizedTitle.match(regex);
    if (match) return match[1];

    // Fall back to fuzzy matching for spelling variations
    const fuzzyResult = fuzzyExtractRecord(normalizedTitle, normalizedHebrewName);
    if (fuzzyResult) return fuzzyResult;
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
