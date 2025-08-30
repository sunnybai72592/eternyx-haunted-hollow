import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Skull, AlertTriangle, Diamond, Eye, Users, Wifi } from "lucide-react";

const Services = () => {
  const navigate = useNavigate();

  // Cybersecurity services exactly as shown in the image
  const securityServices = [
    {
      id: 'black-hat-pentesting',
      title: 'Black Hat Pentesting',
      description: 'Advanced penetration testing using cutting-edge techniques. We think like attackers to protect your systems from real threats.',
      icon: <Skull className="h-8 w-8" />,
      route: '/black-hat-pentesting',
      color: 'text-red-400',
      borderColor: 'border-red-500/20 hover:border-red-500/40',
      bgColor: 'hover:bg-red-500/10'
    },
    {
      id: 'zero-day-protection',
      title: 'Zero-Day Protection',
      description: 'Stay ahead of unknown threats with our proprietary detection systems and real-time threat intelligence feeds.',
      icon: <AlertTriangle className="h-8 w-8" />,
      route: '/zero-day-protection',
      color: 'text-yellow-400',
      borderColor: 'border-yellow-500/20 hover:border-yellow-500/40',
      bgColor: 'hover:bg-yellow-500/10'
    },
    {
      id: 'quantum-encryption',
      title: 'Quantum-Ready Encryption',
      description: 'Future-proof your data with quantum-resistant encryption algorithms and next-generation security protocols.',
      icon: <Diamond className="h-8 w-8" />,
      route: '/quantum-encryption',
      color: 'text-purple-400',
      borderColor: 'border-purple-500/20 hover:border-purple-500/40',
      bgColor: 'hover:bg-purple-500/10'
    },
    {
      id: 'ai-security',
      title: 'AI-Powered Security',
      description: 'Machine learning algorithms that adapt to new threats in real-time, providing predictive security measures.',
      icon: <Eye className="h-8 w-8" />,
      route: '/ai-powered-security',
      color: 'text-blue-400',
      borderColor: 'border-blue-500/20 hover:border-blue-500/40',
      bgColor: 'hover:bg-blue-500/10'
    },
    {
      id: 'elite-team',
      title: 'Elite Development Team',
      description: 'Access to our top-tier developers for mission-critical applications that require the highest security standards.',
      icon: <Users className="h-8 w-8" />,
      route: '/elite-development-team',
      color: 'text-green-400',
      borderColor: 'border-green-500/20 hover:border-green-500/40',
      bgColor: 'hover:bg-green-500/10'
    },
    {
      id: 'threat-monitoring',
      title: '24/7 Threat Monitoring',
      description: 'Round-the-clock security operations center monitoring your infrastructure with instant threat response.',
      icon: <Wifi className="h-8 w-8" />,
      route: '/threat-monitoring',
      color: 'text-orange-400',
      borderColor: 'border-orange-500/20 hover:border-orange-500/40',
      bgColor: 'hover:bg-orange-500/10'
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-blue-500/20 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Main
          </Button>
          <div className="text-xl font-bold text-blue-400">ETERNYX Services</div>
        </div>
      </header>

      {/* Services Grid - Exactly matching the image layout */}
      <section className="py-20 px-4 max-w-4xl mx-auto">
        <div className="grid gap-6">
          {securityServices.map((service) => (
            <Button
              key={service.id}
              onClick={() => navigate(service.route)}
              className="w-full h-auto p-0 bg-transparent hover:bg-transparent border-0"
              variant="ghost"
            >
              <div className={`w-full p-6 bg-card/30 backdrop-blur-sm border ${service.borderColor} ${service.bgColor} rounded-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-lg`}>
                <div className="flex items-start space-x-4">
                  <div className={`${service.color} flex-shrink-0 mt-1`}>
                    {service.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className={`text-xl font-bold ${service.color} mb-3`}>
                      {service.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {service.description}
                    </p>
                  </div>
                </div>
              </div>
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Services;

