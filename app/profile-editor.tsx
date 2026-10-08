"use client";
import { useId, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { DialogDescription } from "@/components/ui/dialog";
import AppDialog from "@/components/app-dialog";
import { genders, type Gender, type Profile } from "@/lib/wardrobe";
import { api } from "@/lib/client";
import { toast } from "sonner";

export default function ProfileEditor({ profile, initialName, onClose, onSaved }: {
  profile: Profile | null; initialName?: string; onClose: () => void; onSaved: (profile: Profile) => void;
}) {
  const [open, setOpen] = useState(true);
  const formId = useId();
  const [name, setName] = useState(profile?.name ?? initialName?.slice(0,60) ?? "");
  const [gender, setGender] = useState<Gender>(profile?.gender ?? "unspecified");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Как вас зовут?"); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{profile: Profile}>("/api/profile", {
        method: "POST", body: JSON.stringify({name: name.trim(), gender}),
      });
      onSaved(result.profile);
      toast.success("Профиль сохранён");
      setOpen(false);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <AppDialog open={open} onOpenChange={setOpen} onClosed={onClose}
    className="profile-dialog" title={profile ? "Ваш профиль" : "Давайте познакомимся"}
    closeLabel="Закрыть профиль" busy={busy} dismissible={!!profile}
    footer={<div className="form-footer">
      {profile && <button type="button" className="btn" onClick={() => setOpen(false)} disabled={busy}>Отмена</button>}
      <button type="submit" form={formId} className="btn btn-primary" disabled={busy}>
        {busy ? <LoaderCircle className="spin"/> : <Check/>}
        {busy ? "Сохраняем…" : profile ? "Сохранить" : "Создать мой гардероб"}
      </button>
    </div>}>
      <DialogDescription>Укажите имя и пол — настроим категории вашего гардероба. Эти данные можно изменить в любой момент.</DialogDescription>
      <form id={formId} className="profile-form" onSubmit={save}>
        <label className="field">Имя<input autoComplete="given-name" value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="Как вас зовут?" required disabled={busy}/></label>
        <fieldset className="profile-gender"><legend>Пол</legend>
          {Object.entries(genders).map(([value, label]) => <label key={value} className={gender === value ? "gender-option selected" : "gender-option"}>
            <input type="radio" name="gender" value={value} checked={gender === value} onChange={() => setGender(value as Gender)} disabled={busy}/><span>{label}</span>
          </label>)}
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
  </AppDialog>;
}
