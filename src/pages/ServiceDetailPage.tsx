import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { services } from '@/data/services';
import { TerminalWindow } from '@/components/TerminalWindow';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft, CheckCircle, Zap } from 'lucide-react';
import { serviceArticles } from '@/data/serviceArticles';

const ServiceDetailPage: React.FC = () => {
  const { serviceId } = useParams<{ serviceId: string }>();
  const service = services.find(s => s.id === serviceId);
  const article = serviceArticles[serviceId || ''];

  if (!service || !article) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="container mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center"
      >
        <TerminalWindow title="ERROR_404_SERVICE_NOT_FOUND" className="mb-10">
          <div className="space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto animate-pulse" />
            <div className="text-destructive text-2xl font-extrabold">
              SERVICE NOT FOUND
            </div>
            <p className="text-lg text-muted-foreground font-mono">
              // The requested service ID "{serviceId}" does not exist in the ETERNYX database.
            </p>
            <Link to="/services">
              <Button variant="outline" className="mt-6">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Return to Services
              </Button>
            </Link>
          </div>
        </TerminalWindow>
      </motion.div>
    );
  }

  const ServiceIcon = service.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-12 px-4 sm:px-6 lg:px-8 max-w-5xl"
    >
      {/* Header */}
      <div className="mb-8">
        <Link to="/services">
          <Button variant="ghost" className="mb-4 hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Services
          </Button>
        </Link>
        <TerminalWindow title={`SERVICE_PROTOCOL_${service.id.toUpperCase().replace(/-/g, '_')}.DAT`} className="mb-6">
          <div className="space-y-3 text-center">
            <div className={`text-3xl font-extrabold flex items-center justify-center ${service.color}`}>
              <ServiceIcon className="inline mr-3 h-10 w-10 animate-pulse" />
              {service.title.toUpperCase()}
            </div>
            <p className="text-xl text-muted-foreground font-mono">
              // {service.subtitle}
            </p>
          </div>
        </TerminalWindow>
      </div>

      {/* Article Content */}
      <div className="cyber-card p-8 mb-8 prose prose-invert prose-cyan max-w-none">
        <h2 className="text-2xl font-bold text-primary mb-4">{article.overview.title}</h2>
        <p className="text-muted-foreground mb-6">{article.overview.content}</p>

        <h2 className="text-2xl font-bold text-primary mb-4">{article.coreServices.title}</h2>
        <p className="text-muted-foreground mb-4">{article.coreServices.intro}</p>
        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse border border-border">
            <thead>
              <tr className="bg-primary/10">
                <th className="border border-border p-3 text-left text-primary">Service Component</th>
                <th className="border border-border p-3 text-left text-primary">Description</th>
                <th className="border border-border p-3 text-left text-primary">Technology Focus</th>
              </tr>
            </thead>
            <tbody>
              {article.coreServices.components.map((component, index) => (
                <tr key={index} className="hover:bg-primary/5 transition-colors">
                  <td className="border border-border p-3 font-semibold text-foreground">{component.name}</td>
                  <td className="border border-border p-3 text-muted-foreground">{component.description}</td>
                  <td className="border border-border p-3 text-muted-foreground">{component.technology}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-gradient-to-r from-primary/20 to-secondary/20 p-6 rounded-lg border-2 border-primary/50 mb-6">
          <h2 className="text-2xl font-bold text-primary mb-4 flex items-center">
            <Zap className="w-6 h-6 mr-2 animate-pulse" />
            {article.godMode.title}
          </h2>
          <p className="text-foreground mb-4 text-lg font-semibold">{article.godMode.description}</p>
          
          <h3 className="text-xl font-bold text-primary mb-3">Key Features:</h3>
          <ul className="space-y-3 mb-4">
            {article.godMode.features.map((feature, index) => (
              <li key={index} className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">{feature.name}:</span>
                  <span className="text-muted-foreground ml-1">{feature.description}</span>
                </div>
              </li>
            ))}
          </ul>

          <h3 className="text-xl font-bold text-primary mb-3">Technical Implementation:</h3>
          <p className="text-muted-foreground">{article.godMode.implementation}</p>
        </div>

        <div className="border-t border-border pt-6">
          <h2 className="text-2xl font-bold text-primary mb-4">Conclusion</h2>
          <p className="text-muted-foreground">{article.conclusion}</p>
        </div>
      </div>

      {/* Call to Action */}
      <div className="text-center">
        <Button className="neon-border-lg bg-primary hover:bg-primary/90 text-lg font-bold min-h-[52px] shadow-primary/50">
          Request a Consultation
        </Button>
      </div>
    </motion.div>
  );
};

export default ServiceDetailPage;
