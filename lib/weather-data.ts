import type {Conditions, Day, Weather} from "./wardrobe";

function number(value:unknown):number {
  if(typeof value!=="number"||!Number.isFinite(value))throw new Error("Incomplete weather data");
  return value;
}
function probability(value:unknown):number|null {
  return typeof value==="number"&&Number.isFinite(value)?Math.max(0,Math.min(100,value)):null;
}
export function localTime(time:string|number,timezone:string) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(time));
  const part=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}
export function metCode(symbol:string):number {
  if(symbol.includes("thunder"))return 95;
  if(symbol.includes("snow")||symbol.includes("sleet"))return 71;
  if(symbol.includes("heavyrain"))return 65;
  if(symbol.includes("lightrain"))return 51;
  if(symbol.includes("rain"))return 61;
  if(symbol.includes("fog"))return 45;
  if(symbol.includes("partlycloudy"))return 2;
  if(symbol.includes("cloudy"))return 3;
  if(symbol.includes("fair"))return 1;
  if(symbol.includes("clearsky"))return 0;
  throw new Error("Unknown weather symbol");
}
type MetPeriod={summary:{symbol_code:string};details:{precipitation_amount?:number;probability_of_precipitation?:number;air_temperature_min?:number;air_temperature_max?:number}};
type MetPoint={time:string;data:{instant:{details:{air_temperature:number;apparent_air_temperature?:number;wind_speed:number}};next_1_hours?:MetPeriod;next_6_hours?:MetPeriod;next_12_hours?:MetPeriod}};
function record(value:unknown):value is Record<string,unknown> {
  return typeof value==="object"&&value!==null&&!Array.isArray(value);
}
function metPoint(value:unknown):value is MetPoint {
  if(!record(value)||typeof value.time!=="string"||!record(value.data))return false;
  const instant=value.data.instant;
  if(!record(instant)||!record(instant.details))return false;
  const details=instant.details;
  if(typeof details.air_temperature!=="number"||typeof details.wind_speed!=="number")return false;
  for(const key of ["next_1_hours","next_6_hours","next_12_hours"]){
    const period=value.data[key];
    if(period!==undefined&&(!record(period)||!record(period.summary)||
      typeof period.summary.symbol_code!=="string"||!record(period.details)))return false;
  }
  return true;
}
function interval(point:MetPoint) {
  if(point.data.next_1_hours)return {period:point.data.next_1_hours,hours:1};
  if(point.data.next_6_hours)return {period:point.data.next_6_hours,hours:6};
  return {period:point.data.next_12_hours,hours:12};
}
function metConditions(point:MetPoint):Conditions {
  const details=point.data.instant.details;
  const {period}=interval(point);
  if(!period)throw new Error("Missing forecast interval");
  return {temperature:number(details.air_temperature),feels:number(details.apparent_air_temperature??details.air_temperature),wind:number(details.wind_speed),code:metCode(period.summary.symbol_code),rain:number(period.details.precipitation_amount??0),probability:probability(period.details.probability_of_precipitation),isDay:!period.summary.symbol_code.endsWith("_night")};
}
export function fromMet(data:unknown,timezone:string,now=Date.now()):Weather {
  const properties=record(data)?data.properties:undefined;
  const series=record(properties)?properties.timeseries:undefined;
  if(!Array.isArray(series)||!series.length||!series.every(metPoint))throw new Error("Missing forecast timeseries");
  // The current interval starts before now and must still contain now.
  const currentPoint=series.filter(p=>Date.parse(p.time)<=now&&Date.parse(p.time)+interval(p).hours*3600000>now&&interval(p).period).at(-1);
  if(!currentPoint)throw new Error("Forecast does not cover current time");
  const today=localTime(now,timezone).slice(0,10);
  const groups=new Map<string,MetPoint[]>();
  for(const point of series){const date=localTime(point.time,timezone).slice(0,10);if(date<today||!interval(point).period)continue;const list=groups.get(date)??[];list.push(point);groups.set(date,list)}
  const days:Day[]=[...groups].slice(0,5).map(([date,points])=>{
    const conditions=points.map(metConditions);
    const probabilities=conditions.map(c=>c.probability).filter((v):v is number=>v!==null);
    let rain=0,coveredUntil=0;
    for(const point of points){const {period,hours}=interval(point);const time=Date.parse(point.time);if(time>=coveredUntil){rain+=number(period!.details.precipitation_amount??0);coveredUntil=time+hours*3600000}}
    return {date,min:Math.min(...conditions.map(c=>c.temperature)),max:Math.max(...conditions.map(c=>c.temperature)),feels:Math.max(...conditions.map(c=>c.feels)),wind:Math.max(...conditions.map(c=>c.wind)),code:Math.max(...conditions.map(c=>c.code)),rain:Math.round(rain*100)/100,probability:probabilities.length?Math.max(...probabilities):null};
  });
  if(days.length<2||days[0].date!==today)throw new Error("Incomplete daily forecast");
  return {current:metConditions(currentPoint),days,timezone,time:localTime(currentPoint.time,timezone),fetchedAt:new Date(now).toISOString(),source:"met-no",feelsEstimated:series.some(p=>p.data.instant.details.apparent_air_temperature==null)};
}
export function fromOpenMeteo(data:unknown,now=Date.now()):Weather {
  if(!record(data)||!record(data.current)||!record(data.daily))throw new Error("Missing weather data");
  const current=data.current,daily=data.daily;
  if(!Array.isArray(daily.time)||!daily.time.length||typeof current.time!=="string"||
    typeof data.timezone!=="string")throw new Error("Missing weather data");
  const dailyArray=(key:string):unknown[]=>{
    const values=daily[key];
    if(!Array.isArray(values))throw new Error("Missing weather data");
    return values;
  };
  const hourly=record(data.hourly)?data.hourly:undefined;
  const hourlyTimes=hourly&&Array.isArray(hourly.time)?hourly.time:[];
  const hour=hourlyTimes.findIndex((time:unknown)=>typeof time==="string"&&time.slice(0,13)===(current.time as string).slice(0,13));
  const hourlyRain=hourly&&Array.isArray(hourly.precipitation_probability)?hourly.precipitation_probability:[];
  const probabilities:number[]=hour<0?[]:hourlyRain.slice(hour,hour+6).filter((value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value));
  const minimums=dailyArray("temperature_2m_min"),maximums=dailyArray("temperature_2m_max");
  const feels=dailyArray("apparent_temperature_max"),codes=dailyArray("weather_code");
  const winds=dailyArray("wind_speed_10m_max"),rains=dailyArray("precipitation_sum");
  const dailyProbabilities=Array.isArray(daily.precipitation_probability_max)?daily.precipitation_probability_max:[];
  return {current:{temperature:number(current.temperature_2m),feels:number(current.apparent_temperature),code:number(current.weather_code),wind:number(current.wind_speed_10m),rain:number(current.precipitation??0),isDay:!!current.is_day,probability:probabilities.length?Math.max(...probabilities):null},days:daily.time.map((date:unknown,i:number)=>({date:String(date),min:number(minimums[i]),max:number(maximums[i]),feels:number(feels[i]),code:number(codes[i]),wind:number(winds[i]),rain:number(rains[i]),probability:probability(dailyProbabilities[i])})),timezone:data.timezone,time:current.time,fetchedAt:new Date(now).toISOString(),source:"open-meteo"};
}
