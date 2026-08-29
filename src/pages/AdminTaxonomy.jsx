import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Loader2, AlertTriangle } from 'lucide-react';
import { EQUIPMENT_GROUPS } from '@/lib/fitness';
import { DIMENSIONS, fetchTaxonomyTerms, checkUsage, transferExercises } from '@/lib/taxonomy';
import { findDuplicateTaxonomyTerm, UNIQUE_VIOLATION } from '@/lib/duplicates';
import { useToast } from '@/components/ui/use-toast';

const GROUP_OPTIONS = [...EQUIPMENT_GROUPS.map(g => g.label), 'Bodyweight'];

export default function AdminTaxonomy() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [dimension, setDimension] = useState('equipment');
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTerm, setNewTerm] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [transferTarget, setTransferTarget] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const isEquipment = dimension === 'equipment';

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') { navigate('/'); return; }
  }, [user]);

  const loadTerms = async (dim) => {
    setLoading(true);
    try { setTerms(await fetchTaxonomyTerms(dim)); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTerms(dimension); }, [dimension]);

  const addTerm = async () => {
    if (!newTerm.trim()) return;
    if (isEquipment && !newGroup) return;
    setProcessing(true);
    try {
      const duplicate = await findDuplicateTaxonomyTerm(dimension, newTerm);
      if (duplicate) {
        toast({ title: 'Term already exists', description: `"${duplicate.value}" is already in this list.`, variant: 'destructive' });
        return;
      }
      const { error } = await supabase.from('taxonomy_terms').insert({
        dimension,
        value: newTerm.trim(),
        label: newLabel.trim() || undefined,
        group: isEquipment ? newGroup : undefined,
        sort_order: terms.length,
      });
      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          toast({ title: 'Term already exists', description: `"${newTerm.trim()}" is already in this list.`, variant: 'destructive' });
          return;
        }
        throw error;
      }
      setNewTerm('');
      setNewLabel('');
      setNewGroup('');
      setShowAdd(false);
      loadTerms(dimension);
    } finally { setProcessing(false); }
  };

  const saveEdit = async () => {
    if (!editValue.trim() || !editing) return;
    setProcessing(true);
    try {
      if (editValue.trim() !== editing.value) {
        const duplicate = await findDuplicateTaxonomyTerm(dimension, editValue, editing.id);
        if (duplicate) {
          toast({ title: 'Term already exists', description: `"${duplicate.value}" is already in this list.`, variant: 'destructive' });
          return;
        }
        await transferExercises(dimension, editing.value, editValue.trim());
      }
      const update = { value: editValue.trim() };
      if (editLabel.trim()) update.label = editLabel.trim();
      if (isEquipment) update.group = editGroup;
      const { error } = await supabase.from('taxonomy_terms').update(update).eq('id', editing.id);
      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          toast({ title: 'Term already exists', description: `"${editValue.trim()}" is already in this list.`, variant: 'destructive' });
          return;
        }
        throw error;
      }
      setEditing(null);
      setEditValue('');
      setEditLabel('');
      setEditGroup('');
      loadTerms(dimension);
    } finally { setProcessing(false); }
  };

  const startDelete = async (term) => {
    const usageCount = await checkUsage(dimension, term.value);
    setDeleting({ ...term, usageCount });
    setTransferTarget('');
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setProcessing(true);
    try {
      if (deleting.usageCount > 0 && transferTarget) {
        await transferExercises(dimension, deleting.value, transferTarget);
      }
      await supabase.from('taxonomy_terms').delete().eq('id', deleting.id);
      setDeleting(null);
      setTransferTarget('');
      loadTerms(dimension);
    } finally { setProcessing(false); }
  };

  const otherTerms = terms.filter(t => t.id !== deleting?.id).map(t => t.value);

  const groupedTerms = isEquipment
    ? GROUP_OPTIONS.map(g => ({
        group: g,
        terms: terms.filter(t => t.group === g),
      })).concat([{ group: 'Uncategorized', terms: terms.filter(t => !t.group) }])
        .filter(g => g.terms.length > 0)
    : [{ group: null, terms }];

  return (
    <div className="px-5 pt-10 pb-8">
      <button onClick={() => navigate('/profile')} className="flex items-center gap-1 text-sm text-muted-foreground mb-4 hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </button>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-semibold tracking-tight">Taxonomy Management</h1>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 h-8 shrink-0 bg-brand hover:bg-brand/90 text-brand-foreground">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">Manage exercise classification options</p>

      <Select value={dimension} onValueChange={setDimension}>
        <SelectTrigger className="rounded-xl h-12 mb-4 border-2 border-brand/50"><SelectValue /></SelectTrigger>
        <SelectContent>
          {DIMENSIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-7 h-7 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-4 mb-5">
          {groupedTerms.map(({ group, terms: groupTerms }) => (
            <div key={group || 'ungrouped'}>
              {isEquipment && (
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group}</p>
              )}
              <div className="space-y-2">
                {groupTerms.map(term => (
                  <div key={term.id} className="rounded-xl border border-border p-3">
                    {editing?.id === term.id ? (
                      <div className="space-y-2">
                        <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Friendly name (optional)" className="h-9" />
                        <div className="flex gap-2">
                          <Input value={editValue} onChange={e => setEditValue(e.target.value)} className="h-9" autoFocus onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }} />
                          <Button size="sm" onClick={saveEdit} disabled={processing} className="shrink-0">
                            {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditing(null); setEditValue(''); setEditLabel(''); setEditGroup(''); }} className="shrink-0">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        {isEquipment && (
                          <Select value={editGroup} onValueChange={setEditGroup}>
                            <SelectTrigger className="h-9"><SelectValue placeholder="Type…" /></SelectTrigger>
                            <SelectContent>
                              {GROUP_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium truncate">{term.label || term.value}</span>
                            {term.label && <span className="text-[10px] text-muted-foreground truncate">{term.value}</span>}
                          </div>
                          {isEquipment && term.group && (
                            <span className="text-[10px] text-brand bg-brand/10 px-1.5 py-0.5 rounded-full shrink-0">{term.group}</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setEditing(term); setEditValue(term.value); setEditLabel(term.label || ''); setEditGroup(term.group || ''); }} className="p-1.5 rounded-lg hover:bg-muted">
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button onClick={() => startDelete(term)} className="p-1.5 rounded-lg hover:bg-muted">
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {terms.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No terms yet.</p>}
        </div>
      )}

      <Sheet open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) { setNewTerm(''); setNewLabel(''); setNewGroup(''); } }}>
        <SheetContent side="bottom" className="rounded-t-3xl p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
            <SheetTitle className="text-left">Add {DIMENSIONS.find(d => d.value === dimension)?.label || 'term'}</SheetTitle>
          </SheetHeader>
          <div className="px-5 py-4 space-y-2">
            {isEquipment && (
              <Select value={newGroup} onValueChange={setNewGroup}>
                <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select type…" /></SelectTrigger>
                <SelectContent>
                  {GROUP_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Friendly name (optional)…" className="rounded-xl h-11" />
            <Input value={newTerm} onChange={e => setNewTerm(e.target.value)} placeholder="Machine name…" className="rounded-xl h-11" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') addTerm(); }}
            />
            <Button onClick={addTerm} disabled={processing || !newTerm.trim() || (isEquipment && !newGroup)} className="w-full rounded-xl h-11">
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!deleting} onOpenChange={(o) => { if (!o) { setDeleting(null); setTransferTarget(''); } }}>
        <SheetContent side="bottom" className="rounded-t-3xl p-0">
          {deleting && (
            <>
              <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
                <SheetTitle className="text-left">Delete "{deleting.value}"?</SheetTitle>
              </SheetHeader>
              <div className="px-5 py-4 space-y-4">
                {deleting.usageCount === 0 ? (
                  <p className="text-sm text-muted-foreground">This term is not used by any exercises. It will be permanently deleted.</p>
                ) : (
                  <>
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-700">{deleting.usageCount} exercise{deleting.usageCount !== 1 ? 's' : ''} use this term. Transfer them to another term before deleting.</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Transfer to</label>
                      <Select value={transferTarget} onValueChange={setTransferTarget}>
                        <SelectTrigger className="rounded-xl h-11 mt-1"><SelectValue placeholder="Select replacement…" /></SelectTrigger>
                        <SelectContent>
                          {otherTerms.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={confirmDelete} disabled={processing || (deleting.usageCount > 0 && !transferTarget)} className="flex-1 rounded-xl h-11">
                    {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                  </Button>
                  <Button variant="outline" onClick={() => { setDeleting(null); setTransferTarget(''); }} className="rounded-xl h-11">Cancel</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}