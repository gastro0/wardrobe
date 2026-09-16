"use client";

import {useState} from "react";
import {Layers, Plus, RefreshCw, Shuffle} from "lucide-react";
import {randomOutfit} from "@/lib/random-outfit";
import {type Item, type Outfit} from "@/lib/wardrobe";
import OutfitCollage from "./outfit-collage";

export default function RandomLook({items, onOpen, onAdd}: {items: Item[]; onOpen: (outfit: Partial<Outfit>) => void; onAdd: () => void}) {
  const [selection, setSelection] = useState(() => randomOutfit(items).map(item => item.id));
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const pieces = selection.flatMap(id => items.find(item => item.id === id) ?? []);

  function refresh() {
    const next = randomOutfit(items, selection).map(item => item.id);
    const unchanged = next.length === selection.length && next.every(id => selection.includes(id));
    setSelection(next);
    setRevision(value => value + 1);
    setNotice(unchanged ? "Пока доступно одно сочетание. Добавьте вещи, чтобы было больше вариантов." : "Новое сочетание готово.");
  }

  return <section className="random-look" aria-labelledby="random-look-title">
    <div className="random-look-heading">
      <div><div className="eyebrow"><Shuffle size={15}/> Идея для вдохновения</div><h2 id="random-look-title">Рандомный лук</h2><p>Миксуйте вещи из всех образов и гардероба в новые сочетания.</p></div>
      <button className="btn random-look-refresh" onClick={refresh} disabled={!items.length} aria-label="Обновить рандомный лук" title="Другой вариант"><RefreshCw key={revision} className={revision ? "random-look-turn" : ""}/></button>
    </div>
    {pieces.length ? <>
      <OutfitCollage items={pieces} className="random-look-collage"/>
      <div className="random-look-actions"><button className="btn btn-primary" onClick={() => onOpen({name: "Рандомный лук", itemIds: selection})}><Layers/>Открыть в конструкторе</button><p className="field-help">Свободный микс без привязки к погоде.</p></div>
    </> : <div className="random-look-empty"><p>Добавьте вещи в гардероб — здесь появится первое сочетание.</p><button className="btn" onClick={onAdd}><Plus/>Добавить вещь</button></div>}
    <p className="random-look-status" role="status" aria-live="polite">{notice}</p>
  </section>;
}
