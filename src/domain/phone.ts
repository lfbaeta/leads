export type NormalizedPhone = {
  original: string;
  normalized: string | null;
  valid: boolean;
  reason?: string;
};

export function normalizeBrazilPhone(input: string): NormalizedPhone {
  const original = input;
  let digits = input.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  if (!digits.startsWith("55")) {
    return {
      original,
      normalized: null,
      valid: false,
      reason: "Numero sem codigo do Brasil (55) ou DDD/numeracao incompletos"
    };
  }

  if (digits.length !== 12 && digits.length !== 13) {
    return {
      original,
      normalized: null,
      valid: false,
      reason: "Quantidade de digitos invalida para telefone brasileiro"
    };
  }

  const ddd = digits.slice(2, 4);
  const local = digits.slice(4);

  if (ddd.startsWith("0") || Number(ddd) < 11 || Number(ddd) > 99) {
    return {
      original,
      normalized: null,
      valid: false,
      reason: "DDD invalido"
    };
  }

  if (local.startsWith("0")) {
    return {
      original,
      normalized: null,
      valid: false,
      reason: "Numero local invalido"
    };
  }

  return {
    original,
    normalized: digits,
    valid: true
  };
}
