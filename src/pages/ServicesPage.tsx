import { services, Service } from '@/data/services';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, Zap } from 'lucide-react';
import { TerminalWindow } from '@/components/TerminalWindow';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 15,
    },
  },
};

const ServiceCard: React.FC<{ service: Service }> = ({ service }) => {
  const Icon = service.icon;
  return (
    <motion.div variants={itemVariants}>
      <Link to={service.link} className="block h-full">
        <Card 
          className={`cyber-card h-full p-6 transition-all duration-500 border-2 ${service.color.replace('text', 'border')} hover:shadow-2xl hover:shadow-primary/50 hover:scale-[1.02] relative overflow-hidden group`}
        >
          {/* Background Glitch Effect on Hover */}
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-10 transition-opacity duration-300 z-0"></div>
          
          <CardHeader className="p-0 mb-4 relative z-10">
            <div className="flex items-center justify-between">
              <Icon className={`w-10 h-10 ${service.color} transition-transform duration-500 group-hover:rotate-12`} />
              <ArrowRight className={`w-6 h-6 text-muted-foreground transition-transform duration-500 group-hover:translate-x-1 ${service.color.replace('text', 'group-hover:text')}`} />
            </div>
            <CardTitle className="text-2xl font-bold mt-3 text-foreground group-hover:text-primary transition-colors duration-300">
              {service.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground font-mono">{service.subtitle}</p>
          </CardHeader>
          <CardContent className="p-0 relative z-10">
            <p className="text-sm text-muted-foreground/80">
              {service.description}
            </p>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
};

const ServicesPage: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-12 px-4 sm:px-6 lg:px-8"
    >
      <TerminalWindow title="ETERNYX_SERVICES_CATALOG.DAT" className="mb-10">
        <div className="space-y-2 text-center">
          <div className="text-cyber-green text-3xl font-extrabold flex items-center justify-center">
            <Zap className="inline mr-3 h-8 w-8 animate-pulse" />
            CORE CAPABILITIES
          </div>
          <p className="text-lg text-muted-foreground font-mono">
            // Accessing the full spectrum of ETERNYX operational services.
          </p>
        </div>
      </TerminalWindow>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
      >
        {services.map((service) => (
          <ServiceCard key={service.id} service={service} />
        ))}
      </motion.div>
      
      <div className="mt-12 text-center">
        <p className="text-muted-foreground/70 font-mono">
          [END_OF_CATALOG] Contact us for custom operational deployments.
        </p>
      </div>
    </motion.div>
  );
};

export default ServicesPage;
