import type {Item,Outfit} from "./wardrobe";
export const demoItems:Item[]=[
{id:"demo-tee",name:"Молочная футболка",category:"top",color:"Молочный",minTemp:18,maxTemp:38,rainproof:false,windproof:false,image:"/images/cream-tshirt.jpg"},
{id:"demo-shirt",name:"Голубая рубашка",category:"top",color:"Голубой",minTemp:14,maxTemp:28,rainproof:false,windproof:false,image:"/images/blue-shirt.jpg"},
{id:"demo-jeans",name:"Прямые джинсы",category:"bottom",color:"Синий",minTemp:2,maxTemp:25,rainproof:false,windproof:false,image:"/images/dark-jeans.jpg"},
{id:"demo-jacket",name:"Оливковая куртка",category:"outerwear",color:"Оливковый",minTemp:5,maxTemp:20,rainproof:false,windproof:true,image:"/images/olive-jacket.png"},
{id:"demo-shoes",name:"Белые кеды",category:"shoes",color:"Белый",minTemp:10,maxTemp:30,rainproof:false,windproof:false,image:"/images/white-sneakers.jpg"},
{id:"demo-bag",name:"Чёрная сумка",category:"accessory",color:"Чёрный",minTemp:-30,maxTemp:45,rainproof:false,windproof:false,image:"/images/black-tote.jpg"}];
export const demoOutfits:Outfit[]=[{id:"demo-outfit",name:"Неспешный день",itemIds:["demo-tee","demo-jeans","demo-shoes","demo-bag"],createdAt:""}];
