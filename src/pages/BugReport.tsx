import { useState, type FormEvent } from 'react';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { AlertTriangle, Bug, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type Severity = 'low' | 'medium' | 'high' | 'critical';

const initialForm = {
  title: '',
  description: '',
  severity: 'medium' as Severity,
};

export default function BugReport() {
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const title = form.title.trim();
    const description = form.description.trim();

    if (title.length < 5 || title.length > 160) {
      toast.error('The title must be between 5 and 160 characters.');
      return;
    }

    if (description.length < 20 || description.length > 5000) {
      toast.error('The description must be between 20 and 5,000 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      if (!user) {
        toast.error('Please sign in to submit a bug report.');
        return;
      }

      const { error } = await supabase.from('bug_reports').insert({
        user_id: user.id,
        title,
        description,
        severity: form.severity,
      });

      if (error) throw error;

      toast.success('Bug report received. Thank you for helping improve ETERNYX.');
      setForm(initialForm);
    } catch (error) {
      console.error('Bug report submission failed:', error);
      toast.error('We could not submit your report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-24">
        <header className="mx-auto mb-10 max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary">
            <Bug className="h-4 w-4" />
            ETERNYX · Quality & reliability
          </div>
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-primary sm:text-4xl md:text-5xl">
            Report a bug
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            Found something that is not working as expected? Tell us what happened so we can investigate and improve the platform.
          </p>
        </header>

        <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Card className="p-5 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="bug-title" className="text-sm font-medium">
                  Bug title <span className="text-destructive">*</span>
                </label>
                <Input
                  id="bug-title"
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g. Dashboard navigation does not open"
                  maxLength={160}
                  minLength={5}
                  required
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">{form.title.length}/160 characters</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="bug-description" className="text-sm font-medium">
                  What happened? <span className="text-destructive">*</span>
                </label>
                <Textarea
                  id="bug-description"
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Include the steps to reproduce the issue, what you expected to happen, and what happened instead."
                  rows={8}
                  maxLength={5000}
                  minLength={20}
                  required
                  disabled={isSubmitting}
                  className="resize-y"
                />
                <p className="text-xs text-muted-foreground">{form.description.length}/5,000 characters · Minimum 20</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="bug-severity" className="text-sm font-medium">Severity</label>
                <select
                  id="bug-severity"
                  value={form.severity}
                  onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value as Severity }))}
                  disabled={isSubmitting}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="low">Low · Minor inconvenience</option>
                  <option value="medium">Medium · Feature affected</option>
                  <option value="high">High · Important functionality broken</option>
                  <option value="critical">Critical · Major outage or data risk</option>
                </select>
              </div>

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  'Submitting report…'
                ) : (
                  <><Send className="mr-2 h-4 w-4" /> Submit bug report</>
                )}
              </Button>
            </form>
          </Card>

          <aside className="space-y-4">
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2 text-primary">
                <ShieldCheck className="h-5 w-5" />
                <h2 className="font-semibold">Before you submit</h2>
              </div>
              <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                <li>Describe the steps that caused the issue.</li>
                <li>Include the page or tool where it happened.</li>
                <li>Never include passwords, API keys, access tokens, or private data.</li>
                <li>Choose severity based on the impact you experienced.</li>
              </ul>
            </Card>

            <Card className="border-primary/20 bg-primary/5 p-5">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <AlertTriangle className="h-5 w-5" />
                <h2 className="font-semibold">Sign-in required</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Bug reports are linked to your ETERNYX account so our team can investigate them responsibly. Sign in before submitting.
              </p>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
