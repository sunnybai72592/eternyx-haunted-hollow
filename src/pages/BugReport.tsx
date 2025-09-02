import React from 'react';

const BugReport: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
      <h1 className="text-4xl font-bold text-cyber-cyan mb-6 animate-pulse">Bug Report System</h1>
      <p className="text-lg text-gray-400 mb-8 text-center max-w-2xl">
        Found a glitch in the matrix? Help us patch it up. Describe the anomaly below.
      </p>
      <div className="cyber-card p-8 w-full max-w-md">
        <form className="space-y-6">
          <div>
            <label htmlFor="bug-title" className="block text-cyber-green text-sm font-bold mb-2">
              Bug Title:
            </label>
            <input
              type="text"
              id="bug-title"
              className="cyber-input w-full p-3 bg-black/50 border border-cyber-cyan rounded-md focus:outline-none focus:ring-2 focus:ring-cyber-pink"
              placeholder="e.g., Sidebar overlapping content"
            />
          </div>
          <div>
            <label htmlFor="bug-description" className="block text-cyber-green text-sm font-bold mb-2">
              Description:
            </label>
            <textarea
              id="bug-description"
              rows={6}
              className="cyber-input w-full p-3 bg-black/50 border border-cyber-cyan rounded-md focus:outline-none focus:ring-2 focus:ring-cyber-pink"
              placeholder="Provide a detailed description of the bug, including steps to reproduce, expected behavior, and actual behavior."
            ></textarea>
          </div>
          <div>
            <label htmlFor="severity" className="block text-cyber-green text-sm font-bold mb-2">
              Severity:
            </label>
            <select
              id="severity"
              className="cyber-input w-full p-3 bg-black/50 border border-cyber-cyan rounded-md focus:outline-none focus:ring-2 focus:ring-cyber-pink"
            >
              <option value="low">Low - Minor inconvenience</option>
              <option value="medium">Medium - Affects usability</option>
              <option value="high">High - Critical functionality broken</option>
              <option value="critical">Critical - System crash/data loss</option>
            </select>
          </div>
          <button
            type="submit"
            className="cyber-button w-full py-3 px-4 rounded-md text-lg font-bold transition-all duration-300
                       bg-gradient-to-r from-cyber-pink to-cyber-purple text-white
                       hover:from-cyber-purple hover:to-cyber-pink
                       shadow-lg hover:shadow-cyber-pink/50 focus:outline-none focus:ring-2 focus:ring-cyber-pink"
          >
            Submit Bug Report
          </button>
        </form>
      </div>
    </div>
  );
};

export default BugReport;


