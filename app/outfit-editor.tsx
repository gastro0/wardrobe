"use client";

import { useState } from "react";
import { Check, Layers, LoaderCircle, Plus, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { availableCategories, categories, categoryGroup, type Gender, type Item, type Outfit } from "@/lib/wardrobe";
import { api } from "@/lib/client";
import { toast } from "sonner";
import OutfitCollage from "./outfit-collage";

type Props = {
  items: Item[];
  gender: Gender;
  initial: Partial<Outfit>;
  demo: boolean;
  onClose: () => void;
  onSaved: (outfit: Outfit) => void;
  onAddOwn: () => void;
};

export default function OutfitEditor({ items, initial, demo, gender, onClose, onSaved, onAddOwn }: Props) {
  const [name, setName] = useState(initial.name ?? "");
  const [selected, setSelected] = useState<string[]>(
    (initial.itemIds ?? []).filter(id => items.some(item => item.id === id))
  );
  const [category, setCategory] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = selected.flatMap(id => items.find(item => item.id === id) ?? []);
  const filteredItems = items.filter(item => category === "all" || item.category === category);
  const missingCore = !(
    chosen.some(item => categoryGroup(item.category) === "dress") ||
    (chosen.some(item => categoryGroup(item.category) === "top") &&
      chosen.some(item => categoryGroup(item.category) === "bottom"))
  ) || !chosen.some(item => categoryGroup(item.category) === "shoes");

  function toggle(id: string) {
    setSelected(old => old.includes(id) ? old.filter(value => value !== id)
      : old.length < 30 ? [...old, id] : old);
    setError("");
  }

  async function save() {
    if (!name.trim()) { setError("Дайте образу название."); return; }
    if (!selected.length) { setError("Выберите хотя бы одну вещь."); return; }
    setBusy(true);
    setError("");
    try {
      if (demo) {
        onSaved({
          id: initial.id ?? `demo-outfit-${Date.now()}`,
          name: name.trim(), itemIds: selected, createdAt: new Date().toISOString(),
        });
        toast.success("Пример образа собран. Для постоянного сохранения добавьте свои вещи.");
      } else {
        const data = await api<{ outfit: Outfit }>("/api/outfits", {
          method: "POST",
          body: JSON.stringify({ id: initial.id, name: name.trim(), itemIds: selected }),
        });
        onSaved(data.outfit);
        toast.success("Образ сохранён");
      }
      onClose();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="outfit-dialog" showCloseButton={false}>
      <DialogClose aria-label="Закрыть конструктор" className="dialog-x" disabled={busy}><X size={20}/></DialogClose>
      <DialogTitle className="dialog-heading">{initial.id ? "Ваше сочетание" : "Собираем образ"}</DialogTitle>
      <DialogDescription>{demo
        ? "Конструктор на примере вещей. Такие образы доступны до обновления страницы."
        : "Выбирайте вещи из гардероба — они появятся в образе."}</DialogDescription>
      <div className="builder-layout">
        <div className="builder-left">
          <label className="field">Название образа
            <input value={name} onChange={event => setName(event.target.value)}
              placeholder="Например, прогулка по городу" maxLength={100} disabled={busy}/>
          </label>
          <div className={`outfit-board ${chosen.length ? "" : "board-empty"}`}>
            {chosen.length
              ? <OutfitCollage items={chosen} onRemove={toggle} disabled={busy}/>
              : <Empty><EmptyHeader><Layers size={35}/><EmptyTitle>Здесь будет ваш образ</EmptyTitle>
                <EmptyDescription>Начните с верха, низа и обуви. Добавьте слои и аксессуары.</EmptyDescription>
              </EmptyHeader></Empty>}
          </div>
          <p className="field-help">{chosen.length
            ? `${chosen.length} вещей в образе${missingCore ? " · Можно дополнить или сохранить как есть" : " · Основа образа готова"}`
            : "Выберите первую вещь из гардероба"}</p>
        </div>
        <div className="builder-closet">
          <div className="builder-closet-heading">
            <h3>{demo ? "Пример гардероба" : "Ваши вещи"}</h3>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Категория для образа" className="builder-filter"><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="all">Все</SelectItem>
                {availableCategories(gender).map(([key, value]) =>
                  <SelectItem key={key} value={key}>{value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="builder-items">
            {filteredItems.map(item => <button key={item.id}
              className={`builder-choice ${selected.includes(item.id) ? "chosen" : ""}`}
              aria-pressed={selected.includes(item.id)} onClick={() => toggle(item.id)} disabled={busy}>
              <img src={item.image} alt=""/>
              <span><strong>{item.name}</strong><small>{categories[item.category]}</small></span>
              {selected.includes(item.id) ? <Check size={18}/> : <Plus size={18}/>}
            </button>)}
            {!filteredItems.length && <p className="field-help">В этой категории пока нет вещей.</p>}
          </div>
          {!items.length && <button className="btn" onClick={onAddOwn}><Plus/>Добавить вещь</button>}
        </div>
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="form-footer">
        <button className="btn" onClick={onClose} disabled={busy}>Отмена</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !selected.length}>
          {busy ? <LoaderCircle className="spin"/> : <Check/>}
          {busy ? "Сохраняем…" : demo ? "Собрать пример" : "Сохранить образ"}
        </button>
      </div>
    </DialogContent>
  </Dialog>;
}
