import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/http.js";
import { getConversation,listConversations,listMessages,markConversationRead,queueHumanText } from "../../conversations/service.js";

const idSchema=z.object({id:z.string().uuid()});
const listSchema=z.object({
  search:z.string().trim().max(200).optional(),
  mode:z.enum(["AI","HUMAN"]).optional(),
  state:z.string().trim().max(60).optional(),
  page:z.coerce.number().int().min(1).default(1),
  pageSize:z.coerce.number().int().min(1).max(100).default(25)
});
const messagesSchema=z.object({
  before:z.string().datetime().optional(),
  limit:z.coerce.number().int().min(1).max(100).default(50)
});
const sendSchema=z.object({text:z.string().trim().min(1).max(5000)});

export async function registerConversationRoutes(app:FastifyInstance):Promise<void>{
  app.get("/conversations",async(request,reply)=>{
    const auth=await requireAuth(request); const parsed=listSchema.safeParse(request.query);
    if(!parsed.success) return reply.code(400).send({error:"Filtros inválidos."});
    return listConversations({organizationId:auth.organizationId,...parsed.data});
  });
  app.get("/conversations/:id",async(request,reply)=>{
    const auth=await requireAuth(request); const p=idSchema.safeParse(request.params);
    if(!p.success) return reply.code(400).send({error:"ID inválido."});
    const row=await getConversation(auth.organizationId,p.data.id);
    if(!row) return reply.code(404).send({error:"Conversa não encontrada."}); return row;
  });
  app.get("/conversations/:id/messages",async(request,reply)=>{
    const auth=await requireAuth(request); const p=idSchema.safeParse(request.params); const q=messagesSchema.safeParse(request.query);
    if(!p.success||!q.success) return reply.code(400).send({error:"Parâmetros inválidos."});
    return listMessages({organizationId:auth.organizationId,conversationId:p.data.id,...q.data});
  });
  app.post("/conversations/:id/read",async(request,reply)=>{
    const auth=await requireAuth(request); const p=idSchema.safeParse(request.params);
    if(!p.success) return reply.code(400).send({error:"ID inválido."});
    const row=await markConversationRead(auth.organizationId,p.data.id);
    if(!row) return reply.code(404).send({error:"Conversa não encontrada."}); return row;
  });
  app.post("/conversations/:id/messages",async(request,reply)=>{
    const auth=await requireAuth(request); const p=idSchema.safeParse(request.params); const b=sendSchema.safeParse(request.body);
    if(!p.success||!b.success) return reply.code(400).send({error:"Mensagem inválida."});
    const result=await queueHumanText({organizationId:auth.organizationId,conversationId:p.data.id,userId:auth.userId,text:b.data.text});
    return reply.code(202).send(result);
  });
}
