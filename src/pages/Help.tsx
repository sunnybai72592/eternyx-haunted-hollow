import { useEffect } from 'react';
import { TerminalWindow } from '@/components/TerminalWindow';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BookOpen, LifeBuoy, Mail, MessageSquare } from 'lucide-react';

const Help = () => {
  useEffect(() => {
    document.title = 'Help & Support | ETERNYX';
  }, []);

  return (
    <main className="min-h-screen bg-background">
      <head>
        <title>Help & Support | ETERNYX</title>
        <meta name="description" content="Get help with ETERNYX. FAQs, contact, and support resources." />
        <link rel="canonical" href={`${window.location.origin}/help`} />
      </head>

      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6 flex items-center gap-3">
          <LifeBuoy className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Help & Support</h1>
        </div>
      </header>

      <section className="container mx-auto px-4 py-8 grid gap-6 md:grid-cols-2">
        <Card className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Frequently Asked</h2>
          </div>
          <TerminalWindow title="faq.md">
            <ul className="text-sm space-y-2">
              <li><span className="text-primary">Q:</span> How do I access the dashboard?<br/><span className="text-muted-foreground">A:</span> Sign in and click Access Dashboard from the hero section.</li>
              <li><span className="text-primary">Q:</span> Why did signup say network error?<br/><span className="text-muted-foreground">A:</span> It usually means you weren’t authenticated yet. Try again and ensure email confirmation if required.</li>
            </ul>
          </TerminalWindow>
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Contact</h2>
          </div>
          <p className="text-sm text-muted-foreground">Need assistance? We respond within 24 hours.</p>
          <div className="flex gap-3">
            <Button asChild><a href="#contact"><Mail className="h-4 w-4 mr-2"/>Send a message</a></Button>
            <Button variant="outline" asChild><a href="/">Back to Home</a></Button>
          </div>
        </Card>
      </section>
    </main>
  );
};

export default Help;
