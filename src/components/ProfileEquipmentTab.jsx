import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Save, X } from 'lucide-react';
import {
  EQUIPMENT_GROUPS, ALL_EQUIPMENT, WEIGHT_CATEGORY_EQUIPMENT, WEIGHT_CATEGORY_LABELS,
} from '@/lib/fitness';
import { kgToInput, inputToKg, kgToLbs } from '@/lib/units';
import { cn } from '@/lib/utils';

export default function ProfileEquipmentTab({ form, setForm }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const isFullGym = form.equipment_profile === 'full_gym';
  const unit = form.weight_unit;

  const chipClass = (on, disabled = false) =>
    cn('px-3 py-2 rounded-full text-xs font-medium border transition-colors',
      on ? 'bg-brand text-brand-foreground border-transparent' : 'border-border text-muted-foreground',
      disabled && 'opacity-60 cursor-not-allowed');
  const weightLabel = (kg) => (unit === 'lbs' ? `${Math.round(kgToLbs(kg))}lbs` : `${kg}kg`);

  const setProfile = (mode) => setForm((f) => ({ ...f, equipment_profile: mode }));

  const toggleEquipment = (e) => setForm((f) => {
    const arr = f.custom_equipment || [];
    return { ...f, custom_equipment: arr.includes(e) ? arr.filter((x) => x !== e) : [...arr, e] };
  });

  const allSelected = ALL_EQUIPMENT.every((e) => (form.custom_equipment || []).includes(e));
  const toggleAll = () => setForm((f) => ({ ...f, custom_equipment: allSelected ? [] : [...ALL_EQUIPMENT] }));

  const toggleCategoryAll = (group) => setForm((f) => {
    const items = group.items;
    const arr = f.custom_equipment || [];
    const every = items.every((e) => arr.includes(e));
    const next = every ? arr.filter((e) => !items.includes(e)) : Array.from(new Set([...arr, ...items]));
    return { ...f, custom_equipment: next };
  });

  const setMaxKg = (cat, val) => setForm((f) => ({
    ...f,
    weight_setup: { ...f.weight_setup, [cat]: { max_kg: inputToKg(val, unit) } },
  }));

  const activeCategories = Object.entries(WEIGHT_CATEGORY_EQUIPMENT)
    .filter(([, eqs]) => eqs.some((e) => (form.custom_equipment || []).includes(e)));

  const loadSaved = (saved) => setForm((f) => ({
    ...f,
    equipment_profile: 'custom',
    custom_equipment: [...(saved.available_equipment || [])],
    weight_setup: {
      dumbbells: { max_kg: saved.weight_setup?.dumbbells?.max_kg ?? f.weight_setup.dumbbells.max_kg },
      barbell: { max_kg: saved.weight_setup?.barbell?.max_kg ?? f.weight_setup.barbell.max_kg },
      kettlebells: { max_kg: saved.weight_setup?.kettlebells?.max_kg ?? f.weight_setup.kettlebells.max_kg },
    },
  }));

  const deleteSaved = (idx) => setForm((f) => ({
    ...f,
    saved_equipment_profiles: (f.saved_equipment_profiles || []).filter((_, i) => i !== idx),
  }));

  const saveProfile = () => {
    if (!name.trim()) return;
    setForm((f) => ({
      ...f,
      saved_equipment_profiles: [
        ...(f.saved_equipment_profiles || []),
        { name: name.trim(), available_equipment: [...(f.custom_equipment || [])], weight_setup: { ...f.weight_setup } },
      ],
    }));
    setName('');
    setNaming(false);
  };

  const profileBtn = (active, label, desc, onClick, trailing) => (
    <button onClick={onClick} className={cn('w-full rounded-xl border px-4 py-3 text-left transition-all', active ? 'border-brand bg-brand/5' : 'border-border')}>
      <div className="flex items-center justify-between">
        <div><p className="font-medium text-sm">{label}</p>{desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}</div>
        {trailing || (active && <span className="h-4 w-4 rounded-full border-4 border-brand" />)}
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Equipment profile</label>
        <div className="mt-2 space-y-2">
          {profileBtn(isFullGym, 'Full Gym', 'All equipment assumed available.', () => setProfile('full_gym'))}
          {profileBtn(!isFullGym && !naming, 'Custom', 'Select exactly what you have.', () => setProfile('custom'))}

          {(form.saved_equipment_profiles || []).map((sp, i) => (
            <div key={i} className={cn('w-full rounded-xl border px-4 py-3 flex items-center justify-between border-border')}>
              <button onClick={() => loadSaved(sp)} className="flex-1 text-left">
                <p className="font-medium text-sm">{sp.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{(sp.available_equipment || []).length} items</p>
              </button>
              <button onClick={() => deleteSaved(i)} className="text-muted-foreground hover:text-destructive ml-2"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        {!isFullGym && (
          <div className="mt-3">
            {naming ? (
              <div className="rounded-xl border border-border p-3 space-y-2 bg-card">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Profile name (e.g. Home gym)"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveProfile} disabled={!name.trim()} className="flex-1"><Save className="h-3.5 w-3.5" /> Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setNaming(false); setName(''); }}><X className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setNaming(true)} className="w-full"><Plus className="h-4 w-4" /> Save current setup as a profile</Button>
            )}
          </div>
        )}
      </div>

      {isFullGym ? (
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-4">
          <p className="text-sm font-medium text-brand">Full gym enabled</p>
          <p className="text-xs text-muted-foreground mt-1">All machines, barbells, dumbbells, benches, cable stations, accessories and cardio are assumed available.</p>
        </div>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Available equipment</label>
              <button onClick={toggleAll} className="text-[11px] font-medium text-brand">{allSelected ? 'Deselect all' : 'Select all'}</button>
            </div>
            <div className="space-y-3">
              {EQUIPMENT_GROUPS.map((group) => {
                const groupAll = group.items.every((e) => (form.custom_equipment || []).includes(e));
                return (
                  <div key={group.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">{group.label}</p>
                      <button onClick={() => toggleCategoryAll(group)} className="text-[11px] font-medium text-brand">{groupAll ? 'Clear' : 'All'}</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.items.map((e) => (
                        <button key={e} onClick={() => toggleEquipment(e)} className={chipClass((form.custom_equipment || []).includes(e))}>{e}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {activeCategories.length > 0 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Max weight available</label>
              <p className="text-[11px] text-muted-foreground/70 mb-2">Tell us the heaviest you can load so we assign realistic target weights.</p>
              <div className="space-y-3">
                {activeCategories.map(([cat]) => (
                  <div key={cat} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{WEIGHT_CATEGORY_LABELS[cat]}</p>
                      <span className="text-[11px] text-muted-foreground/60">Max</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={kgToInput(form.weight_setup[cat]?.max_kg, unit)}
                        onChange={(e) => setMaxKg(cat, e.target.value)}
                        placeholder="e.g. 30"
                        className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                      <span className="text-xs text-muted-foreground">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}