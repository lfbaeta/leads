import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  analyzeSpreadsheetImport,
  detectEmpresasMapping,
  extractBrazilianCity
} from "../src/imports/analyzer.js";
import { EMPRESAS_TEMPLATE_HEADERS } from "../src/imports/profile.js";
import { parseSpreadsheetBuffer } from "../src/imports/spreadsheet.js";
import { buildImportTemplateBuffer } from "../src/imports/template.js";

describe("importacao de planilha", () => {
  it("detecta o mapeamento da planilha Empresas", () => {
    const mapping = detectEmpresasMapping([...EMPRESAS_TEMPLATE_HEADERS]);

    expect(mapping).toMatchObject({
      name: "Nome",
      company: "Nome",
      phone: "Telefone",
      address: "Endereço",
      email: "E-mail",
      website: "Website"
    });
  });

  it("extrai cidade de enderecos brasileiros comuns", () => {
    expect(
      extractBrazilianCity(
        "Av. Independência, 238 - Centro, Cananéia - SP, 11990-000, Brasil"
      )
    ).toBe("Cananéia");

    expect(
      extractBrazilianCity(
        "R. Antônio Públio do Vale, 8 - Cananéia, SP, 11990-000, Brasil"
      )
    ).toBe("Cananéia");
  });

  it("classifica valido duplicado e sem telefone", () => {
    const spreadsheet = {
      sheetName: "Empresas",
      headers: [...EMPRESAS_TEMPLATE_HEADERS],
      totalRows: 3,
      rows: [
        [
          "Empresa A",
          "Rua A, 1 - Centro, Cananéia - SP, 11990-000, Brasil",
          "+55 13 99142-4545",
          "Não informado",
          4.8,
          10,
          "https://example.com",
          "Não Verificado",
          "Não Verificado",
          "Outros",
          "Categoria não disponível",
          "29/08/2026",
          "23:11:04"
        ],
        [
          "Empresa A repetida",
          "Rua B, 2 - Cananéia, SP, 11990-000, Brasil",
          "(13) 99142-4545",
          null,
          4.1,
          5,
          null,
          null,
          null,
          "Outros",
          null,
          "29/08/2026",
          "23:11:04"
        ],
        [
          "Empresa sem telefone",
          "Rua C, 3 - Cananéia, SP, 11990-000, Brasil",
          "Telefone não disponível",
          null,
          5,
          1,
          null,
          null,
          null,
          "Outros",
          null,
          "29/08/2026",
          "23:11:04"
        ]
      ]
    } as const;

    const result = analyzeSpreadsheetImport({
      ...spreadsheet,
      rows: spreadsheet.rows.map((row) => [...row])
    });

    expect(result.counts).toEqual({
      total: 3,
      valid: 1,
      duplicate: 1,
      invalid: 1,
      existing: 0,
      optOut: 0
    });

    expect(result.rows[0]?.lead.phoneNormalized).toBe("5513991424545");
    expect(result.rows[0]?.lead.city).toBe("Cananéia");
    expect(result.rows[0]?.lead.email).toBeNull();
    expect(result.rows[0]?.lead.customFields.Rating).toBe(4.8);
  });

  it("le arquivos xlsx e preserva cabecalhos", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      [...EMPRESAS_TEMPLATE_HEADERS],
      [
        "Empresa A",
        "Rua A, 1 - Cananéia, SP, 11990-000, Brasil",
        "+55 13 99142-4545"
      ]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Empresas");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const parsed = parseSpreadsheetBuffer(buffer, "empresas.xlsx");

    expect(parsed.sheetName).toBe("Empresas");
    expect(parsed.headers).toEqual([...EMPRESAS_TEMPLATE_HEADERS]);
    expect(parsed.totalRows).toBe(1);
  });

  it("le csv usando a mesma camada de importacao", () => {
    const csv = [
      "Nome,Endereço,Telefone",
      "Empresa A,\"Rua A - Cananéia SP\",+55 13 99142-4545"
    ].join("\n");

    const parsed = parseSpreadsheetBuffer(
      Buffer.from(csv, "utf8"),
      "empresas.csv"
    );

    expect(parsed.totalRows).toBe(1);
    expect(parsed.headers.slice(0, 3)).toEqual([
      "Nome",
      "Endereço",
      "Telefone"
    ]);
  });

  it("gera modelo xlsx compativel com o proprio importador", () => {
    const buffer = buildImportTemplateBuffer();
    const parsed = parseSpreadsheetBuffer(buffer, "modelo-importacao-empresas.xlsx");

    expect(parsed.headers).toEqual([...EMPRESAS_TEMPLATE_HEADERS]);
    expect(parsed.totalRows).toBe(0);
  });
});
