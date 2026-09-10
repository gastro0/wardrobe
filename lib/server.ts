import {env} from "cloudflare:workers";
export class ApiError extends Error{constructor(public status:number,message:string){super(message)}}
export function db(){if(!env.DB)throw new ApiError(503,"Гардероб временно недоступен. Попробуйте ещё раз.");return env.DB}
export function bucket(){if(!env.BUCKET)throw new ApiError(503,"Не удалось подключиться к фотографиям. Попробуйте ещё раз.");return env.BUCKET}
// Single-wardrobe mode requested by the owner. Sites keeps the entire site
// owner-private; no second in-app sign-in or identity header is required.
// Do not make this site public/shared without restoring per-user isolation.
export function user(_request:Request){return "private-wardrobe"}
export function protect(request:Request){const origin=request.headers.get("origin");if(request.headers.get("sec-fetch-site")==="cross-site"||(origin&&origin!==new URL(request.url).origin))throw new ApiError(403,"Не удалось проверить запрос. Обновите страницу.");return user(request)}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}})}
export function failure(error:unknown){if(error instanceof ApiError)return json({error:error.message},error.status);if(error instanceof SyntaxError)return json({error:"Не удалось прочитать данные."},400);console.error("Wardrobe request failed",error);return json({error:"Не удалось выполнить действие. Ваши изменения не потеряны — попробуйте ещё раз."},503)}
export async function body(request:Request){if(Number(request.headers.get("content-length"))>30000)throw new ApiError(413,"Слишком большой запрос.");const value=await request.json();if(!value||typeof value!=="object"||Array.isArray(value))throw new ApiError(400,"Неверный формат данных.");return value as Record<string,unknown>}
