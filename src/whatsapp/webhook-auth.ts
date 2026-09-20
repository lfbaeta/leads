import { createHash,timingSafeEqual } from "node:crypto";
function hashSecret(value:string){return createHash("sha256").update(value).digest();}
export function verifyWebhookSecret(provided:string|undefined,storedHash:string|null):boolean{
 if(!storedHash||!provided)return false;const a=hashSecret(provided);let b:Buffer;
 try{b=Buffer.from(storedHash,"hex");}catch{return false;}
 return a.length===b.length&&timingSafeEqual(a,b);
}
