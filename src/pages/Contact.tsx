import { useState } from 'react';
import { MobileViewport } from '@/components/MobileViewport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Clock, 
  Send,
  MessageSquare,
  User,
  Building
} from 'lucide-react';
import { toast } from 'sonner';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    subject: '',
    message: '',
    service: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    setTimeout(() => {
      toast.success('Message sent successfully! We\'ll respond within 24 hours.');
      setFormData({
        name: '',
        email: '',
        phone: '',
        company: '',
        subject: '',
        message: '',
        service: ''
      });
      setIsSubmitting(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      
      <main className="pt-20 sm:pt-24">
        {/* Hero Section */}
        <section className="py-12 sm:py-16 md:py-20 px-4 max-w-6xl mx-auto responsive-container">
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-primary neon-text responsive-text-5xl">
              ./contact_us
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg">
              Ready to secure your digital future? Let's discuss your cybersecurity and development needs.
            </p>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <Card className="p-6 mobile-card">
              <h2 className="text-2xl font-bold text-primary mb-6 flex items-center">
                <MessageSquare className="h-6 w-6 mr-2" />
                Send us a message
              </h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      <User className="h-4 w-4 inline mr-1" />
                      Name *
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      required
                      className="bg-background/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      <Mail className="h-4 w-4 inline mr-1" />
                      Email *
                    </label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      required
                      className="bg-background/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      <Phone className="h-4 w-4 inline mr-1" />
                      Phone
                    </label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      className="bg-background/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      <Building className="h-4 w-4 inline mr-1" />
                      Company
                    </label>
                    <Input
                      value={formData.company}
                      onChange={(e) => handleInputChange('company', e.target.value)}
                      className="bg-background/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Service Interest
                  </label>
                  <select
                    value={formData.service}
                    onChange={(e) => handleInputChange('service', e.target.value)}
                    className="w-full p-3 bg-background/50 border border-input rounded-md text-foreground"
                  >
                    <option value="">Select a service</option>
                    <option value="cybersecurity">Cybersecurity</option>
                    <option value="web-development">Web Development</option>
                    <option value="mobile-development">Mobile Development</option>
                    <option value="ai-solutions">AI Solutions</option>
                    <option value="consulting">Consulting</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Subject *
                  </label>
                  <Input
                    value={formData.subject}
                    onChange={(e) => handleInputChange('subject', e.target.value)}
                    required
                    className="bg-background/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-2">
                    Message *
                  </label>
                  <Textarea
                    value={formData.message}
                    onChange={(e) => handleInputChange('message', e.target.value)}
                    required
                    rows={5}
                    className="bg-background/50 resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {isSubmitting ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            </Card>

            {/* Contact Information */}
            <div className="space-y-6">
              <Card className="p-6 mobile-card">
                <h2 className="text-2xl font-bold text-primary mb-6">Get in Touch</h2>
                
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Mail className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <p className="font-medium">Email</p>
                      <p className="text-muted-foreground">Sunnybai73362@gmail.com</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Phone className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <p className="font-medium">Phone (WhatsApp)</p>
                      <p className="text-muted-foreground">+966575158062</p>
                      <p className="text-muted-foreground">+923499170421</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <MapPin className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <p className="font-medium">Address</p>
                      <p className="text-muted-foreground">
                        Al Jubail, 35514<br />
                        Kingdom of Saudi Arabia
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Clock className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <p className="font-medium">Business Hours</p>
                      <p className="text-muted-foreground">
                        Monday - Friday: 9:00 AM - 6:00 PM EST<br />
                        Weekend Support: Emergency only
                      </p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-6 mobile-card">
                <h3 className="text-xl font-bold text-primary mb-4">Why Choose Eternyx?</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                    24/7 security monitoring and support
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                    Expert team with 10+ years experience
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                    Cutting-edge AI-powered solutions
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                    Compliance with industry standards
                  </li>
                  <li className="flex items-center">
                    <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                    Custom solutions for your needs
                  </li>
                </ul>
              </Card>

              <Card className="p-6 mobile-card bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20">
                <h3 className="text-xl font-bold text-primary mb-4">Emergency Response</h3>
                <p className="text-muted-foreground mb-4">
                  Experiencing a security breach? Our rapid response team is available 24/7 for critical incidents.
                </p>
                <Button 
                  className="w-full bg-red-500 hover:bg-red-600 text-white"
                  onClick={() => window.location.href = 'tel:+966575158062'}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Emergency Hotline
                </Button>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}