import { readZipEntries, textEntry } from "./tm30-zip.service.js";

const SHARED_STRING_PATTERN = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
const TEXT_PATTERN = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
const CELL_PATTERN = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
const ATTRIBUTE_PATTERN = /\b([A-Za-z_:][\w:.-]*)="([^"]*)"/g;

const NATIONALITY_ALIASES: Record<string, string> = {
  AMERICAN: "USA",
  BELGIAN: "BEL",
  BRITISH: "GBR",
  CAMBODIAN: "KHM",
  CANADIAN: "CAN",
  CHINESE: "CHN",
  DUTCH: "NLD",
  ENGLISH: "GBR",
  FINNISH: "FIN",
  FRENCH: "FRA",
  GERMAN: "DEU",
  INDIAN: "IND",
  INDONESIAN: "IDN",
  ITALIAN: "ITA",
  JAPANESE: "JPN",
  KOREAN: "KOR",
  MALAYSIAN: "MYS",
  MYANMAR: "MMR",
  RUSSIAN: "RUS",
  SINGAPOREAN: "SGP",
  SPANISH: "ESP",
  SWEDISH: "SWE",
  SWISS: "CHE",
  THAI: "THA",
  UK: "GBR",
  USA: "USA",
  VIETNAMESE: "VNM",
};

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function normalizeNationality(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " AND ")
    .replace(/['’]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attributesFrom(value: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of value.matchAll(ATTRIBUTE_PATTERN)) {
    attributes[match[1]!] = decodeXml(match[2]!);
  }
  return attributes;
}

function readSharedStrings(xml: string): string[] {
  return [...xml.matchAll(SHARED_STRING_PATTERN)].map((match) => {
    const inner = match[1] ?? "";
    return [...inner.matchAll(TEXT_PATTERN)].map((textMatch) => decodeXml(textMatch[1] ?? "")).join("");
  });
}

function cellColumn(reference: string): string {
  return reference.replace(/\d+/g, "");
}

function cellRow(reference: string): number {
  return Number(reference.replace(/[A-Z]+/gi, ""));
}

function readSharedStringCellValues(sheetXml: string, sharedStrings: string[]): Map<string, string> {
  const cells = new Map<string, string>();
  for (const match of sheetXml.matchAll(CELL_PATTERN)) {
    const attributes = attributesFrom(match[1] ?? "");
    const reference = attributes.r;
    if (!reference || attributes.t !== "s") continue;
    const valueMatch = /<v>(\d+)<\/v>/.exec(match[2] ?? "");
    if (!valueMatch) continue;
    cells.set(reference, sharedStrings[Number(valueMatch[1])] ?? "");
  }
  return cells;
}

export async function buildTm30NationalityMap(template: ArrayBuffer): Promise<Map<string, string>> {
  const entries = await readZipEntries(template);
  const sharedStrings = readSharedStrings(textEntry(entries, "xl/sharedStrings.xml"));
  const cells = readSharedStringCellValues(textEntry(entries, "xl/worksheets/sheet3.xml"), sharedStrings);
  const map = new Map<string, string>();

  for (const [reference, code] of cells) {
    if (cellColumn(reference) !== "B" || cellRow(reference) < 2 || !/^[A-Z0-9]{3}$/.test(code)) continue;
    const row = cellRow(reference);
    const thaiName = cells.get(`C${row}`);
    const englishName = cells.get(`D${row}`);
    map.set(normalizeNationality(code), code);
    if (thaiName) map.set(normalizeNationality(thaiName), code);
    if (englishName) {
      map.set(normalizeNationality(englishName), code);
      const shortened = normalizeNationality(englishName)
        .replace(/^THE /, "")
        .replace(/^REPUBLIC OF /, "")
        .replace(/^KINGDOM OF /, "")
        .replace(/^THE REPUBLIC OF /, "")
        .replace(/^THE KINGDOM OF /, "");
      if (shortened) map.set(shortened, code);
    }
  }

  for (const [alias, code] of Object.entries(NATIONALITY_ALIASES)) {
    map.set(normalizeNationality(alias), code);
  }

  return map;
}

export function tm30NationalityCodeFrom(value: string | null | undefined, nationalityMap: Map<string, string>): string | null {
  const text = value?.trim();
  if (!text) return null;
  return nationalityMap.get(normalizeNationality(text)) ?? null;
}
