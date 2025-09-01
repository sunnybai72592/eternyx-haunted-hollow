import { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { MobileViewport } from '@/components/MobileViewport';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CloudSolutions() {
  const [servers, setServers] = useState(1);
  const [databases, setDatabases] = useState(1);
  const [storageGB, setStorageGB] = useState(100);
  const [estimatedCost, setEstimatedCost] = useState(0);

  const [policyRequirements, setPolicyRequirements] = useState('');
  const [generatedPolicy, setGeneratedPolicy] = useState('');

  const [resourceType, setResourceType] = useState('');
  const [requiredTags, setRequiredTags] = useState('');
  const [taggingEnforcementResult, setTaggingEnforcementResult] = useState('');

  const calculateCost = () => {
    // Simple hypothetical cost calculation
    const serverCost = servers * 50; // $50 per server
    const databaseCost = databases * 100; // $100 per database
    const storageCost = storageGB * 0.10; // $0.10 per GB
    setEstimatedCost(serverCost + databaseCost + storageCost);
  };

  const generateSecurityPolicy = () => {
    if (policyRequirements) {
      setGeneratedPolicy(`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket/*"
      ],
      "Condition": {
        "StringLike": {
          "aws:RequestTag/Project": "${policyRequirements}"
        }
      }
    }
  ]
}`);
    } else {
      setGeneratedPolicy('Please enter policy requirements.');
    }
  };

  const enforceTagging = () => {
    if (resourceType && requiredTags) {
      setTaggingEnforcementResult(`Simulating enforcement for ${resourceType} with tags: ${requiredTags}.\n\nResult: All ${resourceType} resources found are compliant with the required tags.`);
    } else {
      setTaggingEnforcementResult('Please enter resource type and required tags.');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Cloud Solutions Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Manage and optimize your cloud infrastructure.
        </p>

        <Tabs defaultValue="cost-estimator" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cost-estimator">Cost Estimator</TabsTrigger>
            <TabsTrigger value="security-policy">Security Policy Generator</TabsTrigger>
            <TabsTrigger value="tagging-enforcer">Resource Tagging Enforcer</TabsTrigger>
          </TabsList>
          <TabsContent value="cost-estimator" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">Cloud Cost Estimator</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="servers" className="block text-muted-foreground mb-2">Number of Servers:</Label>
                <Input
                  id="servers"
                  type="number"
                  value={servers}
                  onChange={(e) => setServers(parseInt(e.target.value) || 0)}
                  className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
                />
              </div>
              <div>
                <Label htmlFor="databases" className="block text-muted-foreground mb-2">Number of Databases:</Label>
                <Input
                  id="databases"
                  type="number"
                  value={databases}
                  onChange={(e) => setDatabases(parseInt(e.target.value) || 0)}
                  className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
                />
              </div>
              <div>
                <Label htmlFor="storage" className="block text-muted-foreground mb-2">Storage (GB):</Label>
                <Input
                  id="storage"
                  type="number"
                  value={storageGB}
                  onChange={(e) => setStorageGB(parseInt(e.target.value) || 0)}
                  className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
                />
              </div>
            </div>
            <Button onClick={calculateCost} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Calculate Estimated Cost
            </Button>
            <div className="text-xl font-bold text-center mt-4">
              Estimated Monthly Cost: <span className="text-cyber-green">${estimatedCost.toFixed(2)}</span>
            </div>
          </TabsContent>
          <TabsContent value="security-policy" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-secondary">Cloud Security Policy Generator</h2>
            <Label htmlFor="policy-requirements">Policy Requirements (e.g., "Allow S3 access for Project X"):</Label>
            <Textarea
              id="policy-requirements"
              placeholder="Describe your security policy requirements..."
              value={policyRequirements}
              onChange={(e) => setPolicyRequirements(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[150px]"
            />
            <Button onClick={generateSecurityPolicy} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Generate Policy
            </Button>
            {generatedPolicy && (
              <Textarea
                readOnly
                value={generatedPolicy}
                className="bg-input-background border-input-border text-input-foreground min-h-[200px]"
              />
            )}
          </TabsContent>
          <TabsContent value="tagging-enforcer" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-accent">Resource Tagging Enforcer</h2>
            <Label htmlFor="resource-type">Resource Type (e.g., "EC2 Instances", "S3 Buckets"):</Label>
            <Input
              id="resource-type"
              type="text"
              placeholder="Enter resource type..."
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Label htmlFor="required-tags">Required Tags (comma-separated, e.g., "Environment:Production, Owner:TeamA"):</Label>
            <Input
              id="required-tags"
              type="text"
              placeholder="Enter required tags..."
              value={requiredTags}
              onChange={(e) => setRequiredTags(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={enforceTagging} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Enforce Tagging
            </Button>
            {taggingEnforcementResult && (
              <Textarea
                readOnly
                value={taggingEnforcementResult}
                className="bg-input-background border-input-border text-input-foreground min-h-[100px]"
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


