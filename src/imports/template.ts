import * as XLSX from "xlsx";
import { EMPRESAS_TEMPLATE_HEADERS } from "./profile.js";

export const IMPORT_TEMPLATE_FILENAME = "modelo-importacao-empresas.xlsx";

export function buildImportTemplateBuffer(): Buffer {
  const worksheet = XLSX.utils.aoa_to_sheet([
    [...EMPRESAS_TEMPLATE_HEADERS]
  ]);

  worksheet["!cols"] = [
    { wch: 28 },
    { wch: 45 },
    { wch: 20 },
    { wch: 30 },
    { wch: 10 },
    { wch: 12 },
    { wch: 35 },
    { wch: 18 },
    { wch: 18 },
    { wch: 22 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Empresas");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true
  });
}
