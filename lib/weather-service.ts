import {fromMet,fromOpenMeteo} from "./weather-data";
import type {Weather} from "./wardrobe";

const MINUTE=60000;
const RETAIN=2*60*MINUTE;
type Entry={data?:any;fetchedAt:number;expires:number;modified?:string;blockedUntil?:number};
const memory=new Map<string,Entry>();
const pending=new Map<string,Promise<Entry>>();
const USER_AGENT="FormaWardrobe/1.0 (https://forma-wardrobe.gastro0.chatgpt.site)";

async function read(key:string):Promise<Entry|undefined>{
  const entry=memory.get(key);
  if(entry&&Date.now()-entry.fetchedAt<RETAIN)return entry;
  try{const response=await (await caches.open("forma-weather-v1")).match(key);return response?await response.json() as Entry:undefined}catch{return undefined}
}
async function write(key:string,entry:Entry){
  if(memory.size>=80)memory.delete(memory.keys().next().value!);
  memory.set(key,entry);
  try{await (await caches.open("forma-weather-v1")).put(key,Response.json(entry,{headers:{"Cache-Control":`public, max-age=${Math.ceil(Math.max(RETAIN,(entry.blockedUntil??0)-Date.now())/1000)}`}}))}catch{/* An unavailable cache must not hide a valid forecast. */}
}
function cacheKey(origin:string,name:string){const key=new URL("/__weather_cache/v1",origin);key.searchParams.set("key",name);return key.toString()}
function retryUntil(value:string|null){const seconds=Number(value);return Date.now()+Math.max(60*MINUTE,Number.isFinite(seconds)&&seconds>0?seconds*1000:(Date.parse(value??"")||0)-Date.now())}

// Cache upstream JSON, honor Expires / Last-Modified, and coalesce simultaneous
// requests. The provider's throttle is never retried from another identity.
async function upstream(url:URL,origin:string,ttl:number):Promise<Entry>{
  const key=cacheKey(origin,url.toString()),cooldownKey=cacheKey(origin,`cooldown:${url.host}`);
  const previous=await read(key),now=Date.now();
  if(previous?.data&&previous.expires>now)return previous;
  const cooldown=await read(cooldownKey);
  if(cooldown?.blockedUntil&&cooldown.blockedUntil>now){if(previous?.data&&now-previous.fetchedAt<RETAIN)return previous;throw new Error(`${url.host}: cooling down`)}
  const active=pending.get(key);if(active)return active;
  const promise=(async()=>{
    try{
      const headers:Record<string,string>={Accept:"application/json"};
      if(url.host==="api.met.no")headers["User-Agent"]=USER_AGENT;
      if(previous?.modified)headers["If-Modified-Since"]=previous.modified;
      const response=await fetch(url,{headers,signal:AbortSignal.timeout(8000)});
      if(response.status===429){await write(cooldownKey,{fetchedAt:now,expires:0,blockedUntil:retryUntil(response.headers.get("retry-after"))});throw new Error(`${url.host}: rate limited`)}
      if(!response.ok&&response.status!==304)throw new Error(`${url.host}: HTTP ${response.status}`);
      const data=response.status===304?previous?.data:await response.json();
      if(!data||typeof data!=="object")throw new Error(`${url.host}: invalid JSON`);
      const expires=Math.max(Date.now()+ttl,Date.parse(response.headers.get("expires")??"")||0);
      const entry:Entry={data,expires,fetchedAt:Date.now(),modified:response.headers.get("last-modified")??previous?.modified};
      await write(key,entry);return entry;
    }catch(error){
      console.warn("Weather source unavailable",error instanceof Error?error.message:String(error));
      if(previous?.data&&Date.now()-previous.fetchedAt<RETAIN)return previous;
      throw error;
    }
  })();
  pending.set(key,promise);try{return await promise}finally{pending.delete(key)}
}

async function timezoneForCity(city:string,lat:number,lon:number,origin:string):Promise<string>{
  if(!city)return "UTC";
  const url=new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search=new URLSearchParams({name:city,count:"10",language:"ru",format:"json"}).toString();
  try{
    const entry=await upstream(url,origin,60*MINUTE);
    const matches=(entry.data.results??[]).filter((c:any)=>Math.abs(c.latitude-lat)<.15&&Math.abs(c.longitude-lon)<.15);
    const timezone=matches[0]?.timezone;
    if(typeof timezone==="string"){new Intl.DateTimeFormat("en",{timeZone:timezone});return timezone}
  }catch{/* The response explicitly labels UTC if city timezone is unavailable. */}
  return "UTC";
}

export async function getWeather(lat:number,lon:number,city:string,origin:string):Promise<Weather>{
  // MET Norway is the primary source; Open-Meteo remains an independent fallback.
  const met=new URL("https://api.met.no/weatherapi/locationforecast/2.0/complete");
  met.search=new URLSearchParams({lat:(Math.trunc(lat*10000)/10000).toFixed(4),lon:(Math.trunc(lon*10000)/10000).toFixed(4)}).toString();
  try{
    const [entry,timezone]=await Promise.all([upstream(met,origin,15*MINUTE),timezoneForCity(city,lat,lon,origin)]);
    const weather=fromMet(entry.data,timezone);
    return {...weather,fetchedAt:new Date(entry.fetchedAt).toISOString(),stale:entry.expires<=Date.now()};
  }catch(error){console.warn("MET forecast unavailable",error instanceof Error?error.message:String(error))}
  const open=new URL("https://api.open-meteo.com/v1/forecast");
  open.search=new URLSearchParams({latitude:String(lat),longitude:String(lon),current:"temperature_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",hourly:"precipitation_probability",daily:"weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",wind_speed_unit:"ms",timezone:"auto",forecast_days:"5"}).toString();
  const entry=await upstream(open,origin,15*MINUTE);
  return {...fromOpenMeteo(entry.data),fetchedAt:new Date(entry.fetchedAt).toISOString(),stale:entry.expires<=Date.now()};
}
