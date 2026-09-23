import {json,ApiError,failure,user} from "@/lib/server";
import {getWeather} from "@/lib/weather-service";

export async function GET(request:Request){
  try{
    await user(request);
    const url=new URL(request.url),q=url.searchParams;
    const lat=Number(q.get("lat")),lon=Number(q.get("lon"));
    if(!q.get("lat")?.trim()||!q.get("lon")?.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new ApiError(400,"Выберите город.");
    return json(await getWeather(lat,lon,(q.get("city")??"").trim().slice(0,120),url.origin));
  }catch(error){
    if(error instanceof ApiError)return failure(error);
    console.error("Weather providers unavailable",error instanceof Error?error.message:String(error));
    return json({error:"Не удалось связаться с сервисами погоды. Попробуйте ещё раз через несколько минут."},503);
  }
}
