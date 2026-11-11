export interface MarkdownStatistics {
  words: number;
  characters: number;
  lines: number;
  readingMinutes: number;
}

export interface TextSelectionRange {
  start: number;
  end: number;
}

export function countMarkdown(text: string, selection?: TextSelectionRange): MarkdownStatistics {
  const content = selection ? text.slice(Math.min(selection.start, selection.end), Math.max(selection.start, selection.end)) : text;
  const countableWords = content.replace(/^ {0,3}(?:`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/gm, "");
  const wordMatches = countableWords.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? [];
  const characters = content.match(/[^\s]/gu)?.length ?? 0;
  const lines = content.length === 0 ? 0 : content.split(/\r\n|\r|\n/).length;
  const words = wordMatches.length;
  return { words, characters, lines, readingMinutes: words === 0 ? 0 : Math.ceil(words / 200) };
}
