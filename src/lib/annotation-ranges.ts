import type { Annotation } from '@/types/domain';

export interface AnnotationSegment {
  text: string;
  start: number;
  end: number;
  annotation?: Annotation;
}

const DEFAULT_MAX_SEGMENT_LENGTH = 4_000;

interface NormalizedAnnotationRange {
  annotation: Annotation;
  start: number;
  end: number;
}

function normalizeRange(content: string, annotation: Annotation): NormalizedAnnotationRange | null {
  const { start, end, quote } = annotation.anchor ?? {};

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    typeof quote !== 'string' ||
    quote.trim().length === 0
  ) {
    return null;
  }

  const contentLength = content.length;
  const lower = Math.min(Math.trunc(start), Math.trunc(end));
  const upper = Math.max(Math.trunc(start), Math.trunc(end));
  const normalizedStart = Math.max(0, Math.min(contentLength, lower));
  const normalizedEnd = Math.max(0, Math.min(contentLength, upper));

  if (normalizedEnd <= normalizedStart) return null;

  return { annotation, start: normalizedStart, end: normalizedEnd };
}

export function buildAnnotationSegments(
  content: string,
  annotations: Annotation[],
  options: { maxSegmentLength?: number } = {},
): AnnotationSegment[] {
  const maxSegmentLength = normalizeMaxSegmentLength(options.maxSegmentLength);
  const sorted = annotations
    .map(a => normalizeRange(content, a))
    .filter((range): range is NormalizedAnnotationRange => range !== null)
    .sort((a, b) => {
      const byStart = a.start - b.start;
      if (byStart !== 0) return byStart;
      return b.end - a.end;
    });

  const segments: AnnotationSegment[] = [];
  let cursor = 0;

  for (const range of sorted) {
    if (range.start < cursor) continue;
    if (range.start > cursor) {
      segments.push({
        text: content.slice(cursor, range.start),
        start: cursor,
        end: range.start,
      });
    }
    segments.push({
      text: content.slice(range.start, range.end),
      start: range.start,
      end: range.end,
      annotation: range.annotation,
    });
    cursor = range.end;
  }

  if (cursor < content.length) {
    segments.push({ text: content.slice(cursor), start: cursor, end: content.length });
  }

  const baseSegments = segments.length
    ? segments
    : [{ text: content, start: 0, end: content.length }];

  return splitLongSegments(baseSegments, maxSegmentLength);
}

function normalizeMaxSegmentLength(maxSegmentLength: number | undefined): number {
  if (maxSegmentLength === undefined || !Number.isFinite(maxSegmentLength)) {
    return DEFAULT_MAX_SEGMENT_LENGTH;
  }

  return Math.max(1, Math.trunc(maxSegmentLength));
}

function splitLongSegments(
  segments: AnnotationSegment[],
  maxSegmentLength: number,
): AnnotationSegment[] {
  return segments.flatMap(segment => {
    if (segment.text.length <= maxSegmentLength) return [segment];

    const parts: AnnotationSegment[] = [];
    let cursor = 0;
    while (cursor < segment.text.length) {
      const remaining = segment.text.slice(cursor);
      const splitAt =
        remaining.length <= maxSegmentLength
          ? remaining.length
          : chooseSplitIndex(remaining, maxSegmentLength);
      const end = cursor + splitAt;
      parts.push({
        text: segment.text.slice(cursor, end),
        start: segment.start + cursor,
        end: segment.start + end,
        annotation: segment.annotation,
      });
      cursor = end;
    }
    return parts;
  });
}

function chooseSplitIndex(text: string, maxSegmentLength: number): number {
  const minUsefulBoundary = Math.floor(maxSegmentLength * 0.6);
  const slice = text.slice(0, maxSegmentLength + 1);
  const boundaries = ['\n\n', '\n', ' '];

  for (const boundary of boundaries) {
    const index = slice.lastIndexOf(boundary);
    const end = index + boundary.length;
    if (index >= minUsefulBoundary && end <= maxSegmentLength) return end;
  }

  return maxSegmentLength;
}
