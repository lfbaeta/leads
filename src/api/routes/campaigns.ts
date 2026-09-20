import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/http.js";
import {
  createCampaign,
  listCampaigns,
  scheduleCampaign,
  setCampaignStatus
} from "../../campaigns/service.js";

const createSchema=z.object({
  name:z.string().trim().min(1).max(200),
  description:z.string().trim().max(2000).nullable().optional(),
  initialMessage:z.string().trim().min(1).max(5000),
  instanceId:z.string().uuid().nullable().optional(),
  startsAt:z.string().datetime({offset:true}).nullable().optional(),
  timezone:z.string().trim().min(1).max(100).default("America/Sao_Paulo"),
  allowedWeekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1,2,3,4,5]),
  sendWindowStart:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  sendWindowEnd:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  minIntervalSeconds:z.number().int().min(0).max(86400).default(25),
  maxIntervalSeconds:z.number().int().min(0).max(86400).default(80),
  fixedIntervalSeconds:z.number().int().min(0).max(86400).nullable().optional(),
  leadIds:z.array(z.string().uuid()).min(1).max(10000)
}).superRefine((data,ctx)=>{
  if(data.maxIntervalSeconds<data.minIntervalSeconds){
    ctx.addIssue({code:"custom",message:"Intervalo máximo deve ser maior ou igual ao mínimo.",path:["maxIntervalSeconds"]});
  }
  if((data.sendWindowStart===null)!==(data.sendWindowEnd===null)){
    ctx.addIssue({code:"custom",message:"Informe início e fim da janela juntos.",path:["sendWindowStart"]});
  }
});

const idSchema=z.object({id:z.string().uuid()});

export async function registerCampaignRoutes(app:FastifyInstance):Promise<void>{
  app.get("/campaigns",async(request)=>{
    const auth=await requireAuth(request);
    return listCampaigns(auth.organizationId);
  });

  app.post("/campaigns",async(request,reply)=>{
    const auth=await requireAuth(request);
    const parsed=createSchema.safeParse(request.body);
    if(!parsed.success) return reply.code(400).send({error:"Dados da campanha inválidos.",details:parsed.error.flatten()});

    const campaign=await createCampaign({
      organizationId:auth.organizationId,userId:auth.userId,
      name:parsed.data.name,description:parsed.data.description,
      initialMessage:parsed.data.initialMessage,instanceId:parsed.data.instanceId,
      startsAt:parsed.data.startsAt?new Date(parsed.data.startsAt):null,
      timezone:parsed.data.timezone,allowedWeekdays:parsed.data.allowedWeekdays,
      sendWindowStart:parsed.data.sendWindowStart,sendWindowEnd:parsed.data.sendWindowEnd,
      minIntervalSeconds:parsed.data.minIntervalSeconds,maxIntervalSeconds:parsed.data.maxIntervalSeconds,
      fixedIntervalSeconds:parsed.data.fixedIntervalSeconds,leadIds:parsed.data.leadIds
    });
    return reply.code(201).send(campaign);
  });

  app.post("/campaigns/:id/start",async(request,reply)=>{
    const auth=await requireAuth(request);
    const params=idSchema.safeParse(request.params);
    if(!params.success) return reply.code(400).send({error:"ID inválido."});
    const result=await scheduleCampaign({organizationId:auth.organizationId,campaignId:params.data.id,userId:auth.userId});
    return {campaignId:params.data.id,...result};
  });

  for(const action of ["pause","resume","cancel"] as const){
    app.post(`/campaigns/:id/${action}`,async(request,reply)=>{
      const auth=await requireAuth(request);
      const params=idSchema.safeParse(request.params);
      if(!params.success) return reply.code(400).send({error:"ID inválido."});
      await setCampaignStatus({organizationId:auth.organizationId,campaignId:params.data.id,userId:auth.userId,action});
      return {campaignId:params.data.id,status:action==="pause"?"PAUSED":action==="resume"?"RUNNING":"CANCELLED"};
    });
  }
}
