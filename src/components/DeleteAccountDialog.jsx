import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

// Supabase's functions client puts the function's JSON body in error.context.
async function errorMessage(error) {
  try { return (await error.context.json()).error || error.message; } catch { return error.message; }
}

export default function DeleteAccountDialog({ open, onOpenChange }) {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const matches = email.trim().toLowerCase() === (user?.email || '').toLowerCase() && !!user?.email;

  const close = (next) => {
    if (deleting) return;
    if (!next) setEmail('');
    onOpenChange(next);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.functions.invoke('deleteAccount', { body: { confirm_email: email.trim() } });
    if (error) {
      setDeleting(false);
      toast({ title: 'Could not delete your account', description: await errorMessage(error), variant: 'destructive' });
      return;
    }
    // The auth user is gone, so only the local session needs clearing.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.href = '/login';
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently deletes your profile, plans, workout history and progress, and cancels any subscription
            immediately, with no refund. It cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-confirm-email" className="text-xs">Type your email to confirm: {user?.email}</Label>
          <Input
            id="delete-confirm-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={user?.email}
            className="h-11 rounded-lg"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => close(false)} disabled={deleting} className="rounded-lg">Cancel</Button>
          <Button onClick={confirmDelete} disabled={!matches || deleting} className="rounded-lg bg-rose-600 text-white hover:bg-rose-700">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete my account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
