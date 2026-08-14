export type MessengerTextFormat =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough";

export interface MessengerTextSelection {
  start: number;
  end: number;
}

export interface MessengerFormattedTextSegment {
  text: string;
  formats: MessengerTextFormat[];
}

const FORMAT_TOKENS: Record<MessengerTextFormat, string> = {
  // Default-ignorable Unicode separators keep the composer and push preview
  // clean while preserving formatting through the existing text-only API.
  // Repeating each character makes accidental matches in user text unlikely.
  bold: "\u2063\u2063",
  italic: "\u2062\u2062",
  underline: "\u2061\u2061",
  strikethrough: "\u2060\u2060",
};

const TOKEN_FORMATS = (
  Object.entries(FORMAT_TOKENS) as [MessengerTextFormat, string][]
).sort((left, right) => right[1].length - left[1].length);

function hasMeaningfulClosingToken(
  value: string,
  token: string,
  start: number,
): boolean {
  const closingIndex = value.indexOf(token, start + token.length);
  if (closingIndex < 0) return false;
  return Boolean(value.slice(start + token.length, closingIndex).trim());
}

/**
 * Parses the deliberately small markup emitted by the composer toolbar.
 * Unmatched markers stay visible, so ordinary text is never silently lost.
 */
export function parseMessengerFormattedText(
  value: string,
): MessengerFormattedTextSegment[] {
  const result: MessengerFormattedTextSegment[] = [];
  const active: MessengerTextFormat[] = [];
  let buffer = "";
  let cursor = 0;

  const flush = () => {
    if (!buffer) return;
    const previous = result[result.length - 1];
    if (
      previous &&
      previous.formats.length === active.length &&
      previous.formats.every((format, index) => format === active[index])
    ) {
      previous.text += buffer;
    } else {
      result.push({ text: buffer, formats: [...active] });
    }
    buffer = "";
  };

  while (cursor < value.length) {
    if (value[cursor] === "\\") {
      const escaped = TOKEN_FORMATS.find(([, token]) =>
        value.startsWith(token, cursor + 1),
      );
      if (escaped) {
        buffer += escaped[1];
        cursor += escaped[1].length + 1;
        continue;
      }
    }

    const matched = TOKEN_FORMATS.find(([, token]) =>
      value.startsWith(token, cursor),
    );
    if (!matched) {
      buffer += value[cursor];
      cursor += 1;
      continue;
    }

    const [format, token] = matched;
    const activeIndex = active.lastIndexOf(format);
    if (activeIndex < 0 && !hasMeaningfulClosingToken(value, token, cursor)) {
      buffer += token;
      cursor += token.length;
      continue;
    }

    flush();
    if (activeIndex >= 0) active.splice(activeIndex, 1);
    else active.push(format);
    cursor += token.length;
  }

  flush();
  return result.length ? result : [{ text: value, formats: [] }];
}

export function stripMessengerTextFormatting(value: string): string {
  return parseMessengerFormattedText(value)
    .map((segment) => segment.text)
    .join("");
}

export function applyMessengerTextFormat(
  value: string,
  selection: MessengerTextSelection,
  format: MessengerTextFormat,
): { text: string; selection: MessengerTextSelection } {
  const start = Math.max(0, Math.min(selection.start, selection.end, value.length));
  const end = Math.max(start, Math.min(Math.max(selection.start, selection.end), value.length));
  if (start === end) return { text: value, selection: { start, end } };

  const token = FORMAT_TOKENS[format];
  const selectedValue = value.slice(start, end);
  const includesWrapper =
    selectedValue.startsWith(token) &&
    selectedValue.endsWith(token) &&
    selectedValue.length > token.length * 2;
  if (includesWrapper) {
    return {
      text:
        value.slice(0, start) +
        selectedValue.slice(token.length, -token.length) +
        value.slice(end),
      selection: {
        start,
        end: end - token.length * 2,
      },
    };
  }
  const wrapped =
    start >= token.length &&
    value.slice(start - token.length, start) === token &&
    value.slice(end, end + token.length) === token;

  if (wrapped) {
    return {
      text:
        value.slice(0, start - token.length) +
        value.slice(start, end) +
        value.slice(end + token.length),
      selection: {
        start: start - token.length,
        end: end - token.length,
      },
    };
  }

  return {
    text:
      value.slice(0, start) +
      token +
      value.slice(start, end) +
      token +
      value.slice(end),
    selection: {
      start: start + token.length,
      end: end + token.length,
    },
  };
}
