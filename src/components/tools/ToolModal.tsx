import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToolExecutor } from './ToolExecutor';
import { CyberTool } from '@/data/cybersecurityTools';

interface ToolModalProps {
  tool: CyberTool | null;
  isOpen: boolean;
  onClose: () => void;
  onExecutionComplete?: (result: any) => void;
}

export const ToolModal: React.FC<ToolModalProps> = ({
  tool,
  isOpen,
  onClose,
  onExecutionComplete
}) => {
  if (!tool) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2 text-green-400">
            {tool.icon}
            <span>{tool.name}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-300 mb-4">{tool.description}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-2">Features</h4>
                <ul className="space-y-1">
                  {tool.features.map((feature, index) => (
                    <li key={index} className="text-sm text-gray-300 flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-gray-400">Difficulty: </span>
                  <span className={`text-sm font-semibold ${
                    tool.difficulty === 'beginner' ? 'text-green-400' :
                    tool.difficulty === 'intermediate' ? 'text-yellow-400' :
                    tool.difficulty === 'advanced' ? 'text-orange-400' :
                    'text-red-400'
                  }`}>
                    {tool.difficulty.charAt(0).toUpperCase() + tool.difficulty.slice(1)}
                  </span>
                </div>
                
                <div>
                  <span className="text-sm text-gray-400">Execution Time: </span>
                  <span className="text-sm text-white">{tool.executionTime}</span>
                </div>
                
                <div>
                  <span className="text-sm text-gray-400">Tier: </span>
                  <span className={`text-sm font-semibold ${
                    tool.tier === 'free' ? 'text-green-400' :
                    tool.tier === 'premium' ? 'text-blue-400' :
                    'text-purple-400'
                  }`}>
                    {tool.tier.charAt(0).toUpperCase() + tool.tier.slice(1)}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {tool.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-md"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <ToolExecutor
            toolId={tool.id}
            toolName={tool.name}
            onExecutionComplete={(result) => {
              onExecutionComplete?.(result);
              // Keep modal open to show results
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

