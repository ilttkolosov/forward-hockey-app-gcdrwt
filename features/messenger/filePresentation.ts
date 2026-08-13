import type { MessengerMedia } from "./types";

export type MessengerFileIconName =
  | "file-pdf-box"
  | "file-word-box"
  | "file-excel-box"
  | "file-powerpoint-box"
  | "file-document-outline"
  | "file-code-outline"
  | "folder-zip-outline"
  | "file-music-outline"
  | "file-outline";

export interface MessengerFilePresentation {
  icon: MessengerFileIconName;
  label: string;
}

type MessengerFileDescriptor = Pick<
  MessengerMedia,
  "mime_type" | "original_name"
>;

const WORD_EXTENSIONS = new Set([
  "doc",
  "docm",
  "docx",
  "dot",
  "dotm",
  "dotx",
  "odt",
  "rtf",
]);
const EXCEL_EXTENSIONS = new Set([
  "csv",
  "ods",
  "xls",
  "xlsb",
  "xlsm",
  "xlsx",
  "xlt",
  "xltm",
  "xltx",
]);
const POWERPOINT_EXTENSIONS = new Set([
  "odp",
  "pot",
  "potm",
  "potx",
  "pps",
  "ppsm",
  "ppsx",
  "ppt",
  "pptm",
  "pptx",
]);
const TEXT_EXTENSIONS = new Set(["log", "md", "rtf", "text", "txt"]);
const CODE_EXTENSIONS = new Set([
  "css",
  "html",
  "ini",
  "js",
  "json",
  "jsx",
  "sql",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
]);
const ARCHIVE_EXTENSIONS = new Set([
  "7z",
  "bz2",
  "gz",
  "rar",
  "tar",
  "tgz",
  "zip",
]);
const AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "wav",
  "wma",
]);

function fileExtension(originalName: string): string {
  const cleanName = originalName.trim().toLowerCase();
  const dotIndex = cleanName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === cleanName.length - 1) return "";
  return cleanName.slice(dotIndex + 1).replace(/[^a-z0-9]/g, "");
}

function displayLabel(extension: string, fallback: string): string {
  return extension ? extension.slice(0, 8).toUpperCase() : fallback;
}

export function getMessengerFilePresentation(
  file: MessengerFileDescriptor,
): MessengerFilePresentation {
  const extension = fileExtension(file.original_name);
  const mimeType = file.mime_type.trim().toLowerCase().split(";")[0] ?? "";

  if (extension === "pdf" || mimeType === "application/pdf") {
    return { icon: "file-pdf-box", label: "PDF" };
  }
  if (
    WORD_EXTENSIONS.has(extension) ||
    mimeType.includes("msword") ||
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("opendocument.text")
  ) {
    return {
      icon: "file-word-box",
      label: displayLabel(extension, "WORD"),
    };
  }
  if (
    EXCEL_EXTENSIONS.has(extension) ||
    mimeType.includes("ms-excel") ||
    mimeType.includes("spreadsheetml") ||
    mimeType.includes("opendocument.spreadsheet")
  ) {
    return {
      icon: "file-excel-box",
      label: displayLabel(extension, "EXCEL"),
    };
  }
  if (
    POWERPOINT_EXTENSIONS.has(extension) ||
    mimeType.includes("ms-powerpoint") ||
    mimeType.includes("presentationml") ||
    mimeType.includes("opendocument.presentation")
  ) {
    return {
      icon: "file-powerpoint-box",
      label: displayLabel(extension, "POWERPOINT"),
    };
  }
  if (TEXT_EXTENSIONS.has(extension) || mimeType.startsWith("text/")) {
    return {
      icon: "file-document-outline",
      label: displayLabel(extension, "TXT"),
    };
  }
  if (
    CODE_EXTENSIONS.has(extension) ||
    mimeType === "application/json" ||
    mimeType.includes("xml")
  ) {
    return {
      icon: "file-code-outline",
      label: displayLabel(extension, "CODE"),
    };
  }
  if (
    ARCHIVE_EXTENSIONS.has(extension) ||
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    mimeType.includes("archive")
  ) {
    return {
      icon: "folder-zip-outline",
      label: displayLabel(extension, "АРХИВ"),
    };
  }
  if (AUDIO_EXTENSIONS.has(extension) || mimeType.startsWith("audio/")) {
    return {
      icon: "file-music-outline",
      label: displayLabel(extension, "АУДИО"),
    };
  }
  return {
    icon: "file-outline",
    label: displayLabel(extension, "ФАЙЛ"),
  };
}
