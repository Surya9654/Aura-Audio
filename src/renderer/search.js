/**
 * Aura Audiophile Search Engine
 * 
 * Features:
 * - Tokenized multi-field querying across Title, Artist, Album, Format, Bit Depth, Sample Rate, and Path
 * - Order-independent search ("eagles 192k", "hotel acoustic master")
 * - Bounded Levenshtein typo-tolerant fuzzy matching
 * - Multi-tiered weighted relevance scoring (Exact > Prefix > Word Boundary > Substring > Fuzzy)
 * - Specialized audiophile qualifiers: hires, 24bit, 16bit, 96k, format:flac, artist:name, album:name
 * - Safe regex highlight generator with HTML escaping
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Fast bounded Levenshtein distance
 * Returns distance between strings a and b, or 999 if difference exceeds maxDistance
 */
export function levenshteinDistance(a, b, maxDistance = 2) {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDistance) return 999;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  // Single row dynamic programming for minimal memory and overhead
  let prevRow = new Array(lenB + 1);
  let currRow = new Array(lenB + 1);

  for (let j = 0; j <= lenB; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    currRow[0] = i;
    let minInRow = currRow[0];
    const charA = a[i - 1];

    for (let j = 1; j <= lenB; j++) {
      const cost = charA === b[j - 1] ? 0 : 1;
      const val = Math.min(
        prevRow[j] + 1,       // deletion
        currRow[j - 1] + 1,   // insertion
        prevRow[j - 1] + cost // substitution
      );
      currRow[j] = val;
      if (val < minInRow) minInRow = val;
    }

    if (minInRow > maxDistance) return 999;
    // Swap rows
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  const finalDist = prevRow[lenB];
  return finalDist <= maxDistance ? finalDist : 999;
}

/**
 * Splits text into cleaned words for word-boundary and fuzzy checks
 */
function getWords(text) {
  if (!text) return [];
  return text.toLowerCase().split(/[\s\-_,.:;()[\]'"]+/).filter(w => w.length > 0);
}

/**
 * Parses user query into structured filters and search tokens
 */
export function parseSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { tokens: [], filters: {} };
  }

  const rawTokens = rawQuery.trim().toLowerCase().split(/\s+/).filter(t => t.length > 0);
  const tokens = [];
  const filters = {
    hiresOnly: false,
    bitDepth: null,
    format: null,
    artistFilter: null,
    albumFilter: null
  };

  for (const tok of rawTokens) {
    if (tok === 'hires' || tok === 'hi-res') {
      filters.hiresOnly = true;
    } else if (tok === '24bit' || tok === '24-bit') {
      filters.bitDepth = 24;
    } else if (tok === '16bit' || tok === '16-bit') {
      filters.bitDepth = 16;
    } else if (tok === '32bit' || tok === '32-bit') {
      filters.bitDepth = 32;
    } else if (tok.startsWith('format:')) {
      filters.format = tok.replace('format:', '').trim();
    } else if (tok.startsWith('artist:')) {
      filters.artistFilter = tok.replace('artist:', '').trim();
    } else if (tok.startsWith('album:')) {
      filters.albumFilter = tok.replace('album:', '').trim();
    } else {
      tokens.push(tok);
    }
  }

  return { tokens, filters };
}

/**
 * Evaluates whether and how well a single token matches a track field
 */
function scoreTokenAgainstTrack(token, trackInfo) {
  let bestScore = 0;
  let isMatch = false;

  const {
    title,
    artist,
    album,
    format,
    techString,
    pathString,
    titleWords,
    artistWords,
    albumWords
  } = trackInfo;

  // 1. Direct Title Matching (Highest Priority)
  if (title === token) {
    bestScore = Math.max(bestScore, 120);
    isMatch = true;
  } else if (title.startsWith(token)) {
    bestScore = Math.max(bestScore, 85);
    isMatch = true;
  } else if (titleWords.some(w => w.startsWith(token))) {
    bestScore = Math.max(bestScore, 70);
    isMatch = true;
  } else if (title.includes(token)) {
    bestScore = Math.max(bestScore, 50);
    isMatch = true;
  }

  // 2. Artist Matching
  if (artist === token) {
    bestScore = Math.max(bestScore, 80);
    isMatch = true;
  } else if (artist.startsWith(token)) {
    bestScore = Math.max(bestScore, 60);
    isMatch = true;
  } else if (artistWords.some(w => w.startsWith(token))) {
    bestScore = Math.max(bestScore, 50);
    isMatch = true;
  } else if (artist.includes(token)) {
    bestScore = Math.max(bestScore, 35);
    isMatch = true;
  }

  // 3. Album Matching
  if (album === token) {
    bestScore = Math.max(bestScore, 65);
    isMatch = true;
  } else if (album.startsWith(token)) {
    bestScore = Math.max(bestScore, 45);
    isMatch = true;
  } else if (albumWords.some(w => w.startsWith(token))) {
    bestScore = Math.max(bestScore, 35);
    isMatch = true;
  } else if (album.includes(token)) {
    bestScore = Math.max(bestScore, 25);
    isMatch = true;
  }

  // 4. Technical Metadata (Format, Sample Rate, Bit Depth e.g. "96k", "192khz", "flac")
  if (format === token) {
    bestScore = Math.max(bestScore, 35);
    isMatch = true;
  } else if (techString.includes(token)) {
    bestScore = Math.max(bestScore, 30);
    isMatch = true;
  }

  // 5. File / Folder Path matching
  if (pathString.includes(token)) {
    bestScore = Math.max(bestScore, 15);
    isMatch = true;
  }

  // 6. Typo-Tolerant Fuzzy Matching (Levenshtein)
  // Only triggered if no exact/prefix/substring match was found and token length >= 3
  if (!isMatch && token.length >= 3) {
    const maxAllowedDist = token.length <= 4 ? 1 : 2;

    const allWords = [...titleWords, ...artistWords, ...albumWords];
    let minDistance = 999;

    for (const word of allWords) {
      if (Math.abs(word.length - token.length) <= maxAllowedDist) {
        const dist = levenshteinDistance(token, word, maxAllowedDist);
        if (dist <= maxAllowedDist && dist < minDistance) {
          minDistance = dist;
        }
      }
    }

    if (minDistance <= maxAllowedDist) {
      isMatch = true;
      // Closer match gets higher score: dist 1 => +18 pts, dist 2 => +10 pts
      const fuzzyScore = minDistance === 1 ? 18 : 10;
      bestScore = Math.max(bestScore, fuzzyScore);
    }
  }

  return { isMatch, score: bestScore };
}

/**
 * Searches a list of tracks with advanced tokenization, fuzzy matching, and relevance ranking
 * 
 * @param {Array} tracks Array of track objects
 * @param {string} rawQuery User search string
 * @param {string} currentFormatFilter 'FLAC' or 'ALL'
 * @returns {Object} { results: Array, queryTokens: Array }
 */
export function searchTracks(tracks, rawQuery = '', currentFormatFilter = 'ALL') {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { results: [], queryTokens: [] };
  }

  // 1. Apply format sidebar filter first (FLAC vs ALL)
  let pool = tracks;
  if (currentFormatFilter === 'FLAC') {
    pool = tracks.filter(t => 
      (t.format && t.format.toUpperCase() === 'FLAC') || 
      (t.path && t.path.toLowerCase().endsWith('.flac'))
    );
  }

  const { tokens, filters } = parseSearchQuery(rawQuery);

  // If query is empty and no specific filters are requested, return the pool as is
  if (tokens.length === 0 && !filters.hiresOnly && !filters.bitDepth && !filters.format && !filters.artistFilter && !filters.albumFilter) {
    return { results: [...pool], queryTokens: [] };
  }

  const scoredResults = [];

  for (let i = 0; i < pool.length; i++) {
    const track = pool[i];

    // Filter checks
    if (filters.hiresOnly) {
      const isHiRes = (track.sampleRate && track.sampleRate > 48000) || (track.bitsPerSample && track.bitsPerSample > 16);
      if (!isHiRes) continue;
    }

    if (filters.bitDepth !== null) {
      if (track.bitsPerSample !== filters.bitDepth) continue;
    }

    if (filters.format) {
      const tFormat = (track.format || '').toLowerCase();
      if (!tFormat.includes(filters.format)) continue;
    }

    if (filters.artistFilter) {
      const tArtist = (track.artist || '').toLowerCase();
      if (!tArtist.includes(filters.artistFilter)) continue;
    }

    if (filters.albumFilter) {
      const tAlbum = (track.album || '').toLowerCase();
      if (!tAlbum.includes(filters.albumFilter)) continue;
    }

    // Pre-extract search strings for this track
    const title = (track.title || '').toLowerCase();
    const artist = (track.artist || '').toLowerCase();
    const album = (track.album || '').toLowerCase();
    const format = (track.format || '').toLowerCase();
    const sRate = track.sampleRate || 0;
    const khz = (sRate / 1000).toString();
    const khzFixed = (sRate / 1000).toFixed(1);
    const bits = (track.bitsPerSample || 16).toString();

    const techString = `${format} ${bits}bit ${bits}-bit ${sRate}hz ${khz}k ${khz}khz ${khzFixed}k ${khzFixed}khz`;
    const pathString = (track.path || '').toLowerCase();

    const trackInfo = {
      title,
      artist,
      album,
      format,
      techString,
      pathString,
      titleWords: getWords(title),
      artistWords: getWords(artist),
      albumWords: getWords(album)
    };

    // If there are general search tokens, track must match ALL of them (AND logic)
    let totalScore = 0;
    let allTokensMatched = true;

    for (const token of tokens) {
      const { isMatch, score } = scoreTokenAgainstTrack(token, trackInfo);
      if (!isMatch) {
        allTokensMatched = false;
        break;
      }
      totalScore += score;
    }

    if (allTokensMatched) {
      // Exact title match bonus
      if (tokens.length > 0 && title === tokens.join(' ')) {
        totalScore += 100;
      }
      scoredResults.push({
        track,
        score: totalScore,
        originalIndex: i
      });
    }
  }

  // Sort by highest score first, fallback to alphabetical title
  scoredResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.track.title.localeCompare(b.track.title);
  });

  return {
    results: scoredResults.map(item => item.track),
    queryTokens: tokens
  };
}

/**
 * Highlights matching query tokens inside target text with a styled <mark> element
 * Uses safe character escaping to prevent XSS.
 * 
 * @param {string} text Target text (e.g., song title, artist, album)
 * @param {Array<string>} queryTokens Array of token strings
 * @returns {string} HTML string with highlights
 */
export function highlightMatches(text, queryTokens) {
  if (!text) return '';
  if (!Array.isArray(queryTokens) || queryTokens.length === 0) {
    return escapeHtml(text);
  }

  // Filter out short tokens and escape regex characters
  const validTokens = queryTokens
    .map(t => t.trim())
    .filter(t => t.length > 1)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (validTokens.length === 0) {
    return escapeHtml(text);
  }

  // Create combined regex
  const regex = new RegExp(`(${validTokens.join('|')})`, 'gi');
  const parts = text.split(regex);

  return parts.map(part => {
    if (!part) return '';
    const isMatched = validTokens.some(v => new RegExp(`^${v}$`, 'i').test(part));
    if (isMatched) {
      return `<mark class="search-highlight">${escapeHtml(part)}</mark>`;
    }
    return escapeHtml(part);
  }).join('');
}
