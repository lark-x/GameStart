import assert from "node:assert/strict";
import test from "node:test";
import { AnthropicProvider, OpenAICompatibleProvider, ProviderError, type ChatObservation } from "./index.ts";

const req = { messages: [{ role: "user" as const, content: "hello" }], trace: { correlationId: "c1" } };
function collect() { const events: ChatObservation[] = []; return { events, hook: (e: ChatObservation) => { events.push(e); } }; }

test("OpenAI trace stays out of request body and secrets stay out of event JSON", async () => {
  const c=collect(); const provider=new OpenAICompatibleProvider({baseUrl:"https://x.test",model:"m",apiKey:"sentinel-api-key",observationHook:c.hook},async()=>new Response(JSON.stringify({id:"1",model:"m",choices:[{message:{content:"ok"}}]})));
  await provider.complete({...req, trace:{correlationId:"c1",conversationId:"conversation"}});
  assert.equal(JSON.stringify(c.events).includes("sentinel-api-key"),false);
  assert.equal(JSON.stringify(c.events).includes("authorization"),false);
});

test("Anthropic trace stays out of body and complete emits completion", async () => {
  const c=collect(); let body=""; const provider=new AnthropicProvider({baseUrl:"https://x.test/v1",model:"m",apiKey:"sentinel-key",observationHook:c.hook},async(_i,init)=>{body=String(init?.body); return new Response(JSON.stringify({id:"1",model:"m",content:[{type:"text",text:"ok"}]}));});
  await provider.complete(req); assert.equal(body.includes("correlationId"),false); assert.equal(c.events.some(e=>e.name==="completed"),true); assert.equal(JSON.stringify(c.events).includes("sentinel-key"),false);
});

test("throwing hooks do not change complete or stream behavior", async () => {
  const bad=async()=>{throw new Error("hook failed")}; const p=new OpenAICompatibleProvider({baseUrl:"https://x.test",model:"m",observationHook:bad},async()=>new Response(JSON.stringify({id:"1",model:"m",choices:[{message:{content:"ok"}}]})));
  assert.equal((await p.complete(req)).content,"ok");
  const s=new ReadableStream({start(x){x.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: [DONE]\n\n'));x.close();}});
  const sp=new OpenAICompatibleProvider({baseUrl:"https://x.test",model:"m",observationHook:bad},async()=>new Response(s));
  const out=[]; for await(const d of sp.stream(req)) out.push(d.content); assert.deepEqual(out,["a"]);
});

test("first_token is emitted exactly once for each stream", async () => {
  const c=collect(); const s=new ReadableStream({start(x){x.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\ndata: {"choices":[{"delta":{"content":"b"}}]}\n\ndata: [DONE]\n\n'));x.close();}});
  const p=new OpenAICompatibleProvider({baseUrl:"https://x.test",model:"m",observationHook:c.hook},async()=>new Response(s)); for await(const _ of p.stream(req)) {}
  assert.equal(c.events.filter(e=>e.name==="first_token").length,1);
});

test("provider errors remain ProviderError when observation fails", async () => {
  const p=new OpenAICompatibleProvider({baseUrl:"https://x.test",model:"m",observationHook:async()=>{throw new Error("x")}},async()=>new Response("bad",{status:500}));
  await assert.rejects(p.complete(req),(e:unknown)=>e instanceof ProviderError && e.code==="HTTP_ERROR");
});
test("OpenAI failure emits exactly one error after start", async () => {
  const c=collect(); const p=new OpenAICompatibleProvider({baseUrl:"https://x.test",model:"m",observationHook:c.hook},async()=>{throw new Error("socket")});
  await assert.rejects(p.complete(req)); assert.deepEqual(c.events.map(e=>e.name),["request_started","error"]);
});

test("Anthropic stream failure emits one error and one first token", async () => {
  const c=collect(); const body=new ReadableStream({start(x){x.enqueue(new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"a"}}\n\nevent: message\ndata: nope\n\n'));x.close();}});
  const p=new AnthropicProvider({baseUrl:"https://x.test/v1",model:"m",apiKey:"key",observationHook:c.hook},async()=>new Response(body));
  await assert.rejects((async()=>{for await(const _ of p.stream(req)) {}})()); assert.equal(c.events.filter(e=>e.name==="first_token").length,1); assert.equal(c.events.filter(e=>e.name==="error").length,1);
});

test("stream consumer cancellation emits completed cancelled", async () => {
  const c=collect(); const body=new ReadableStream({start(x){x.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'));}});
  const p=new OpenAICompatibleProvider({baseUrl:"https://x.test",model:"m",observationHook:c.hook},async()=>new Response(body)); const iterator=p.stream(req)[Symbol.asyncIterator](); await iterator.next(); await iterator.return?.(undefined);
  assert.equal(c.events.filter(e=>e.name==="completed" && e.outcome==="cancelled").length,1);
});

test("null stream bodies emit error for both providers", async () => {
  for (const provider of [new OpenAICompatibleProvider({baseUrl:"https://x.test",model:"m"},async()=>new Response(null)), new AnthropicProvider({baseUrl:"https://x.test/v1",model:"m",apiKey:"key"},async()=>new Response(null))]) {
    await assert.rejects((async()=>{for await(const _ of provider.stream(req)) {}})(), (e: unknown) => e instanceof ProviderError && e.code === "STREAM_ERROR");
  }
});

test("malicious observation values cannot make the hook throw", async () => {
  const seen: ChatObservation[]=[]; const object: Record<string, unknown>={token:"secret"}; object.self=object; Object.defineProperty(object,"boom",{enumerable:true,get(){throw new Error("boom")}});
  await (await import("./observability.ts")).emitObservation((e)=>{ seen.push(e); }, {name:"error", preview: object as unknown as string, error:{message:"Bearer secret"}}); assert.equal(seen.length,1); assert.equal(JSON.stringify(seen).includes("secret"),false);
});

import { ActiveProfileChatProvider } from "./profile-resolver.ts";
import { LlmProviderProtocol, type LlmProviderProfile } from "../../domain/src/index.ts";
const profile: LlmProviderProfile={id:"p1",name:"profile-name",protocol:LlmProviderProtocol.OPENAI_COMPATIBLE,baseUrl:"https://x.test",model:"model-name",timeoutMs:1000,maxTokens:10,temperature:0,encryptedApiKey:"bad",encryptionIv:"bad",isActive:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
const repo=(active?: LlmProviderProfile)=>({list:async()=>[],getById:async()=>undefined,getActive:async()=>active,save:async()=>{},delete:async()=>{}});
const fake={complete:async()=>({id:"f",model:"fallback",content:"fallback"}),stream:async function*(){yield {content:"fallback"};}};
test("ActiveProfile resolves profile with protocol and model context", async () => { const p={...profile}; delete p.encryptedApiKey; delete p.encryptionIv; const events:ChatObservation[]=[]; const active=new ActiveProfileChatProvider(repo(p),undefined,undefined,(e)=>{ events.push(e); }); await assert.rejects(active.complete(req),/LLM request failed|fetch/); assert.equal(events[0]?.profileId,"p1"); assert.equal(events[0]?.protocol,LlmProviderProtocol.OPENAI_COMPATIBLE); assert.equal(events[0]?.model,"model-name"); assert.equal(JSON.stringify(events).includes("bad"),false); });
test("ActiveProfile missing without fallback rejects", async () => { await assert.rejects(new ActiveProfileChatProvider(repo(),undefined,undefined).complete(req),/No active/); });
test("ActiveProfile missing uses fallback", async () => { assert.equal((await new ActiveProfileChatProvider(repo(),undefined,fake).complete(req)).content,"fallback"); });
test("ActiveProfile decrypt failure is reported without key", async () => { const events:ChatObservation[]=[]; await assert.rejects(new ActiveProfileChatProvider(repo(profile),undefined,undefined,(e)=>{ events.push(e); }).complete(req),/cannot be decrypted/); assert.equal(events[0]?.outcome,"error"); assert.equal(JSON.stringify(events).includes("bad"),false); });
test("ActiveProfile provider construction failure is reported", async () => { const broken={...profile,baseUrl:"not-a-url"}; delete broken.encryptedApiKey; delete broken.encryptionIv; const events:ChatObservation[]=[]; await assert.rejects(new ActiveProfileChatProvider(repo(broken),undefined,undefined,(e)=>{ events.push(e); }).complete(req),/valid URL/); assert.equal(events[0]?.outcome,"error"); });