export interface MentionQueryMatch {
  query: string;
  atPos: number;
  endPos: number;
}

const MENTION_STOP_RE = /[\n\r()[\]{}<>]/;

export function findMentionAtCursor(text: string, offset: number): MentionQueryMatch | null {
  if (offset < 0 || offset > text.length) return null;

  let atPos = -1;
  for (let i = offset - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === "@") {
      if (i === 0 || /\s/.test(text[i - 1])) atPos = i;
      break;
    }
    if (MENTION_STOP_RE.test(ch)) break;
  }

  if (atPos === -1) return null;

  const query = text.slice(atPos + 1, offset);
  if (query.startsWith(" ")) return null;

  return {
    query,
    atPos,
    endPos: offset,
  };
}
