export const EMPRESAS_TEMPLATE_HEADERS = [
  "Nome",
  "Endereço",
  "Telefone",
  "E-mail",
  "Rating",
  "Avaliações",
  "Website",
  "WhatsApp",
  "Status",
  "Categoria",
  "Tipos",
  "Data_Exportacao",
  "Hora_Exportacao"
] as const;

export type EmpresasTemplateHeader = typeof EMPRESAS_TEMPLATE_HEADERS[number];

export type ImportTargetField =
  | "name"
  | "company"
  | "phone"
  | "address"
  | "email"
  | "website"
  | "city"
  | "source"
  | "notes";

export type ColumnMapping = Partial<Record<ImportTargetField, string>>;

export const EMPRESAS_DEFAULT_MAPPING: ColumnMapping = {
  name: "Nome",
  company: "Nome",
  phone: "Telefone",
  address: "Endereço",
  email: "E-mail",
  website: "Website"
};

export const IMPORT_PLACEHOLDERS = new Set([
  "",
  "não informado",
  "nao informado",
  "não verificado",
  "nao verificado",
  "categoria não disponível",
  "categoria nao disponivel",
  "telefone não disponível",
  "telefone nao disponivel",
  "n/a",
  "null",
  "undefined"
]);

export const IMPORT_MAX_ROWS = 50_000;
export const IMPORT_MAX_FILE_BYTES = 15 * 1024 * 1024;
