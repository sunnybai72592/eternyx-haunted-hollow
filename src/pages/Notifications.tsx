import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/store/authStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean | null;
  action_url: string | null;
  created_at: string;
};

export default function Notifications() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('notifications')
      .select('id,title,message,type,is_read,action_url,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) {
      console.error('Notification inbox load failed:', error);
      toast.error('Could not load notifications. Please try again.');
    } else {
      setItems((data ?? []) as NotificationRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/auth', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user) void loadNotifications();
  }, [user?.id, loadNotifications]);

  const markRead = async (id: string) => {
    setUpdating(id);
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) {
      toast.error('Could not update this notification.');
    } else {
      setItems((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
    }
    setUpdating(null);
  };

  const markAllRead = async () => {
    setUpdating('all');
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user?.id ?? '').eq('is_read', false);
    if (error) {
      toast.error('Could not mark notifications as read.');
    } else {
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    }
    setUpdating(null);
  };

  const openNotification = async (item: NotificationRow) => {
    if (!item.is_read) await markRead(item.id);
    if (item.action_url?.startsWith('/') && !item.action_url.startsWith('//')) navigate(item.action_url);
  };

  if (isLoading || (!isAuthenticated && !user)) return <main className="mx-auto flex min-h-[50vh] items-center justify-center px-4 text-muted-foreground">Loading your account…</main>;

  const unread = items.filter((item) => !item.is_read).length;
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 pb-20 pt-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div><div className="mb-2 flex items-center gap-2 text-primary"><Bell className="h-5 w-5" /><span className="text-sm font-medium">ACCOUNT INBOX</span></div><h1 className="text-3xl font-bold">Notifications</h1><p className="mt-2 text-muted-foreground">Updates and messages sent to your ETERNYX account.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => void loadNotifications()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button variant="outline" onClick={() => void markAllRead()} disabled={!unread || updating !== null}><CheckCheck className="mr-2 h-4 w-4" />Mark all read</Button></div>
      </header>
      {loading ? <Card className="p-8 text-center text-muted-foreground">Loading notifications…</Card> : items.length === 0 ? (
        <Card className="p-10 text-center"><Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><h2 className="text-xl font-semibold">You're all caught up</h2><p className="mt-2 text-sm text-muted-foreground">New account updates will appear here when they are sent.</p><Button asChild variant="outline" className="mt-5"><Link to="/account">Back to account overview</Link></Button></Card>
      ) : (
        <div className="space-y-3">{items.map((item) => (
          <Card key={item.id} className={`p-5 transition-colors ${item.is_read ? 'opacity-80' : 'border-primary/40 bg-primary/[0.03]'}`}>
            <div className="flex items-start gap-3"><div className="mt-1 rounded-full bg-primary/10 p-2"><Bell className="h-4 w-4 text-primary" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{item.title}</h2>{!item.is_read && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">New</span>}</div><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.message}</p><p className="mt-3 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p></div></div>
            <div className="mt-4 flex flex-wrap gap-2">{item.action_url?.startsWith('/') && !item.action_url.startsWith('//') && <Button variant="outline" size="sm" onClick={() => void openNotification(item)}>Open update <ExternalLink className="ml-2 h-3.5 w-3.5" /></Button>}{!item.is_read && <Button variant="ghost" size="sm" disabled={updating === item.id} onClick={() => void markRead(item.id)}>Mark as read</Button>}</div>
          </Card>
        ))}</div>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">{unread} unread · Showing up to 100 recent notifications</p>
    </main>
  );
}
