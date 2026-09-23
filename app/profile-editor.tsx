"use client";
import { useState } from "react";
import { Check, LoaderCircle, UserRound, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { genders, type Gender, type Profile } from "@/lib/wardrobe";
import { api } from "@/lib/client";
import { toast } from "sonner";

export default function ProfileEditor({ profile, initialName, onClose, onSaved }: {
  profile: Profile | null; initialName?: string; onClose: () => void; onSaved: (profile: Profile) => void;
}) {
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
      onClose();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy && profile) onClose(); }}>
    <DialogContent className="profile-dialog" showCloseButton={false}
      onEscapeKeyDown={event => { if (!profile || busy) event.preventDefault(); }}
      onPointerDownOutside={event => { if (!profile || busy) event.preventDefault(); }}>
      {profile && <DialogClose aria-label="Закрыть профиль" className="dialog-x" disabled={busy}><X size={20}/></DialogClose>}
      <UserRound className="profile-symbol" size={32}/>
      <DialogTitle className="dialog-heading">{profile ? "Ваш профиль" : "Давайте познакомимся"}</DialogTitle>
      <DialogDescription>Укажите имя и пол — настроим категории вашего гардероба. Эти данные можно изменить в любой момент.</DialogDescription>
      <form className="profile-form" onSubmit={save}>
        <label className="field">Имя<input autoComplete="given-name" value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="Как вас зовут?" required disabled={busy}/></label>
        <fieldset className="profile-gender"><legend>Пол</legend>
          {Object.entries(genders).map(([value, label]) => <label key={value} className={gender === value ? "gender-option selected" : "gender-option"}>
            <input type="radio" name="gender" value={value} checked={gender === value} onChange={() => setGender(value as Gender)} disabled={busy}/><span>{label}</span>
          </label>)}
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-footer">{profile && <button type="button" className="btn" onClick={onClose} disabled={busy}>Отмена</button>}
          <button className="btn btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin"/> : <Check/>}{busy ? "Сохраняем…" : profile ? "Сохранить" : "Начать гардероб"}</button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
