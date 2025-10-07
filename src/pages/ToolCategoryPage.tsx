import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getCategoryById, ToolCategory } from '@/data/tools';
import { TerminalWindow } from '@/components/TerminalWindow';
import { SimpleToolCard } from '@/components/SimpleToolCard';
import { Zap, AlertTriangle } from 'lucide-react';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const ToolCategoryPage: React.FC = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const category: ToolCategory | undefined = getCategoryById(categoryId || '');

  if (!category) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="container mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center"
      >
        <TerminalWindow title="ERROR_404_CATEGORY_NOT_FOUND" className="mb-10">
          <div className="space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto animate-pulse" />
            <div className="text-destructive text-2xl font-extrabold">
              CATEGORY NOT FOUND
            </div>
            <p className="text-lg text-muted-foreground font-mono">
              // The requested tool category ID "{categoryId}" does not exist in the ETERNYX database.
            </p>
          </div>
        </TerminalWindow>
      </motion.div>
    );
  }

  const CategoryIcon = category.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      className="container mx-auto py-12 px-4 sm:px-6 lg:px-8"
    >
      <TerminalWindow title={`${category.name.toUpperCase().replace(/\s/g, '_')}_CATALOG.DAT`} className="mb-10">
        <div className="space-y-2 text-center">
          <div className="text-cyber-green text-3xl font-extrabold flex items-center justify-center">
            <CategoryIcon className="inline mr-3 h-8 w-8 animate-pulse" />
            {category.name.toUpperCase()}
          </div>
          <p className="text-lg text-muted-foreground font-mono">
            // {category.description}
          </p>
        </div>
      </TerminalWindow>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
      >
        {category.tools.map((tool) => (
          <SimpleToolCard key={tool.id} tool={tool} />
        ))}
      </motion.div>
      
      <div className="mt-12 text-center">
        <p className="text-muted-foreground/70 font-mono">
          [END_OF_CATEGORY_CATALOG] Total Tools: {category.tools.length}
        </p>
      </div>
    </motion.div>
  );
};

export default ToolCategoryPage;
