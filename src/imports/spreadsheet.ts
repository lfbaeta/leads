import path from "node:path";
import * as XLSX from "xlsx";
import {
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS
} from "./profile.js";

export type SpreadsheetCell = string | number | boolean | null;

export type ParsedSpreadsheet = {
  sheetName: string;
  headers: string[];
  rows: SpreadsheetCell[][];
  totalRows: number;
};

const SUPPORTED_EXTENSIONS = new Set([".xlsx", ".xls", ".csv"]);

function toSerializableCell(value: unknown): SpreadsheetCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export function parseSpreadsheetBuffer(
  buffer: Buffer,
  fileName: string
): ParsedSpreadsheet {
  if (buffer.length === 0) {
    throw new Error("Arquivo vazio.");
  }

  if (buffer.length > IMPORT_MAX_FILE_BYTES) {
    throw new Error("Arquivo excede o limite permitido de 15 MB.");
  }

  const extension = path.extname(fileName).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error("Formato não suportado. Use .xlsx, .xls ou .csv.");
  }

  const workbook = extension === ".csv"
    ? XLSX.read(
        buffer.toString("utf8").replace(/^\uFEFF/, ""),
        {
          type: "string",
          cellDates: true,
          dense: true,
          sheetRows: IMPORT_MAX_ROWS + 2
        }
      )
    : XLSX.read(buffer, {
        type: "buffer",
        cellDates: true,
        dense: true,
        sheetRows: IMPORT_MAX_ROWS + 2
      });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("A planilha não possui abas legíveis.");
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error("Não foi possível ler a primeira aba da planilha.");
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false
  });

  const headerRow = matrix[0];
  if (!headerRow || headerRow.length === 0) {
    throw new Error("A planilha não possui cabeçalho.");
  }

  const headers = headerRow.map((value, index) => {
    const text = value === null || value === undefined
      ? ""
      : String(value).trim();

    return text || `Coluna_${index + 1}`;
  });

  const dataRows = matrix
    .slice(1)
    .map((row) => headers.map((_, index) => toSerializableCell(row[index])))
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""));

  if (dataRows.length > IMPORT_MAX_ROWS) {
    throw new Error(`A planilha excede o limite de ${IMPORT_MAX_ROWS} registros.`);
  }

  return {
    sheetName,
    headers,
    rows: dataRows,
    totalRows: dataRows.length
  };
}
