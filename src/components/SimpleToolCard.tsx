import { Tool } from '@/data/tools';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';

interface SimpleToolCardProps {
  tool: Tool;
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
};

export const SimpleToolCard: React.FC<SimpleToolCardProps> = ({ tool }) => {
  const Icon = tool.icon;
  
  return (
    <motion.div variants={itemVariants}>
      <Link to={tool.route} className="block h-full">
        <Card 
          className={`cyber-card h-full p-6 transition-all duration-500 border-2 ${tool.color.replace('text', 'border')} hover:shadow-2xl hover:shadow-primary/50 hover:scale-[1.02] relative overflow-hidden group`}
        >
          {/* Glitch Effect on Hover */}
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-10 transition-opacity duration-300 z-0"></div>
          
          <CardHeader className="p-0 mb-4 relative z-10">
            <div className="flex items-center justify-between">
              <Icon className={`w-8 h-8 ${tool.color} transition-transform duration-500 group-hover:rotate-6`} />
              <ArrowRight className={`w-5 h-5 text-muted-foreground transition-transform duration-500 group-hover:translate-x-1 ${tool.color.replace('text', 'group-hover:text')}`} />
            </div>
            <CardTitle className="text-xl font-bold mt-3 text-foreground group-hover:text-primary transition-colors duration-300 font-mono">
              {tool.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 relative z-10">
            <p className="text-sm text-muted-foreground/80">
              {tool.description}
            </p>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
};
