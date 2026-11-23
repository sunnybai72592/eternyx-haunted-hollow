import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/integrations/supabase/client';
import {
  adminRequestPanels, buildRequestPanelLink, customerRequestPanels,
  type AdminRequestPanel, type ServicePanelMode,
} from '@/lib/serviceRequestPanels';

export default function ServiceRequestSectionLinks({
  requestId, ownerId, mode,
}: {
  requestId: string; ownerId: string; mode: ServicePanelMode;
}) {
  const navigate = useNavigate();
  const viewerId = useAuthStore((state) => state.user?.id ?? null);
  const viewerKey = mode + ':' + (viewerId ?? 'signed-out') + ':' + requestId;
  const currentKey = useRef(viewerKey);
  currentKey.current = viewerKey;
  const [panel, setPanel] = useState<AdminRequestPanel>('conversation');
  const [working, setWorking] = useState<'copy' | 'open' | null>(null);
  const [feedback, setFeedback] = useState('');
  const panels = mode === 'admin' ? adminRequestPanels : customerRequestPanels;

  useEffect(() => {
    setPanel('conversation');
    setWorking(null);
    setFeedback('');
  }, [viewerKey]);

  const verify = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || user.id !== viewerId || currentKey.current !== viewerKey) {
      throw new Error('The signed-in account changed');
    }
    if (mode === 'admin') {
      const { data: verifiedAdmin, error: roleError } = await supabase.rpc('is_admin');
      if (roleError || verifiedAdmin !== true) throw new Error('Administrator verification unavailable or denied');
    } else if (user.id !== ownerId) {
      throw new Error('Only the request owner can open its customer workspace');
    }
    if (currentKey.current !== viewerKey) throw new Error('The signed-in account changed');
  };

  const activate = async (kind: 'copy' | 'open') => {
    if (working || !viewerId || !panels.some((item) => item.key === panel)) return;
    const key = viewerKey;
    setWorking(kind);
    setFeedback('');
    try {
      await verify();
      if (currentKey.current !== key) return;
      const url = buildRequestPanelLink(window.location.origin, requestId, mode, panel);
      if (kind === 'copy') {
        await navigator.clipboard.writeText(url);
        if (currentKey.current === key) {
          setFeedback('Section link copied. Access still requires the authorized account.');
        }
      } else {
        const relative = new URL(url).pathname + new URL(url).search;
        if (currentKey.current === key) navigate(relative);
      }
    } catch {
      if (currentKey.current === key) setFeedback(
        kind === 'copy'
          ? 'Could not copy this section link. Verify access and clipboard permission.'
          : 'Could not verify access to the section. Sign in and retry.',
      );
    } finally {
      if (currentKey.current === key) setWorking(null);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border/70 bg-card/30 p-3" aria-label="Request section links">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label htmlFor={'service-panel-' + mode + '-' + requestId} className="mb-1 block text-xs font-medium">
            Open or share a request section
          </label>
          <select id={'service-panel-' + mode + '-' + requestId}
            value={panel} onChange={(event) => setPanel(event.target.value as AdminRequestPanel)}
            disabled={working !== null || !viewerId}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {panels.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={working !== null || !viewerId}
          onClick={() => void activate('open')}>
          <ExternalLink className="mr-2 h-4 w-4" />{working === 'open' ? 'Verifying…' : 'Open section'}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={working !== null || !viewerId}
          onClick={() => void activate('copy')}>
          <Link2 className="mr-2 h-4 w-4" />{working === 'copy' ? 'Verifying…' : 'Copy section link'}
        </Button>
      </div>
      {feedback && <p role="status" className="mt-2 text-xs text-muted-foreground">{feedback}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Links include a request reference and the chosen section; they do not grant permission to view it.
      </p>
    </div>
  );
}
