export type Gender = "male" | "female" | "unspecified";
export type Profile = { name: string; gender: Gender };
export const genders: Record<Gender, string> = {male:"Мужской",female:"Женский",unspecified:"Не определён"};
export type CategoryGroup = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
const categoryDefinitions = {
  tshirt:{label:"Футболки и топы",group:"top",range:[18,35]},
  shirt:{label:"Рубашки",group:"top",range:[14,28]},
  blouse:{label:"Блузки",group:"top",range:[16,30]},
  sweater:{label:"Свитеры и кардиганы",group:"top",range:[0,18]},
  hoodie:{label:"Худи и свитшоты",group:"top",range:[5,24]},
  trousers:{label:"Брюки и легинсы",group:"bottom",range:[5,28]},
  jeans:{label:"Джинсы",group:"bottom",range:[2,25]},
  shorts:{label:"Шорты",group:"bottom",range:[20,38]},
  skirt:{label:"Юбки",group:"bottom",range:[15,32]},
  dress:{label:"Платья",group:"dress",range:[18,35]},
  jumpsuit:{label:"Комбинезоны",group:"dress",range:[15,30]},
  outerwear:{label:"Верхняя одежда",group:"outerwear",range:[0,18]},
  shoes:{label:"Обувь",group:"shoes",range:[5,30]},
  accessory:{label:"Аксессуары",group:"accessory",range:[-30,45]},
} as const;
export type MainCategory = keyof typeof categoryDefinitions;
// Retain stored keys and old API clients while presenting only the concise list.
const categoryAliases = {
  polo:"tshirt",tank:"tshirt",longsleeve:"tshirt",top:"tshirt",
  sweatshirt:"hoodie",cardigan:"sweater",leggings:"trousers",bottom:"trousers",
  jacket:"outerwear",coat:"outerwear",downjacket:"outerwear",raincoat:"outerwear",blazer:"outerwear",vest:"outerwear",
  sneakers:"shoes",boots:"shoes",loafers:"shoes",sandals:"shoes",
  bag:"accessory",headwear:"accessory",scarf:"accessory",gloves:"accessory",belt:"accessory",
} as const satisfies Record<string,MainCategory>;
export type Category = MainCategory | keyof typeof categoryAliases;
export function normalizeCategory(category:Category):MainCategory {
  return category in categoryAliases ? categoryAliases[category as keyof typeof categoryAliases] : category as MainCategory;
}
const mainCategoryKeys = Object.keys(categoryDefinitions) as MainCategory[];
export const categoryKeys = [...mainCategoryKeys,...Object.keys(categoryAliases)] as [Category, ...Category[]];
export const categories = Object.fromEntries(categoryKeys.map(key=>[key,categoryDefinitions[normalizeCategory(key)].label])) as Record<Category,string>;
export function categoryGroup(category:Category):CategoryGroup{return categoryDefinitions[normalizeCategory(category)].group}
export function categoryRange(category:Category){return categoryDefinitions[normalizeCategory(category)].range}
export function categoryAllowed(category:Category,gender:Gender){return gender!=="male"||!["dress","skirt","blouse"].includes(normalizeCategory(category))}
export function availableCategories(gender:Gender){return mainCategoryKeys.filter(key=>categoryAllowed(key,gender)).map(key=>[key,categories[key]] as const)}
export const MAX_ITEM_TAGS=8;
export const MAX_TAG_LENGTH=40;
export function tagKey(tag:string){return tag.trim().replace(/\s+/g," ").toLocaleLowerCase("ru-RU").replace(/ё/g,"е")}
export function normalizeTags(tags:readonly string[]){
  const seen=new Set<string>();
  return tags.map(tag=>tag.trim().replace(/\s+/g," ")).filter(tag=>{
    const key=tagKey(tag);if(!key||seen.has(key))return false;seen.add(key);return true;
  });
}
// Starting estimates for individual garments, not a guarantee of comfort.
// Protection against rain/wind must be confirmed separately by the owner.
const clothingTagDefinitions:Partial<Record<MainCategory,Record<string,readonly [number,number]>>>={
  tshirt:{"Футболка":[18,35],"Поло":[18,30],"Майка":[23,38],"Лонгслив":[12,24]},
  shirt:{"Льняная рубашка":[20,35],"Фланелевая рубашка":[8,20]},
  blouse:{"Лёгкая блузка":[18,30]},
  sweater:{"Свитер":[0,18],"Кардиган":[8,22]},
  hoodie:{"Худи":[8,22],"Свитшот":[10,24]},
  trousers:{"Лёгкие брюки":[18,32],"Утеплённые брюки":[-15,10],"Легинсы":[12,25]},
  jeans:{"Тонкие джинсы":[15,28],"Плотные джинсы":[2,20]},
  shorts:{"Шорты":[20,38]},
  skirt:{"Лёгкая юбка":[20,32],"Плотная юбка":[12,24]},
  dress:{"Сарафан":[23,35],"Платье-свитер":[5,18]},
  jumpsuit:{"Летний комбинезон":[20,32]},
  outerwear:{"Ветровка":[10,20],"Джинсовая куртка":[12,22],"Тренч":[8,18],"Пальто":[0,12],"Пуховик":[-20,5],"Дождевик":[8,25],"Жакет":[14,24],"Утеплённый жилет":[5,16]},
  shoes:{"Кеды":[12,30],"Кроссовки":[8,28],"Лоферы":[12,26],"Сандалии":[22,38],"Ботинки":[0,18],"Зимние ботинки":[-20,5],"Резиновые сапоги":[5,20]},
  accessory:{"Шапка":[-20,10],"Шарф":[-20,12],"Перчатки":[-20,8],"Панама":[20,38],"Кепка":[15,35],"Сумка":[-30,45]},
};
export function suggestedTags(category:Category){return Object.keys(clothingTagDefinitions[normalizeCategory(category)]??{})}
export function tagTemperatureRange(category:Category,tag:string):readonly [number,number]|undefined{
  return Object.entries(clothingTagDefinitions[normalizeCategory(category)]??{}).find(([name])=>tagKey(name)===tagKey(tag))?.[1];
}
export function temperatureSuggestion(category:Category,tags:readonly string[]):{
  source:"tag"|"category"|"conflict";range:readonly [number,number]|null;tags:string[];
}{
  const matches=normalizeTags(tags).flatMap(tag=>{
    const range=tagTemperatureRange(category,tag);return range?[{tag,range}]:[];
  });
  if(!matches.length)return {source:"category",range:categoryRange(category),tags:[]};
  const range=matches[0].range;
  if(matches.some(match=>match.range[0]!==range[0]||match.range[1]!==range[1])){
    return {source:"conflict",range:null,tags:matches.map(match=>match.tag)};
  }
  return {source:"tag",range,tags:matches.map(match=>match.tag)};
}
export type Item={id:string;name:string;category:Category;tags?:string[];color:string;minTemp:number;maxTemp:number;rainproof:boolean;windproof:boolean;image:string;createdAt?:string};
export type Outfit={id:string;name:string;itemIds:string[];createdAt:string};
export type City={name:string;latitude:number;longitude:number;country?:string;admin1?:string};
export type Conditions={temperature:number;feels:number;code:number;wind:number;rain:number;probability:number|null;isDay:boolean};
export type Day={date:string;min:number;max:number;feels:number;code:number;wind:number;rain:number;probability:number|null};
export type Weather={current:Conditions;days:Day[];timezone:string;time:string;fetchedAt:string;source?:"met-no"|"open-meteo";stale?:boolean;feelsEstimated?:boolean};
export const defaultCity:City={name:"Москва",latitude:55.75222,longitude:37.61556};
export function degree(n:number){return `${n>0?"+":""}${Math.round(n)}°`}
export function weatherKind(code:number){if(code>=95)return "storm";if([71,73,75,77,85,86].includes(code))return "snow";if(code>=51)return "rain";if(code>=45)return "fog";if(code>=3)return "cloud";if(code>0)return "partly";return "sun"}
export function weatherLabel(code:number,isDay=true){return ({storm:"Гроза",snow:"Снег",rain:"Дождь",fog:"Туман",cloud:"Облачно",partly:"Переменная облачность",sun:isDay?"Ясно":"Ясная ночь"})[weatherKind(code)]}
export function isWet(w:Conditions){return w.rain>0||(w.probability!==null&&w.probability>=45)||["rain","snow","storm"].includes(weatherKind(w.code))}
export function weatherAdvice(w:Conditions,gender:Gender="unspecified"){const lines:string[]=[];if(w.feels>=28)lines.push("Жарко: выбирайте лёгкие, свободные вещи.");else if(w.feels>=22)lines.push(gender==="male"?"Тепло: подойдут футболка, поло или лёгкая рубашка.":"Тепло: подойдут футболка, рубашка или лёгкое платье.");else if(w.feels>=15)lines.push("Нужен лёгкий слой: рубашка, жакет или ветровка.");else if(w.feels>=5)lines.push("Прохладно: добавьте тёплый верх и закрытую обувь.");else lines.push("Холодно: выбирайте тёплые слои, зимнюю обувь, шапку и перчатки.");if(isWet(w))lines.push("Возьмите зонт; лучше выбрать непромокаемую обувь.");if(w.wind>=8)lines.push("Ветрено: пригодится одежда с защитой от ветра.");if(weatherKind(w.code)==="sun"&&w.isDay)lines.push("В ясную погоду пригодятся очки и головной убор.");if(w.code>=95)lines.push("Возможна гроза — учитывайте предупреждения местных служб.");return lines}
export function suitable(item:Item,w:Conditions){return w.feels>=item.minTemp&&w.feels<=item.maxTemp}
export function recommend(items:Item[],w:Conditions,variation=0,gender:Gender="unspecified"){items=items.filter(i=>categoryAllowed(i.category,gender));const wet=isWet(w);const warnings:string[]=[];const missing:string[]=[];const selected:Item[]=[];const candidates=(category:CategoryGroup)=>items.filter(i=>categoryGroup(i.category)===category&&suitable(i,w));const pick=(list:Item[])=>{const sorted=[...list].sort((a,b)=>Number(b.rainproof&&wet)-Number(a.rainproof&&wet)||Number(b.windproof&&w.wind>=8)-Number(a.windproof&&w.wind>=8));if(!sorted.length)return undefined;const best=sorted.filter(i=>(!wet||!sorted[0].rainproof||i.rainproof)&&(!(w.wind>=8)||!sorted[0].windproof||i.windproof));return best[variation%best.length]};
const needOuter=w.feels<17||w.wind>=8||wet;const outer=needOuter?pick(candidates("outerwear")):undefined;
const tops=candidates("top");if(outer&&w.feels<17)items.filter(i=>categoryGroup(i.category)==="top"&&i.minTemp<=20&&i.maxTemp>=17&&!tops.some(t=>t.id===i.id)).forEach(i=>tops.push(i));
const top=pick(tops),bottom=pick(candidates("bottom")),dress=pick(candidates("dress"));if(dress&&(!top||!bottom||variation%2===1))selected.push(dress);else{if(top)selected.push(top);else missing.push("верх или цельная одежда");if(bottom)selected.push(bottom);else missing.push("низ или цельная одежда")}
const shoes=pick(candidates("shoes"));if(shoes)selected.push(shoes);else missing.push("обувь");if(needOuter){if(outer)selected.push(outer);else if(w.feels<17||w.wind>=8)missing.push("верхняя одежда");else warnings.push("Добавьте зонт или лёгкий дождевик.")}
if(wet&&shoes&&!shoes.rainproof)warnings.push("У выбранной обуви не указана защита от дождя.");if(wet&&outer&&!outer.rainproof)warnings.push("Верхний слой без защиты от дождя — возьмите зонт.");if(w.wind>=8&&outer&&!outer.windproof)warnings.push("У верхнего слоя не отмечена защита от ветра.");const accessory=pick(candidates("accessory"));if(accessory)selected.push(accessory);return {items:selected,missing:[...new Set(missing)],warnings,complete:missing.length===0&&warnings.length===0}}

export function outfitSuitable(items:Item[],w:Conditions,gender:Gender="unspecified"){if(items.some(i=>!categoryAllowed(i.category,gender)))return false;if(!items.length)return false;const has=(c:CategoryGroup)=>items.some(i=>categoryGroup(i.category)===c);if(!(has("dress")||(has("top")&&has("bottom")))||!has("shoes"))return false;const outer=items.find(i=>categoryGroup(i.category)==="outerwear"&&suitable(i,w));if((w.feels<17||w.wind>=8)&&!outer)return false;if(!items.every(i=>suitable(i,w)||(categoryGroup(i.category)==="top"&&!!outer&&w.feels<17&&i.minTemp<=20&&i.maxTemp>=17)))return false;if(isWet(w)&&(!items.filter(i=>categoryGroup(i.category)==="shoes").every(i=>i.rainproof)||!outer?.rainproof))return false;if(w.wind>=8&&!outer?.windproof)return false;return true}
