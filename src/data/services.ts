import { Zap, Code, Shield, Brain, TrendingUp, Server } from 'lucide-react';

export interface Service {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  color: string; // Tailwind color class for neon effect
  link: string;
}

export const services: Service[] = [
  {
    id: 'full-stack-dev',
    title: 'Full Stack Web Development',
    subtitle: 'End-to-End Digital Infrastructure Deployment',
    description: 'We architect and deploy robust, scalable, and high-performance web applications using modern stacks (MERN, PERN, Next.js). From concept to cloud deployment, we handle it all.',
    icon: Code,
    color: 'text-blue-400',
    link: '/services/full-stack-dev',
  },
  {
    id: 'cyber-pentesting',
    title: 'Advanced Cybersecurity Penetration Testing',
    subtitle: 'Proactive Threat Simulation and Vulnerability Assessment',
    description: 'Our certified ethical hackers perform deep-dive penetration tests on web, mobile, and network infrastructure to identify and mitigate critical security flaws before they are exploited.',
    icon: Shield,
    color: 'text-red-400',
    link: '/services/cyber-pentesting',
  },
  {
    id: 'ai-ml-integration',
    title: 'AI/ML Integration & Automation',
    subtitle: 'Intelligent Systems for Business Process Optimization',
    description: 'Integrate custom machine learning models and AI-driven automation into your existing workflows to boost efficiency, enhance decision-making, and unlock new capabilities.',
    icon: Brain,
    color: 'text-purple-400',
    link: '/services/ai-ml-integration',
  },
  {
    id: 'digital-strategy',
    title: 'Digital Transformation & Strategy',
    subtitle: 'Future-Proofing Your Business Technology Landscape',
    description: 'Consulting services to align your technology roadmap with business goals, focusing on cloud migration, microservices architecture, and digital product innovation.',
    icon: TrendingUp,
    color: 'text-yellow-400',
    link: '/services/digital-strategy',
  },
  {
    id: 'devops-cloud',
    title: 'DevOps & Cloud Infrastructure',
    subtitle: 'Automated, Scalable, and Resilient Cloud Solutions',
    description: 'Expert setup and management of CI/CD pipelines, containerization (Docker/Kubernetes), and cloud infrastructure (AWS, Azure, GCP) for maximum reliability and speed.',
    icon: Server,
    color: 'text-green-400',
    link: '/services/devops-cloud',
  },
  {
    id: 'blockchain-solutions',
    title: 'Blockchain & Distributed Ledger Solutions',
    subtitle: 'Secure and Transparent Decentralized Applications',
    description: 'Development of custom smart contracts, decentralized applications (dApps), and private blockchain networks for supply chain, finance, and identity management.',
    icon: Zap,
    color: 'text-cyan-400',
    link: '/services/blockchain-solutions',
  },
];
