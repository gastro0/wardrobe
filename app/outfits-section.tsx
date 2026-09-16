"use client";

import {Info, Pencil, Plus, Trash2} from "lucide-react";
import {Skeleton} from "@/components/ui/skeleton";
import type {Gender, Item, Outfit} from "@/lib/wardrobe";
import OutfitCollage from "./outfit-collage";
import RandomLook from "./random-look";

type Props = {
  items: Item[];
  outfits: Outfit[];
  outfitItems: Map<string, Item[]>;
  gender: Gender;
  demo: boolean;
  loading: boolean;
  error: string;
  onOpen: (outfit: Partial<Outfit>) => void;
  onDelete: (outfit: Outfit) => void;
  onAddOwn: () => void;
};

export default function OutfitsSection({items, outfits, outfitItems, gender, demo, loading, error, onOpen, onDelete, onAddOwn}: Props) {
  return <>
    {demo && <div className="demo-note"><span><Info size={16}/>Примеры образов. Соберите свой на этой коллекции или добавьте свои вещи.</span><button onClick={onAddOwn}>Начать свой<Plus size={14}/></button></div>}
    {loading ? <Skeleton className="h-72 rounded-xl"/> : !error && <>
      <div className="outfits-grid">
        {outfits.map(outfit => {
          const pieces = outfitItems.get(outfit.id) ?? [];
          const missing = pieces.length !== outfit.itemIds.length;
          return <article className="saved-outfit surface" key={outfit.id}>
            <button className="saved-outfit-open" onClick={() => onOpen(outfit)} aria-label={`Открыть образ ${outfit.name}`}><OutfitCollage items={pieces}/></button>
            <div className="saved-outfit-info">
              <div><h2>{outfit.name}</h2><p>{pieces.length} вещей{demo ? " · Пример" : ""}{missing ? " · Есть удалённые вещи" : ""}</p></div>
              <button className="icon-button" onClick={() => onOpen(outfit)} aria-label={`Изменить образ ${outfit.name}`}><Pencil size={17}/></button>
              {!demo && <button className="icon-button" onClick={() => onDelete(outfit)} aria-label={`Удалить образ ${outfit.name}`}><Trash2 size={17}/></button>}
            </div>
          </article>;
        })}
        <button className="add-outfit-card" onClick={() => onOpen({})}><span className="add-round"><Plus size={30}/></span><h2>Новое сочетание</h2><p>Соберите образ из своих вещей</p></button>
      </div>
      <RandomLook key={`${demo}-${gender}-${items.map(item => `${item.id}:${item.category}`).join(",")}`} items={items} onOpen={onOpen} onAdd={onAddOwn}/>
    </>}
  </>;
}
