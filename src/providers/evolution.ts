import type { NormalizedWhatsAppEvent,OutboundMessageResult,ProviderConnectionStatus,WhatsAppProvider } from "./contracts.js";
import type { WhatsAppProviderConfig } from "./factory.js";

function safeUrl(raw:string):URL{const url=new URL(raw);if(!["https:","http:"].includes(url.protocol)||url.username||url.password) throw new Error("URL de provider inválida.");return url;}

type Profile={sendTextPath:(i:string)=>string;statusPath:(i:string)=>string;qrPath:(i:string)=>string;authHeader:string};

const profiles:Record<"EVOLUTION_API"|"EVOLUTION_GO",Profile>={
  EVOLUTION_API:{sendTextPath:i=>`/message/sendText/${encodeURIComponent(i)}`,statusPath:i=>`/instance/connectionState/${encodeURIComponent(i)}`,qrPath:i=>`/instance/connect/${encodeURIComponent(i)}`,authHeader:"apikey"},
  EVOLUTION_GO:{sendTextPath:i=>`/message/sendText/${encodeURIComponent(i)}`,statusPath:i=>`/instance/connectionState/${encodeURIComponent(i)}`,qrPath:i=>`/instance/connect/${encodeURIComponent(i)}`,authHeader:"apikey"}
};

export class EvolutionProvider implements WhatsAppProvider{
  private readonly base:URL; private readonly p:Profile;
  constructor(private readonly name:"EVOLUTION_API"|"EVOLUTION_GO",private readonly config:WhatsAppProviderConfig){
    this.base=safeUrl(config.baseUrl); this.p=profiles[name];
  }
  private async request(path:string,init?:RequestInit):Promise<unknown>{
    const url=new URL(path,this.base);
    const res=await fetch(url,{...init,headers:{[this.p.authHeader]:this.config.apiKey,"content-type":"application/json",...(init?.headers??{})},signal:AbortSignal.timeout(15000)});
    const text=await res.text(); let body:unknown={}; try{body=text?JSON.parse(text):{};}catch{body={raw:text.slice(0,500)};}
    if(!res.ok) throw new Error(`Provider ${this.name} respondeu HTTP ${res.status}`);
    return body;
  }
  async connect(){await this.getQRCode();}
  async disconnect(){throw new Error("Disconnect deve ser configurado conforme a versão do provider.");}
  async getStatus():Promise<ProviderConnectionStatus>{
    const body=await this.request(this.p.statusPath(this.config.instanceExternalId)) as Record<string,unknown>;
    const raw=JSON.stringify(body).toLowerCase();
    if(raw.includes("open")||raw.includes("connected")) return "CONNECTED";
    if(raw.includes("qr")) return "QR_REQUIRED"; return "DISCONNECTED";
  }
  async getQRCode():Promise<string|null>{
    const body=await this.request(this.p.qrPath(this.config.instanceExternalId)) as Record<string,unknown>;
    const candidate=body.base64??body.qrcode??body.code; return typeof candidate==="string"?candidate:null;
  }
  async sendText(to:string,text:string):Promise<OutboundMessageResult>{
    const body=await this.request(this.p.sendTextPath(this.config.instanceExternalId),{method:"POST",body:JSON.stringify({number:to,text})}) as Record<string,unknown>;
    const key=body.key as Record<string,unknown>|undefined;
    const id=(key?.id??body.id??body.messageId);
    if(typeof id!=="string"||!id) throw new Error("Provider não confirmou externalMessageId.");
    return {externalMessageId:id,rawMetadata:{provider:this.name}};
  }
  async sendImage(_to:string,_fileRef:string,_caption?:string):Promise<OutboundMessageResult>{throw new Error("Imagem ainda não habilitada.");}
  async sendDocument(_to:string,_fileRef:string,_caption?:string):Promise<OutboundMessageResult>{throw new Error("Documento ainda não habilitado.");}
  async sendAudio(_to:string,_fileRef:string):Promise<OutboundMessageResult>{throw new Error("Áudio ainda não habilitado.");}
  async normalizeEvent(payload:unknown):Promise<NormalizedWhatsAppEvent>{
    if(!payload||typeof payload!=="object") throw new Error("Webhook inválido.");
    const p=payload as Record<string,unknown>; const data=(p.data&&typeof p.data==="object"?p.data:{}) as Record<string,unknown>;
    const key=(data.key&&typeof data.key==="object"?data.key:{}) as Record<string,unknown>;
    const message=(data.message&&typeof data.message==="object"?data.message:{}) as Record<string,unknown>;
    const remote=typeof key.remoteJid==="string"?key.remoteJid:"";
    const text=[message.conversation,(message.extendedTextMessage as Record<string,unknown>|undefined)?.text].find(v=>typeof v==="string") as string|undefined;
    const externalMessageId=typeof key.id==="string"?key.id:undefined;
    const eventRaw=typeof p.event==="string"?p.event:"UNKNOWN";
    const fromMe=key.fromMe===true;
    const externalEventId=[eventRaw,externalMessageId??"",String(data.messageTimestamp??"")].join(":");
    const isInbound=!fromMe&&eventRaw.toLowerCase().includes("messages.upsert");
    const event:NormalizedWhatsAppEvent={externalEventId,eventType:isInbound?"MESSAGE_RECEIVED":eventRaw,payload:{text:text??"",raw:p}};
    const phone=remote.split("@")[0]; if(phone) event.phone=phone; if(externalMessageId) event.externalMessageId=externalMessageId;
    return event;
  }
}
