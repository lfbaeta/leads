import { describe,expect,it } from "vitest";
import { renderInitialMessage } from "../src/campaigns/service.js";

describe("campanhas",()=>{
  it("renderiza variáveis da primeira abordagem",()=>{
    expect(renderInitialMessage(
      "Olá {{nome}}, vi a {{empresa}} em {{cidade}}.",
      {name:"Ana",company:"Café Ana",city:"Registro"}
    )).toBe("Olá Ana, vi a Café Ana em Registro.");
  });

  it("remove variáveis opcionais vazias sem quebrar a mensagem",()=>{
    expect(renderInitialMessage(
      "Olá {{nome}} {{empresa}}",
      {name:"Carlos",company:null,city:null}
    )).toBe("Olá Carlos");
  });
});
