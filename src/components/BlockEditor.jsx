import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Plus, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { IconButton } from '@/components/ui/icon-button';

export default function BlockEditor({
  block,
  exercises,
  setsByBlockExercise,
  onUpdateBlock,
  onDeleteBlock,
  onEditExercise,
  onDeleteExercise,
  onAddExercise,
  onMoveBlock,
  isFirst,
  isLast,
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    block_label: '',
    block_type: '',
    workout_format: '',
    rounds: '',
    rest_between_rounds_sec: '',
    time_cap_sec: '',
    work_seconds: '',
    rest_seconds: '',
  });

  useEffect(() => {
    setForm({
      block_label: block.block_label || '',
      block_type: block.block_type || '',
      workout_format: block.workout_format || '',
      rounds: block.rounds?.toString() || '',
      rest_between_rounds_sec: block.rest_between_rounds_sec?.toString() || '',
      time_cap_sec: block.time_cap_sec?.toString() || '',
      work_seconds: block.work_seconds?.toString() || '',
      rest_seconds: block.rest_seconds?.toString() || '',
    });
  }, [block]);

  const handleSave = () => {
    onUpdateBlock(block.id, {
      block_label: form.block_label,
      block_type: form.block_type,
      workout_format: form.workout_format || null,
      rounds: form.rounds ? parseInt(form.rounds, 10) : null,
      rest_between_rounds_sec: form.rest_between_rounds_sec ? parseInt(form.rest_between_rounds_sec, 10) : null,
      time_cap_sec: form.time_cap_sec ? parseInt(form.time_cap_sec, 10) : null,
      work_seconds: form.work_seconds ? parseInt(form.work_seconds, 10) : null,
      rest_seconds: form.rest_seconds ? parseInt(form.rest_seconds, 10) : null,
    });
    setEditing(false);
  };

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 p-3 bg-muted/50">
        <span className="h-6 w-6 rounded-full bg-brand text-brand-foreground text-xs font-semibold flex items-center justify-center shrink-0">
          {block.block_label || '?'}
        </span>
        <span className="text-sm font-medium flex-1 capitalize truncate">
          {block.block_type?.replace(/_/g, ' ') || 'Block'}
          {block.rounds > 1 && (
            <span className="text-xs text-muted-foreground normal-case"> · {block.rounds} rounds</span>
          )}
        </span>
        <button onClick={() => onMoveBlock(block, 'up')} disabled={isFirst} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onMoveBlock(block, 'down')} disabled={isLast} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <IconButton onClick={() => setEditing(!editing)} icon={Pencil} />
        <button onClick={() => onDeleteBlock(block)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing && (
        <div className="p-3 space-y-3 border-t border-border">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Label</label>
              <Input value={form.block_label} onChange={(e) => setForm({ ...form, block_label: e.target.value })} className="mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <Input value={form.block_type} onChange={(e) => setForm({ ...form, block_type: e.target.value })} placeholder="main, warmup…" className="mt-0.5" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Format</label>
            <Input value={form.workout_format} onChange={(e) => setForm({ ...form, workout_format: e.target.value })} placeholder="AMRAP, For Time…" className="mt-0.5" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Rounds</label>
              <Input type="number" value={form.rounds} onChange={(e) => setForm({ ...form, rounds: e.target.value })} className="mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Rest (s)</label>
              <Input type="number" value={form.rest_between_rounds_sec} onChange={(e) => setForm({ ...form, rest_between_rounds_sec: e.target.value })} className="mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cap (s)</label>
              <Input type="number" value={form.time_cap_sec} onChange={(e) => setForm({ ...form, time_cap_sec: e.target.value })} className="mt-0.5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Work (s)</label>
              <Input type="number" value={form.work_seconds} onChange={(e) => setForm({ ...form, work_seconds: e.target.value })} placeholder="Tabata work" className="mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Rest (s)</label>
              <Input type="number" value={form.rest_seconds} onChange={(e) => setForm({ ...form, rest_seconds: e.target.value })} placeholder="Tabata rest" className="mt-0.5" />
            </div>
          </div>
          <Button onClick={handleSave} size="sm" className="w-full rounded-lg bg-brand text-brand-foreground hover:bg-brand/90">Save block</Button>
        </div>
      )}

      <div className="p-3 space-y-2">
        <Droppable droppableId={block.block_id} type="exercise">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
              {exercises.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-3">No exercises in this block.</p>
              )}
              {exercises.map((be, index) => {
                const isRest = be.step_type === 'rest';
                const sets = setsByBlockExercise[be.block_exercise_id] || [];
                const setCount = sets.length || 1;
                const reps = sets[0]?.target_reps?.toString() || be.prescription_value || '';
                return (
                  <Draggable key={be.block_exercise_id} draggableId={be.block_exercise_id} index={index}>
                    {(p) => (
                      <div ref={p.innerRef} {...p.draggableProps} className="flex items-center gap-2 rounded-xl border border-border p-3 bg-card">
                        <span {...p.dragHandleProps} className="cursor-grab text-muted-foreground touch-none shrink-0">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{isRest ? 'Rest' : be.exercise_title_raw}</p>
                          <p className="text-xs text-muted-foreground">
                            {isRest ? be.prescription_value : `${setCount} ${setCount === 1 ? 'set' : 'sets'} × ${reps}${be.load_value ? ` · ${be.load_value}` : ''}`}
                          </p>
                        </div>
                        <IconButton onClick={() => onEditExercise(be)} icon={Pencil} />
                        <button onClick={() => onDeleteExercise(be)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
        <button onClick={onAddExercise} className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:border-foreground/20 hover:text-foreground flex items-center justify-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add exercise
        </button>
      </div>
    </div>
  );
}