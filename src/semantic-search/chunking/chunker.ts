export interface Chunk {
  content: string;
  index: number;
}

function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function chunkText(text: string, chunkSize: number, overlap: number): Chunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  // If fits in a single chunk, return as-is
  if (normalized.length <= chunkSize) {
    return [{ content: normalized, index: 0 }];
  }

  const paragraphs = splitByParagraphs(normalized);
  const chunks: Chunk[] = [];
  let buffer = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    // Paragraph itself too big — hard-split it
    if (paragraph.length > chunkSize) {
      if (buffer.length > 0) {
        chunks.push({ content: buffer.trim(), index: chunkIndex++ });
        buffer = buffer.slice(-overlap);
      }
      let offset = 0;
      while (offset < paragraph.length) {
        const slice = paragraph.slice(offset, offset + chunkSize);
        chunks.push({ content: slice, index: chunkIndex++ });
        offset += chunkSize - overlap;
      }
      buffer = paragraph.slice(-overlap);
      continue;
    }

    const candidate = buffer.length > 0 ? `${buffer}\n\n${paragraph}` : paragraph;

    if (candidate.length > chunkSize && buffer.length > 0) {
      chunks.push({ content: buffer.trim(), index: chunkIndex++ });
      // Keep overlap from end of previous buffer
      const overlapText = buffer.slice(-overlap);
      buffer = overlapText.length > 0 ? `${overlapText}\n\n${paragraph}` : paragraph;
    } else {
      buffer = candidate;
    }
  }

  if (buffer.trim().length > 0) {
    chunks.push({ content: buffer.trim(), index: chunkIndex++ });
  }

  return chunks;
}

export function shouldEmbedMessage(role: string, kind: string, contentText: string | null): boolean {
  if (!contentText || contentText.trim().length < 30) return false;
  if (role !== "user" && role !== "assistant") return false;
  if (kind === "tool_call" || kind === "tool_result" || kind === "reasoning") return false;
  return true;
}
