import { normalizeBrazilPhone } from "../domain/phone.js";
import {
  EMPRESAS_DEFAULT_MAPPING,
  IMPORT_PLACEHOLDERS,
  type ColumnMapping
} from "./profile.js";
import type { ParsedSpreadsheet, SpreadsheetCell } from "./spreadsheet.js";

export type ImportRowStatus = "VALID" | "DUPLICATE" | "INVALID";

export type ImportPreviewRow = {
  rowNumber: number;
  status: ImportRowStatus;
  errors: string[];
  rawData: Record<string, SpreadsheetCell>;
  lead: {
    name: string | null;
    company: string | null;
    phoneOriginal: string | null;
    phoneNormalized: string | null;
    address: string | null;
    email: string | null;
    website: string | null;
    city: string | null;
    source: string;
    notes: string | null;
    customFields: Record<string, SpreadsheetCell>;
  };
};

export type ImportAnalysis = {
  sheetName: string;
  headers: string[];
  mapping: ColumnMapping;
  counts: {
    total: number;
    valid: number;
    duplicate: number;
    invalid: number;
  };
  rows: ImportPreviewRow[];
};

function canonicalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isPlaceholder(value: string): boolean {
  const canonical = canonicalize(value).replace(/_/g, " ");
  return IMPORT_PLACEHOLDERS.has(value.trim().toLowerCase())
    || IMPORT_PLACEHOLDERS.has(canonical);
}

export function cleanImportedText(value: SpreadsheetCell): string | null {
  if (value === null) return null;
  const text = String(value).trim();
  if (!text || isPlaceholder(text)) return null;
  return text;
}

export function extractBrazilianCity(address: string | null): string | null {
  if (!address) return null;
  const normalized = address.replace(/\s+/g, " ").trim();

  const beforeStateDash = normalized.match(/,\s*([^,]+?)\s*-\s*[A-Z]{2}\s*,/i);
  if (beforeStateDash?.[1]) {
    return beforeStateDash[1].trim();
  }

  const beforeStateComma = normalized.match(/-\s*([^,]+?),\s*[A-Z]{2}\s*,/i);
  if (beforeStateComma?.[1]) {
    return beforeStateComma[1].trim();
  }

  return null;
}

function resolveHeader(headers: string[], desired: string | undefined): string | null {
  if (!desired) return null;
  const wanted = canonicalize(desired);
  return headers.find((header) => canonicalize(header) === wanted) ?? null;
}

export function detectEmpresasMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  for (const [target, desiredHeader] of Object.entries(EMPRESAS_DEFAULT_MAPPING)) {
    const resolved = resolveHeader(headers, desiredHeader);
    if (resolved) {
      mapping[target as keyof ColumnMapping] = resolved;
    }
  }

  const cityHeader = headers.find((header) =>
    ["cidade", "municipio", "município"].includes(canonicalize(header).replace(/_/g, " "))
  );
  if (cityHeader) mapping.city = cityHeader;

  const notesHeader = headers.find((header) =>
    ["observacao", "observações", "observacoes", "nota", "notas"]
      .map(canonicalize)
      .includes(canonicalize(header))
  );
  if (notesHeader) mapping.notes = notesHeader;

  return mapping;
}

function cellByHeader(
  rawData: Record<string, SpreadsheetCell>,
  header: string | undefined
): SpreadsheetCell {
  if (!header) return null;
  return rawData[header] ?? null;
}

function coreMappedHeaders(mapping: ColumnMapping): Set<string> {
  return new Set(
    Object.values(mapping).filter((value): value is string => typeof value === "string")
  );
}

export function analyzeSpreadsheetImport(
  spreadsheet: ParsedSpreadsheet,
  options?: {
    mapping?: ColumnMapping;
    source?: string;
  }
): ImportAnalysis {
  const mapping = options?.mapping ?? detectEmpresasMapping(spreadsheet.headers);
  const source = options?.source?.trim() || "planilha";
  const seenPhones = new Set<string>();
  const mappedHeaders = coreMappedHeaders(mapping);

  const rows: ImportPreviewRow[] = spreadsheet.rows.map((cells, index) => {
    const rawData = Object.fromEntries(
      spreadsheet.headers.map((header, columnIndex) => [
        header,
        cells[columnIndex] ?? null
      ])
    ) as Record<string, SpreadsheetCell>;

    const name = cleanImportedText(cellByHeader(rawData, mapping.name));
    const company = cleanImportedText(cellByHeader(rawData, mapping.company)) ?? name;
    const phoneOriginal = cleanImportedText(cellByHeader(rawData, mapping.phone));
    const address = cleanImportedText(cellByHeader(rawData, mapping.address));
    const email = cleanImportedText(cellByHeader(rawData, mapping.email));
    const website = cleanImportedText(cellByHeader(rawData, mapping.website));
    const mappedCity = cleanImportedText(cellByHeader(rawData, mapping.city));
    const notes = cleanImportedText(cellByHeader(rawData, mapping.notes));
    const city = mappedCity ?? extractBrazilianCity(address);

    const phoneResult = phoneOriginal
      ? normalizeBrazilPhone(phoneOriginal)
      : {
          original: "",
          normalized: null,
          valid: false,
          reason: "Telefone ausente"
        };

    const errors: string[] = [];
    if (!name && !company) errors.push("Nome/empresa ausente");
    if (!phoneResult.valid || !phoneResult.normalized) {
      errors.push(phoneResult.reason ?? "Telefone inválido");
    }

    let status: ImportRowStatus = errors.length > 0 ? "INVALID" : "VALID";

    if (status === "VALID" && phoneResult.normalized) {
      if (seenPhones.has(phoneResult.normalized)) {
        status = "DUPLICATE";
        errors.push("Telefone duplicado dentro da própria planilha");
      } else {
        seenPhones.add(phoneResult.normalized);
      }
    }

    const customFields = Object.fromEntries(
      spreadsheet.headers
        .filter((header) => !mappedHeaders.has(header))
        .map((header) => [header, rawData[header] ?? null])
    ) as Record<string, SpreadsheetCell>;

    return {
      rowNumber: index + 2,
      status,
      errors,
      rawData,
      lead: {
        name: name ?? company,
        company,
        phoneOriginal,
        phoneNormalized: phoneResult.normalized,
        address,
        email,
        website,
        city,
        source,
        notes,
        customFields
      }
    };
  });

  return {
    sheetName: spreadsheet.sheetName,
    headers: spreadsheet.headers,
    mapping,
    counts: {
      total: rows.length,
      valid: rows.filter((row) => row.status === "VALID").length,
      duplicate: rows.filter((row) => row.status === "DUPLICATE").length,
      invalid: rows.filter((row) => row.status === "INVALID").length
    },
    rows
  };
}
