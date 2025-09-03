import { useState } from 'react';
import { MobileViewport } from '@/components/MobileViewport';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function CloudSolutions() {
  const [cloudProvider, setCloudProvider] = useState('aws');
  const [serviceType, setServiceType] = useState('ec2');
  const [region, setRegion] = useState('us-east-1');
  const [estimatedCost, setEstimatedCost] = useState(0);

  const [policyProvider, setPolicyProvider] = useState('aws');
  const [policyRequirements, setPolicyRequirements] = useState('');
  const [generatedPolicy, setGeneratedPolicy] = useState('');

  const [deploymentProvider, setDeploymentProvider] = useState('aws');
  const [deploymentService, setDeploymentService] = useState('lambda');
  const [deploymentStatus, setDeploymentStatus] = useState('');

  const calculateCost = () => {
    let cost = 0;
    switch (cloudProvider) {
      case 'aws':
        switch (serviceType) {
          case 'ec2': cost = 0.05 * 730; break; // $0.05/hour for a basic instance
          case 's3': cost = 0.023 * 100; break; // $0.023/GB for 100GB
          case 'lambda': cost = 0.0000002 * 1000000; break; // $0.0000002/invocation for 1M invocations
          default: cost = 0;
        }
        break;
      case 'azure':
        switch (serviceType) {
          case 'vm': cost = 0.04 * 730; break; // $0.04/hour for a basic VM
          case 'blob': cost = 0.02 * 100; break; // $0.02/GB for 100GB
          case 'functions': cost = 0.0000002 * 1000000; break; // $0.0000002/invocation for 1M invocations
          default: cost = 0;
        }
        break;
      case 'gcp':
        switch (serviceType) {
          case 'compute': cost = 0.035 * 730; break; // $0.035/hour for a basic instance
          case 'storage': cost = 0.026 * 100; break; // $0.026/GB for 100GB
          case 'functions': cost = 0.0000004 * 1000000; break; // $0.0000004/invocation for 1M invocations
          default: cost = 0;
        }
        break;
      default: cost = 0;
    }
    setEstimatedCost(parseFloat(cost.toFixed(2)));
  };

  const generateSecurityPolicy = () => {
    if (!policyRequirements) {
      setGeneratedPolicy('Please enter policy requirements.');
      return;
    }
    let policy = '';
    switch (policyProvider) {
      case 'aws':
        policy = `AWS IAM Policy (Simulated):\n{\n  "Version": "2012-10-17",\n  "Statement": [\n    {\n      "Effect": "Allow",\n      "Action": [\n        "s3:GetObject",\n        "lambda:InvokeFunction"\n      ],\n      "Resource": "*",\n      "Condition": {\n        "StringLike": {\n          "aws:RequestTag/Project": "${policyRequirements}"\n        }\n      }\n    }\n  ]\n}`; break;
      case 'azure':
        policy = `Azure RBAC Policy (Simulated):\n{\n  "roleName": "CustomReader",\n  "description": "Allows reading resources tagged with ${policyRequirements}",\n  "actions": [\n    "Microsoft.Compute/virtualMachines/read",\n    "Microsoft.Storage/storageAccounts/read"\n  ],\n  "notActions": [],\n  "dataActions": [],\n  "notDataActions": [],\n  "assignableScopes": [\n    "/subscriptions/{subscriptionId}"\n  ]\n}`; break;
      case 'gcp':
        policy = `GCP IAM Policy (Simulated):\n{\n  "bindings": [\n    {\n      "role": "roles/viewer",\n      "members": [\n        "user:example@example.com"\n      ],\n      "condition": {\n        "title": "${policyRequirements}",\n        "expression": "resource.labels.project == \"${policyRequirements}\""\n      }\n    }\n  ]\n}`; break;
      default: policy = 'Select a cloud provider.';
    }
    setGeneratedPolicy(policy);
  };

  const simulateDeployment = () => {
    setDeploymentStatus(`Simulating deployment of ${deploymentService} on ${deploymentProvider}...`);
    setTimeout(() => {
      setDeploymentStatus(`Deployment of ${deploymentService} on ${deploymentProvider} successful!\n\nAccess Endpoint: https://${deploymentProvider}-${deploymentService}-example.com`);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Cloud Solutions Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Manage and optimize your cloud infrastructure across AWS, Azure, and GCP.
        </p>

        <Tabs defaultValue="cost-estimator" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cost-estimator">Cost Estimator</TabsTrigger>
            <TabsTrigger value="security-policy">Security Policy Generator</TabsTrigger>
            <TabsTrigger value="deployment-simulator">Deployment Simulator</TabsTrigger>
          </TabsList>
          <TabsContent value="cost-estimator" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">Cloud Cost Estimator</h2>
            <Label htmlFor="cloud-provider">Cloud Provider:</Label>
            <select
              id="cloud-provider"
              value={cloudProvider}
              onChange={(e) => setCloudProvider(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 p-2 rounded-md w-full"
            >
              <option value="aws">AWS</option>
              <option value="azure">Azure</option>
              <option value="gcp">GCP</option>
            </select>
            <Label htmlFor="service-type">Service Type:</Label>
            <select
              id="service-type"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 p-2 rounded-md w-full"
            >
              {cloudProvider === 'aws' && (
                <>
                  <option value="ec2">EC2 (Virtual Servers)</option>
                  <option value="s3">S3 (Object Storage)</option>
                  <option value="lambda">Lambda (Serverless Functions)</option>
                </>
              )}
              {cloudProvider === 'azure' && (
                <>
                  <option value="vm">Virtual Machines</option>
                  <option value="blob">Blob Storage</option>
                  <option value="functions">Azure Functions</option>
                </>
              )}
              {cloudProvider === 'gcp' && (
                <>
                  <option value="compute">Compute Engine</option>
                  <option value="storage">Cloud Storage</option>
                  <option value="functions">Cloud Functions</option>
                </>
              )}
            </select>
            <Label htmlFor="region">Region (e.g., us-east-1):</Label>
            <Input
              id="region"
              type="text"
              placeholder="Enter region..."
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={calculateCost} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Calculate Estimated Cost
            </Button>
            <div className="text-xl font-bold text-center mt-4">
              Estimated Monthly Cost: <span className="text-cyber-green">${estimatedCost.toFixed(2)}</span>
            </div>
          </TabsContent>
          <TabsContent value="security-policy" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-secondary">Cloud Security Policy Generator</h2>
            <Label htmlFor="policy-provider">Cloud Provider:</Label>
            <select
              id="policy-provider"
              value={policyProvider}
              onChange={(e) => setPolicyProvider(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 p-2 rounded-md w-full"
            >
              <option value="aws">AWS</option>
              <option value="azure">Azure</option>
              <option value="gcp">GCP</option>
            </select>
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
          <TabsContent value="deployment-simulator" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-accent">Cloud Deployment Simulator</h2>
            <Label htmlFor="deployment-provider">Cloud Provider:</Label>
            <select
              id="deployment-provider"
              value={deploymentProvider}
              onChange={(e) => setDeploymentProvider(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 p-2 rounded-md w-full"
            >
              <option value="aws">AWS</option>
              <option value="azure">Azure</option>
              <option value="gcp">GCP</option>
            </select>
            <Label htmlFor="deployment-service">Service to Deploy:</Label>
            <select
              id="deployment-service"
              value={deploymentService}
              onChange={(e) => setDeploymentService(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 p-2 rounded-md w-full"
            >
              {deploymentProvider === 'aws' && (
                <>
                  <option value="lambda">Lambda Function</option>
                  <option value="ec2">EC2 Instance</option>
                  <option value="s3">S3 Bucket</option>
                </>
              )}
              {deploymentProvider === 'azure' && (
                <>
                  <option value="functions">Azure Function</option>
                  <option value="vm">Virtual Machine</option>
                  <option value="blob">Blob Storage</option>
                </>
              )}
              {deploymentProvider === 'gcp' && (
                <>
                  <option value="functions">Cloud Function</option>
                  <option value="compute">Compute Engine</option>
                  <option value="storage">Cloud Storage</option>
                </>
              )}
            </select>
            <Button onClick={simulateDeployment} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Simulate Deployment
            </Button>
            {deploymentStatus && (
              <Textarea
                readOnly
                value={deploymentStatus}
                className="bg-input-background border-input-border text-input-foreground min-h-[100px]"
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


