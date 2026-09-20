export type ProviderConnectionStatus =
  | "CONNECTED"
  | "DISCONNECTED"
  | "AUTH_ERROR"
  | "UNAVAILABLE"
  | "QR_REQUIRED";

export type OutboundMessageResult = {
  externalMessageId: string;
  providerTimestamp?: string;
  rawMetadata?: Record<string, unknown>;
};

export interface WhatsAppProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): Promise<ProviderConnectionStatus>;
  getQRCode(): Promise<string | null>;
  sendText(to: string, text: string): Promise<OutboundMessageResult>;
  sendImage(to: string, fileRef: string, caption?: string): Promise<OutboundMessageResult>;
  sendDocument(to: string, fileRef: string, caption?: string): Promise<OutboundMessageResult>;
  sendAudio(to: string, fileRef: string): Promise<OutboundMessageResult>;
  normalizeEvent(payload: unknown): Promise<NormalizedWhatsAppEvent>;
}

export type NormalizedWhatsAppEvent = {
  externalEventId: string;
  eventType: string;
  instanceExternalId?: string;
  phone?: string;
  externalMessageId?: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
};

export interface AIProvider {
  generateReply(input: {
    systemPrompt: string;
    commercialPrompt: string;
    conversationHistory: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
  }): Promise<{
    text: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    metadata?: Record<string, unknown>;
  }>;
}

export interface StorageProvider {
  put(input: {
    key: string;
    contentType: string;
    body: Uint8Array;
  }): Promise<{ key: string }>;

  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
