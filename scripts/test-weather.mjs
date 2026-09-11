import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function moduleUrl(path,replacements={}){
  let code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  for(const [from,to] of Object.entries(replacements))code=code.replaceAll(from,to);
  return "data:text/javascript;base64,"+Buffer.from(code).toString("base64");
}
const dataUrl=moduleUrl("lib/weather-data.ts");
const {fromMet,fromOpenMeteo,localTime}=await import(dataUrl);
const service=await import(moduleUrl("lib/weather-service.ts",{"./weather-data":dataUrl}));
const originalFetch=globalThis.fetch,originalNow=Date.now;
let now=Date.parse("2026-09-11T12:30:00Z");
Date.now=()=>now;
const cache=new Map();
globalThis.caches={open:async()=>({match:async key=>cache.get(key)?.clone(),put:async(key,value)=>cache.set(key,value.clone())})};
const start=Date.parse("2026-09-11T12:00:00Z");
const met={properties:{timeseries:Array.from({length:32},(_,i)=>({time:new Date(start+i*6*3600000).toISOString(),data:{instant:{details:{air_temperature:13,apparent_air_temperature:11,wind_speed:5}},next_6_hours:{summary:{symbol_code:"rain"},details:{precipitation_amount:1,probability_of_precipitation:80}}}}))}};
const open={timezone:"Europe/Moscow",current:{time:"2026-09-11T15:00",temperature_2m:14,apparent_temperature:12,weather_code:3,wind_speed_10m:2,is_day:1,precipitation:0},daily:{time:["2026-09-11","2026-09-12"],temperature_2m_min:[9,10],temperature_2m_max:[15,17],apparent_temperature_max:[13,15],weather_code:[3,0],wind_speed_10m_max:[3,2],precipitation_sum:[0,0],precipitation_probability_max:[10,0]}};
const origin="https://forma.test";
const modified="Fri, 11 Sep 2026 12:00:00 GMT";
try{
  const mapped=fromMet(met,"Europe/Moscow",now);
  assert.equal(mapped.current.temperature,13);
  assert.equal(mapped.current.feels,11);
  assert.equal(mapped.current.code,61);
  assert.equal(mapped.current.probability,80);
  assert.equal(mapped.days.length,5);
  assert.equal(mapped.time,"2026-09-11T15:00");
  assert.equal(localTime("2026-09-11T23:00:00Z","Europe/Moscow").slice(0,10),"2026-09-12");
  const withoutProbability=structuredClone(met);
  withoutProbability.properties.timeseries.forEach(p=>delete p.data.next_6_hours.details.probability_of_precipitation);
  assert.equal(fromMet(withoutProbability,"UTC",now).current.probability,null);
  assert.throws(()=>fromMet({},"UTC",now));
  assert.throws(()=>fromMet(met,"UTC",now+20*86400000));
  assert.throws(()=>fromOpenMeteo({current:{temperature_2m:null}},now));

  let metCalls=0,geoCalls=0;
  globalThis.fetch=async(url,options)=>{
    if(url.host==="api.met.no"){
      metCalls++;assert.match(options.headers["User-Agent"],/FormaWardrobe/);
      assert.equal(url.searchParams.get("lat"),"59.9386");
      return Response.json(met,{headers:{"Last-Modified":modified,"Expires":new Date(now+20*60000).toUTCString()}});
    }
    geoCalls++;return Response.json({results:[{latitude:59.93863,longitude:30.31413,timezone:"Europe/Moscow"}]});
  };
  const results=await Promise.all([service.getWeather(59.93863,30.31413,"Санкт-Петербург",origin),service.getWeather(59.93863,30.31413,"Санкт-Петербург",origin)]);
  assert.equal(results[0].source,"met-no");assert.equal(results[0].timezone,"Europe/Moscow");
  assert.equal(metCalls,1);assert.equal(geoCalls,1);
  now+=16*60000;
  await service.getWeather(59.93863,30.31413,"Санкт-Петербург",origin);
  assert.equal(metCalls,1,"must honor upstream Expires");
  now+=5*60000;
  globalThis.fetch=async(url,options)=>{metCalls++;assert.equal(options.headers["If-Modified-Since"],modified);return new Response(null,{status:304})};
  const revalidated=await service.getWeather(59.93863,30.31413,"Санкт-Петербург",origin);
  assert.equal(revalidated.stale,false);assert.equal(metCalls,2);
  now+=16*60000;
  globalThis.fetch=async()=>new Response("unavailable",{status:503});
  const stale=await service.getWeather(59.93863,30.31413,"Санкт-Петербург",origin);
  assert.equal(stale.stale,true);

  let throttled=0;
  globalThis.fetch=async url=>{
    if(url.host==="api.met.no"){throttled++;return new Response("rate limited",{status:429,headers:{"Retry-After":"3600"}})}
    return Response.json(open);
  };
  const fallback=await service.getWeather(55,37,"","https://fallback.test");
  assert.equal(fallback.source,"open-meteo");
  await service.getWeather(56,38,"","https://fallback.test");
  assert.equal(throttled,1,"must not retry a rate-limited provider for another city");
  console.log("PASS: current weather, five days, local timezone, missing data, cache, request coalescing, Expires, conditional 304, stale fallback and 429 cooldown");
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;delete globalThis.caches}
