"use client";

import {useState} from "react";
import {Layers, Shirt, X} from "lucide-react";
import {groupOutfit, type OutfitSlot} from "@/lib/outfit-layout";
import type {Item} from "@/lib/wardrobe";

function CollagePhoto({item}: {item: Item}) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="collage-photo-failed"><Shirt aria-hidden="true"/><span>{item.name}</span></span> : <img src={item.image} alt={item.name} loading="lazy" onError={() => setFailed(true)}/>;
}

export default function OutfitCollage({items, className = "", onRemove, disabled = false}: {
  items: Item[];
  className?: string;
  onRemove?: (id: string) => void;
  disabled?: boolean;
}) {
  const groups = groupOutfit(items);
  return <div className={`outfit-collage ${groups.head.length ? "collage-with-head" : ""} ${groups.full.length ? "collage-with-full" : ""} ${!groups.side.length ? "collage-no-side" : ""} ${onRemove ? "collage-editable" : ""} ${className}`}>
    {!items.length && <Layers className="collage-empty-icon" aria-label="В образе пока нет вещей"/>}
    {(Object.keys(groups) as OutfitSlot[]).map(slot => groups[slot].length > 0 && <div className={`collage-zone collage-${slot} ${groups[slot].length > 1 ? "collage-zone-multiple" : ""}`} key={slot}>
      {groups[slot].map(item => <div className="collage-piece" key={item.id} title={item.name}>
        <CollagePhoto key={item.image} item={item}/>
        {onRemove && <button className="collage-remove" onClick={() => onRemove(item.id)} disabled={disabled} aria-label={`Убрать ${item.name}`}><X size={14}/></button>}
      </div>)}
    </div>)}
  </div>;
}
