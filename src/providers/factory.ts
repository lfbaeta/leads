import { EvolutionProvider } from "./evolution.js";
import type { WhatsAppProvider } from "./contracts.js";

export type WhatsAppProviderName = "EVOLUTION_API" | "EVOLUTION_GO";

export type WhatsAppProviderConfig = {
  baseUrl: string;
  apiKey: string;
  instanceExternalId: string;
};

export interface WhatsAppProviderFactory { create(name: WhatsAppProviderName, config: WhatsAppProviderConfig): WhatsAppProvider; }

export const whatsappProviderFactory:WhatsAppProviderFactory={
  create(name,config){return new EvolutionProvider(name,config);}
};

export function assertSafeProviderUrl(raw:string):URL{
  const url=new URL(raw);
  if(!["https:","http:"].includes(url.protocol)) throw new Error("Protocolo de provider inválido.");
  if(url.username||url.password) throw new Error("Credenciais não devem estar embutidas na URL.");
  return url;
}
