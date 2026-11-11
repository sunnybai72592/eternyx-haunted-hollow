import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Search, ShieldCheck, UserRound, Users, UserCheck, UserX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import AdminWorkspaceNav from '@/components/admin/AdminWorkspaceNav';

type AdminUserRow = {
  profile_id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  location: string | null;
  created_at: string;
  access_level: string;
  is_profile_public: boolean | null;
  total_count: number;
};

const PAGE_SIZE = 24;

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const displayName = (user: AdminUserRow) => user.full_name?.trim() || user.username?.trim() || 'Unnamed member';

export default function AdminUsers() {
  const { user, isLoading: authLoading } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const verify = async () => {
      if (authLoading) return;
      if (!user) {
        if (active) { setIsAdmin(false); setChecking(false); }
        return;
      }
      const { data, error: accessError } = await supabase.rpc('is_admin');
      if (!active) return;
      setIsAdmin(!accessError && data === true);
      setChecking(false);
    };
    void verify();
    return () => { active = false; };
  }, [authLoading, user]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.rpc('admin_list_users', {
      p_search: search.trim() || null,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (queryError) {
      setRows([]);
      setTotalCount(0);
      setError(queryError.message || 'The member directory could not be loaded.');
    } else {
      const result = (data ?? []) as AdminUserRow[];
      setRows(result);
      setTotalCount(result[0]?.total_count ?? 0);
    }
    setLoading(false);
  }, [isAdmin, page, search]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setTimeout(() => { void loadUsers(); }, 250);
    return () => window.clearTimeout(timer);
  }, [isAdmin, loadUsers]);

  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };

  if (authLoading || checking) {
    return <main className="mx-auto flex min-h-[55vh] items-center justify-center px-4 text-sm text-slate-400">Verifying administrator access…</main>;
  }

  if (!user || !isAdmin) {
    return <main className="mx-auto max-w-3xl px-4 py-16"><Card className="border-white/10 bg-[#0a1221] p-8 text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-slate-400" /><h1 className="text-2xl font-semibold text-white">{user ? 'Administrator access only' : 'Sign in required'}</h1><p className="mt-2 text-sm text-slate-400">This workspace is restricted to authorized ETERNYX administrators.</p></Card></main>;
  }

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 -z-10 h-72 rounded-full bg-cyan-400/[0.06] blur-[100px]" />
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100"><Users className="h-3.5 w-3.5" /> ETERNYX / Member directory</div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">User management</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">A secure, read-only view of member profiles. Account credentials and private contact details are not exposed here.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 py-3">
          <Users className="h-4 w-4 text-cyan-200" />
          <div><p className="text-xl font-semibold tabular-nums text-white">{totalCount.toLocaleString()}</p><p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Members found</p></div>
        </div>
      </header>

      <AdminWorkspaceNav />

      <section className="mb-6 rounded-2xl border border-white/[0.09] bg-[#0a1221]/85 p-4 sm:p-5">
        <label htmlFor="admin-user-search" className="mb-2 block text-xs font-semibold text-slate-300">Find a member</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input id="admin-user-search" value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Search name, username, job title, location or user ID…" className="h-11 border-white/10 bg-black/20 pl-10 text-white placeholder:text-slate-600" />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Search is limited to public-facing profile fields and the account identifier.</p>
      </section>

      {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] p-4 text-sm text-rose-100"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {loading && rows.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading member directory…</div>
      ) : rows.length === 0 ? (
        <Card className="border-white/[0.09] bg-[#0a1221]/85 p-10 text-center">
          <UserRound className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <h2 className="text-lg font-semibold text-white">{error ? 'Directory unavailable' : search ? 'No matching members' : 'No members found'}</h2>
          <p className="mt-2 text-sm text-slate-500">{error ? 'Check the database migration and administrator permissions, then retry.' : 'Try a different search term.'}</p>
          {error && <Button variant="outline" onClick={() => void loadUsers()} className="mt-5 border-white/15 text-slate-200">Retry</Button>}
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Showing <span className="font-semibold text-slate-300">{(page * PAGE_SIZE) + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)}</span> of {totalCount.toLocaleString()} members</p>
            {loading && <span className="text-xs text-cyan-200">Refreshing…</span>}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((member) => (
              <Card key={member.profile_id} className="border-white/[0.09] bg-[#0a1221]/90 p-5 transition-colors hover:border-cyan-200/20">
                <div className="flex items-start gap-3">
                  {member.avatar_url ? <img src={member.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-xl border border-white/10 object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400"><UserRound className="h-5 w-5" /></div>}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-white">{displayName(member)}</h2>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{member.username ? `@${member.username}` : 'No username set'}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-slate-600" title={member.user_id}>ID · {member.user_id.slice(0, 8)}…</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${member.is_profile_public ? 'border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-200' : 'border-slate-300/15 bg-slate-300/[0.05] text-slate-300'}`}>
                    {member.is_profile_public ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}{member.is_profile_public ? 'Public' : 'Private'}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-4">
                  <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Role / title</p><p className="mt-1 truncate text-xs text-slate-300">{member.job_title || 'Not provided'}</p></div>
                  <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Plan tier</p><p className="mt-1 capitalize text-xs text-slate-300">{member.access_level || 'basic'}</p></div>
                  <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Location</p><p className="mt-1 truncate text-xs text-slate-300">{member.location || 'Not provided'}</p></div>
                  <div className="min-w-0"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Joined</p><p className="mt-1 text-xs text-slate-300">{formatDate(member.created_at)}</p></div>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-5">
            <p className="text-xs text-slate-500">Page {page + 1} of {pageCount}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))} className="border-white/15 text-slate-200"><ChevronLeft className="mr-1 h-4 w-4" />Previous</Button>
              <Button variant="outline" size="sm" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((current) => current + 1)} className="border-white/15 text-slate-200">Next<ChevronRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </div>
        </>
      )}
      <p className="mt-8 text-center text-[11px] leading-5 text-slate-600">Read-only first release. Suspension, deletion, password resets and role changes require separate audited server-side workflows.</p>
    </main>
  );
}
