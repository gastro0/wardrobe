"use client";
import {Checkbox} from "@/components/ui/checkbox";
import {type temperatureSuggestion} from "@/lib/wardrobe";

export default function ItemTemperature({auto,onAuto,min,max,onChange,suggestion,disabled}:{
  auto:boolean;onAuto:(value:boolean)=>void;min:string;max:string;
  onChange:(min:string,max:string)=>void;
  suggestion:ReturnType<typeof temperatureSuggestion>;disabled:boolean;
}){
  return <fieldset className="temp-fieldset">
    <legend>Комфортная температура</legend>
    <div className="weather-checkboxes"><label><Checkbox checked={auto} onCheckedChange={value=>onAuto(value===true)} disabled={disabled}/>Определять по тегам и категории</label></div>
    <p className="field-help" aria-live="polite">{!auto?"Указана вручную. Изменение тегов не меняет вашу температуру.":suggestion.source==="conflict"?`У тегов «${suggestion.tags.join("», «")}» разные диапазоны. Оставьте один тип или задайте температуру вручную.`:suggestion.source==="tag"?`Диапазон подобран по тегу «${suggestion.tags.join("», «")}».` :"Базовый диапазон категории. Добавьте известный тип в тегах, чтобы уточнить температуру."}</p>
    <div className="form-two">
      <label className="field"><span className="muted">От, °C</span><input type="number" min={-50} max={50} step={1} value={min} onChange={event=>onChange(event.target.value,max)} disabled={disabled} required/></label>
      <label className="field"><span className="muted">До, °C</span><input type="number" min={-50} max={50} step={1} value={max} onChange={event=>onChange(min,event.target.value)} disabled={disabled} required/></label>
    </div>
    <p className="field-help">Примерный диапазон ощущаемой температуры. Поправьте его по своим ощущениям — это включит ручной режим. Для верха подбор также учитывает слой куртки.</p>
  </fieldset>;
}
