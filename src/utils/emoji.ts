const SINGLE_EMOJI_REGEX =
  /^(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)$/u;

type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locale?: string,
    options?: { granularity: "grapheme" | "word" | "sentence" }
  ) => {
    segment: (input: string) => Iterable<unknown>;
  };
};

/**
 * Validates that the trimmed input is a single emoji grapheme/sequence
 * (supports standard emoji, skin tones, ZWJ sequences, flags, and keycaps).
 */
export function isValidSingleEmoji(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;

  const intl = Intl as IntlWithSegmenter;
  if (typeof intl !== "undefined" && typeof intl.Segmenter === "function") {
    const segmenter = new intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = Array.from(segmenter.segment(value));
    if (segments.length !== 1) return false;
  }

  return SINGLE_EMOJI_REGEX.test(value);
}
