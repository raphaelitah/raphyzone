import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

const KIND_LABEL = {
  reel_workout: 'Reel · Workout decided',
  reel_travel: 'Reel · Travel training',
  carousel_humour: 'Carousel · Decision fatigue',
  carousel_smarter: 'Carousel · Train smarter',
  single_split: 'Image · Split to save',
  single_workout: 'Image · Workout card',
  carousel_workout: 'Carousel · Workout breakdown',
  single_equipment: 'Image · Gear-limited workout',
  carousel_quiz: 'Carousel · Which workout are you?',
  carousel_format: 'Carousel · Format explainer',
  carousel_myth: 'Carousel · Myth vs truth',
  carousel_exercise: 'Carousel · One pattern, any gear',
};

const STATUS_STYLE = {
  draft: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
  killed: 'bg-rose-100 text-rose-800',
  redo: 'bg-sky-100 text-sky-800',
  published: 'bg-violet-100 text-violet-800',
};

const isVideo = (url) => /\.(mp4|mov)$/i.test(url);

function PostCard({ post, onChange }) {
  const [caption, setCaption] = useState(post.caption || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const locked = post.status === 'published';

  const update = async (patch) => {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('social_posts')
      .update({ ...patch, updated_date: new Date().toISOString() })
      .eq('id', post.id);
    setBusy(false);
    if (err) setError(err.message);
    else onChange();
  };

  const redo = () => {
    const note = window.prompt('What should change? (optional)') ?? null;
    if (note === null) return;
    update({ status: 'redo', redo_note: note || null });
  };

  const slides = Array.isArray(post.slides) ? post.slides : [];

  return (
    <Card className="rounded-2xl border-border p-4 space-y-3" data-testid={`social-post-${post.slot}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{post.scheduled_date} · {KIND_LABEL[post.kind] || post.kind}</p>
          <p className="font-semibold leading-snug">{post.hook}</p>
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full capitalize', STATUS_STYLE[post.status])}>{post.status}</span>
      </div>

      {post.asset_urls?.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {post.asset_urls.map((url) =>
            isVideo(url) ? (
              <video key={url} src={url} controls playsInline className="h-64 rounded-lg" />
            ) : (
              <img key={url} src={url} alt="" loading="lazy" className="h-64 rounded-lg" />
            ),
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {post.render_status === 'failed' ? `Render failed: ${post.render_error}` : 'Not rendered yet'}
        </p>
      )}

      {slides.length > 0 && (
        <ol className="text-sm space-y-1 list-decimal pl-5 text-muted-foreground">
          {slides.map((s, i) => (
            <li key={i}>{[s.title, s.body].filter(Boolean).join(' — ')}</li>
          ))}
        </ol>
      )}

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => caption !== (post.caption || '') && update({ caption })}
        disabled={locked}
        rows={5}
        className="w-full text-sm rounded-lg border border-border bg-background p-2"
        aria-label="Caption"
      />
      {post.hashtags?.length > 0 && (
        <p className="text-xs text-muted-foreground">{post.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ')}</p>
      )}
      {post.redo_note && post.status === 'redo' && (
        <p className="text-xs text-sky-700">Redo note: {post.redo_note}</p>
      )}
      {post.publish_error && <p className="text-xs text-rose-600">Publish error: {post.publish_error}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}

      {!locked && (
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" disabled={busy || post.status === 'approved' || post.render_status !== 'rendered'}
            onClick={() => update({ status: 'approved' })}>
            <Check className="h-4 w-4 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" disabled={busy || post.status === 'killed'} onClick={() => update({ status: 'killed' })}>
            <X className="h-4 w-4 mr-1" /> Kill
          </Button>
          <Button size="sm" variant="outline" disabled={busy || post.status === 'redo'} onClick={redo}>
            <RotateCcw className="h-4 w-4 mr-1" /> Redo
          </Button>
        </div>
      )}
    </Card>
  );
}

// Lifetime metrics by post format, from the newest snapshot of each post (see scripts/social/pull-metrics.mjs).
function PerformanceByFormat() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('social_weekly_metrics')
        .select('post_id, week_start, reach, likes, comments, saves, shares, profile_visits, raw, social_posts(kind)')
        .order('week_start', { ascending: false })
        .limit(500);
      const latest = new Map();
      for (const r of data || []) if (r.social_posts && !latest.has(r.post_id)) latest.set(r.post_id, r);
      const by = {};
      for (const r of latest.values()) {
        const a = (by[r.social_posts.kind] ||= { kind: r.social_posts.kind, n: 0, reach: 0, saves: 0, shares: 0, comments: 0, visits: 0, follows: 0 });
        a.n += 1;
        a.reach += r.reach || 0;
        a.saves += r.saves || 0;
        a.shares += r.shares || 0;
        a.comments += r.comments || 0;
        a.visits += r.profile_visits || 0;
        a.follows += r.raw?.follows || 0;
      }
      setRows(Object.values(by).sort((a, b) => b.follows - a.follows || b.reach - a.reach));
    })();
  }, []);
  if (rows === null) return null;
  return (
    <Card className="p-4 mb-4" data-testid="performance-by-format">
      <h2 className="text-sm font-semibold mb-2">Performance by format</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No metrics yet. The Thursday metrics job fills this in.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Format</th>
                <th className="pr-2 font-medium">Posts</th>
                <th className="pr-2 font-medium">Avg reach</th>
                <th className="pr-2 font-medium">Follows</th>
                <th className="pr-2 font-medium">Visits</th>
                <th className="pr-2 font-medium">Saves</th>
                <th className="font-medium">Shares</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.kind} className="border-t border-border">
                  <td className="py-1 pr-2">{KIND_LABEL[r.kind] || r.kind}</td>
                  <td className="pr-2">{r.n}</td>
                  <td className="pr-2">{Math.round(r.reach / r.n)}</td>
                  <td className="pr-2">{r.follows}</td>
                  <td className="pr-2">{r.visits}</td>
                  <td className="pr-2">{r.saves}</td>
                  <td>{r.shares}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default function AdminSocial() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [weeks, setWeeks] = useState([]);
  const [week, setWeek] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approvingAll, setApprovingAll] = useState(false);
  const [approveAllError, setApproveAllError] = useState(null);

  const load = useCallback(async (weekStart) => {
    let q = supabase.from('social_posts').select('*').order('week_start', { ascending: false }).order('slot');
    if (weekStart) q = q.eq('week_start', weekStart);
    else q = q.limit(70);
    const { data } = await q;
    return data || [];
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') { navigate('/'); return; }
    (async () => {
      const all = await load(null);
      const ws = [...new Set(all.map((p) => p.week_start))];
      setWeeks(ws);
      setWeek(ws[0] || null);
      setPosts(ws[0] ? all.filter((p) => p.week_start === ws[0]) : []);
      setLoading(false);
    })();
  }, [user, navigate, load]);

  const refresh = async (ws = week) => { if (ws) setPosts(await load(ws)); };

  const approvable = posts.filter((p) => p.status === 'draft' && p.render_status === 'rendered');

  const approveAll = async () => {
    if (!approvable.length) return;
    setApprovingAll(true);
    setApproveAllError(null);
    const { error: err } = await supabase
      .from('social_posts')
      .update({ status: 'approved', updated_date: new Date().toISOString() })
      .in('id', approvable.map((p) => p.id));
    setApprovingAll(false);
    if (err) setApproveAllError(err.message);
    else refresh();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-muted border-t-brand rounded-full animate-spin" /></div>;

  const counts = posts.reduce((acc, p) => ({ ...acc, [p.status]: (acc[p.status] || 0) + 1 }), {});

  return (
    <div className="px-5 pt-10 pb-24">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Instagram queue</h1>
      <PerformanceByFormat />
      {weeks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts yet. The Friday writer creates next week's drafts.</p>
      ) : (
        <>
          <select
            value={week || ''}
            onChange={(e) => { setWeek(e.target.value); refresh(e.target.value); }}
            className="mb-2 text-sm rounded-lg border border-border bg-background p-2"
            aria-label="Week"
          >
            {weeks.map((w) => <option key={w} value={w}>Week of {w}</option>)}
          </select>
          <p className="text-sm text-muted-foreground mb-4">
            {Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(' · ')}
          </p>
          <Button className="w-full mb-4" disabled={approvingAll || !approvable.length} onClick={approveAll}
            data-testid="approve-all">
            <Check className="h-4 w-4 mr-1" /> Approve All{approvable.length ? ` (${approvable.length})` : ''}
          </Button>
          {approveAllError && <p className="text-xs text-rose-600 mb-4">{approveAllError}</p>}
          <div className="space-y-4">
            {posts.map((p) => <PostCard key={p.id + p.updated_date} post={p} onChange={() => refresh()} />)}
          </div>
        </>
      )}
    </div>
  );
}
