"use client";
import {X} from "lucide-react";
import {MAX_ITEM_TAGS,MAX_TAG_LENGTH,normalizeTags,suggestedTags,tagKey,type Category} from "@/lib/wardrobe";

export default function ItemTags({category,tags,draft,onDraft,onChange,disabled}:{
  category:Category;tags:string[];draft:string;onDraft:(value:string)=>void;
  onChange:(tags:string[])=>void;disabled:boolean;
}){
  const pending=normalizeTags([...tags,...draft.split(",")]);
  const valid=pending.length<=MAX_ITEM_TAGS&&pending.every(tag=>tag.length<=MAX_TAG_LENGTH);
  const suggestions=suggestedTags(category).filter(tag=>!tags.some(value=>tagKey(value)===tagKey(tag)));
  function add(){if(valid){onChange(pending);onDraft("")}}
  return <fieldset className="clothing-tags" disabled={disabled}>
    <legend>Теги · конкретный тип вещи</legend>
    <div className="tag-list" aria-label="Теги вещи">{tags.map(tag=><span className="clothing-tag" key={tagKey(tag)}>{tag}<button type="button" aria-label={`Удалить тег ${tag}`} onClick={()=>onChange(tags.filter(value=>value!==tag))}><X size={14}/></button></span>)}</div>
    <div className="tag-entry"><label className="field"><span className="sr-only">Новый тег</span><input value={draft} onChange={event=>onDraft(event.target.value)} placeholder="Свой тег или несколько через запятую" aria-describedby="tag-help" onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();add()}}}/></label><button className="btn" type="button" disabled={disabled||!draft.trim()||!valid} onClick={add}>Добавить</button></div>
    <p id="tag-help" className="field-help">Выберите подсказку или введите свой тип. До {MAX_ITEM_TAGS} тегов, по {MAX_TAG_LENGTH} символов.</p>
    {!valid&&<p className="form-error" role="alert">Сократите теги: не больше {MAX_ITEM_TAGS}, до {MAX_TAG_LENGTH} символов каждый.</p>}
    {!!suggestions.length&&<div className="tag-list tag-suggestions" aria-label="Подсказки тегов">{suggestions.map(tag=><button type="button" className="clothing-tag" key={tag} disabled={disabled||tags.length>=MAX_ITEM_TAGS} onClick={()=>onChange(normalizeTags([...tags,tag]))}>+ {tag}</button>)}</div>}
    <p className="field-help">Известный тип уточняет температуру в автоматическом режиме. Для своих тегов используется диапазон категории. Защиту от дождя и ветра отметьте отдельно.</p>
  </fieldset>;
}
