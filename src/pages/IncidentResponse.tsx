import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle, 
  Shield, 
  Clock, 
  Users, 
  FileText, 
  Phone, 
  Mail, 
  MessageSquare,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  RotateCcw,
  Eye,
  Settings,
  Activity,
  Zap,
  Target,
  Search,
  Download,
  Upload,
  Bell,
  Calendar,
  MapPin,
  Server,
  Database,
  Network,
  Lock
} from 'lucide-react';

interface Incident {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
  category: string;
  description: string;
  reportedBy: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
  affectedSystems: string[];
  timeline: TimelineEvent[];
}

interface TimelineEvent {
  id: string;
  timestamp: string;
  action: string;
  description: string;
  user: string;
  type: 'detection' | 'analysis' | 'containment' | 'eradication' | 'recovery' | 'communication';
}

interface ResponseTeam {
  id: string;
  name: string;
  role: string;
  status: 'available' | 'busy' | 'offline';
  contact: string;
  expertise: string[];
}

const IncidentResponse = () => {
  const [activeIncidents, setActiveIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [responsePhase, setResponsePhase] = useState('preparation');
  const [isResponding, setIsResponding] = useState(false);

  const responseTeam: ResponseTeam[] = [
    {
      id: '1',
      name: 'Alex Chen',
      role: 'Incident Commander',
      status: 'available',
      contact: '+1-555-0101',
      expertise: ['Leadership', 'Coordination', 'Communication']
    },
    {
      id: '2',
      name: 'Sarah Johnson',
      role: 'Security Analyst',
      status: 'busy',
      contact: '+1-555-0102',
      expertise: ['Malware Analysis', 'Forensics', 'Threat Intelligence']
    },
    {
      id: '3',
      name: 'Mike Rodriguez',
      role: 'Network Engineer',
      status: 'available',
      contact: '+1-555-0103',
      expertise: ['Network Security', 'Firewall Management', 'Traffic Analysis']
    },
    {
      id: '4',
      name: 'Emily Davis',
      role: 'System Administrator',
      status: 'available',
      contact: '+1-555-0104',
      expertise: ['Server Management', 'Backup Recovery', 'System Hardening']
    }
  ];

  const sampleIncidents: Incident[] = [
    {
      id: 'INC-2024-001',
      title: 'Suspected Data Breach - Customer Database',
      severity: 'critical',
      status: 'investigating',
      category: 'Data Breach',
      description: 'Unusual access patterns detected on customer database server. Potential unauthorized data access.',
      reportedBy: 'Security Monitoring System',
      assignedTo: 'Sarah Johnson',
      createdAt: '2024-01-15T10:30:00Z',
      updatedAt: '2024-01-15T11:45:00Z',
      affectedSystems: ['Customer DB Server', 'Web Application', 'API Gateway'],
      timeline: [
        {
          id: '1',
          timestamp: '2024-01-15T10:30:00Z',
          action: 'Incident Detected',
          description: 'Automated monitoring system detected unusual database access patterns',
          user: 'Security System',
          type: 'detection'
        },
        {
          id: '2',
          timestamp: '2024-01-15T10:35:00Z',
          action: 'Initial Assessment',
          description: 'Security analyst confirmed suspicious activity and escalated to incident response team',
          user: 'Sarah Johnson',
          type: 'analysis'
        },
        {
          id: '3',
          timestamp: '2024-01-15T11:00:00Z',
          action: 'Containment Initiated',
          description: 'Database access temporarily restricted, affected systems isolated',
          user: 'Mike Rodriguez',
          type: 'containment'
        }
      ]
    },
    {
      id: 'INC-2024-002',
      title: 'Ransomware Attack - Finance Department',
      severity: 'high',
      status: 'contained',
      category: 'Malware',
      description: 'Ransomware detected on multiple workstations in finance department.',
      reportedBy: 'Finance Manager',
      assignedTo: 'Alex Chen',
      createdAt: '2024-01-14T14:20:00Z',
      updatedAt: '2024-01-14T16:30:00Z',
      affectedSystems: ['Finance Workstations', 'File Server', 'Email System'],
      timeline: [
        {
          id: '1',
          timestamp: '2024-01-14T14:20:00Z',
          action: 'Incident Reported',
          description: 'Finance manager reported encrypted files and ransom note on workstations',
          user: 'Finance Manager',
          type: 'detection'
        },
        {
          id: '2',
          timestamp: '2024-01-14T14:25:00Z',
          action: 'Emergency Response',
          description: 'Incident response team activated, affected systems immediately isolated',
          user: 'Alex Chen',
          type: 'containment'
        },
        {
          id: '3',
          timestamp: '2024-01-14T15:00:00Z',
          action: 'Malware Analysis',
          description: 'Ransomware variant identified, decryption tools evaluated',
          user: 'Sarah Johnson',
          type: 'analysis'
        }
      ]
    }
  ];

  useEffect(() => {
    setActiveIncidents(sampleIncidents);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-500';
      case 'investigating': return 'bg-orange-500';
      case 'contained': return 'bg-yellow-500';
      case 'resolved': return 'bg-blue-500';
      case 'closed': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getTeamStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-500';
      case 'busy': return 'bg-orange-500';
      case 'offline': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const responsePhases = [
    { id: 'preparation', name: 'Preparation', icon: Settings, description: 'Readiness and planning' },
    { id: 'identification', name: 'Identification', icon: Search, description: 'Detect and analyze' },
    { id: 'containment', name: 'Containment', icon: Shield, description: 'Isolate and limit damage' },
    { id: 'eradication', name: 'Eradication', icon: Target, description: 'Remove threat completely' },
    { id: 'recovery', name: 'Recovery', icon: RotateCcw, description: 'Restore normal operations' },
    { id: 'lessons', name: 'Lessons Learned', icon: FileText, description: 'Document and improve' }
  ];

  const startIncidentResponse = () => {
    setIsResponding(true);
    // Simulate incident response workflow
    setTimeout(() => {
      setIsResponding(false);
    }, 5000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-gradient-to-r from-red-500 to-orange-500 rounded-lg">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
              Incident Response
            </h1>
            <p className="text-gray-400 mt-2">
              Rapid security incident detection, analysis, and response
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Active Incidents</p>
                  <p className="text-2xl font-bold text-red-400">2</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Response Time</p>
                  <p className="text-2xl font-bold text-orange-400">4.2m</p>
                </div>
                <Clock className="w-8 h-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Team Members</p>
                  <p className="text-2xl font-bold text-blue-400">4</p>
                </div>
                <Users className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Resolved Today</p>
                  <p className="text-2xl font-bold text-green-400">7</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Response Phases */}
        <Card className="bg-gray-800/50 border-gray-700 mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Incident Response Lifecycle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {responsePhases.map((phase, index) => (
                <div
                  key={phase.id}
                  className={`p-4 rounded-lg border-2 transition-all duration-300 cursor-pointer ${
                    responsePhase === phase.id
                      ? 'border-orange-500 bg-orange-500/20'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                  onClick={() => setResponsePhase(phase.id)}
                >
                  <div className="flex flex-col items-center text-center">
                    <phase.icon className={`w-8 h-8 mb-2 ${
                      responsePhase === phase.id ? 'text-orange-400' : 'text-gray-400'
                    }`} />
                    <h3 className="font-semibold text-sm mb-1">{phase.name}</h3>
                    <p className="text-xs text-gray-400">{phase.description}</p>
                  </div>
                  {index < responsePhases.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-2 w-4 h-0.5 bg-gray-600"></div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active Incidents */}
          <div className="lg:col-span-2">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    Active Incidents
                  </CardTitle>
                  <Button
                    onClick={startIncidentResponse}
                    disabled={isResponding}
                    className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
                  >
                    {isResponding ? (
                      <>
                        <Pause className="w-4 h-4 mr-2" />
                        Responding...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Emergency Response
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeIncidents.map((incident) => (
                    <div
                      key={incident.id}
                      className={`p-4 bg-gray-900/50 rounded-lg border cursor-pointer transition-all duration-300 ${
                        selectedIncident === incident.id
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                      onClick={() => setSelectedIncident(incident.id)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-white mb-1">{incident.title}</h4>
                          <p className="text-sm text-gray-400">{incident.id}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge className={`${getSeverityColor(incident.severity)} text-white`}>
                            {incident.severity.toUpperCase()}
                          </Badge>
                          <Badge className={`${getStatusColor(incident.status)} text-white`}>
                            {incident.status.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      
                      <p className="text-gray-400 text-sm mb-3">{incident.description}</p>
                      
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Assigned to: {incident.assignedTo}</span>
                        <span>Updated: {new Date(incident.updatedAt).toLocaleString()}</span>
                      </div>
                      
                      <div className="mt-3 flex flex-wrap gap-1">
                        {incident.affectedSystems.map((system) => (
                          <Badge key={system} variant="outline" className="text-xs">
                            {system}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Incident Timeline */}
            {selectedIncident && (
              <Card className="bg-gray-800/50 border-gray-700 mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Incident Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {activeIncidents
                      .find(inc => inc.id === selectedIncident)
                      ?.timeline.map((event) => (
                        <div key={event.id} className="flex gap-4">
                          <div className="flex-shrink-0 w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <h5 className="font-semibold text-white">{event.action}</h5>
                              <span className="text-xs text-gray-500">
                                {new Date(event.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-400 mb-1">{event.description}</p>
                            <p className="text-xs text-gray-500">By: {event.user}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Response Team */}
          <div>
            <Card className="bg-gray-800/50 border-gray-700 mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Response Team
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {responseTeam.map((member) => (
                    <div key={member.id} className="p-3 bg-gray-900/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-white">{member.name}</h4>
                        <div className={`w-3 h-3 rounded-full ${getTeamStatusColor(member.status)}`}></div>
                      </div>
                      <p className="text-sm text-gray-400 mb-2">{member.role}</p>
                      <p className="text-xs text-gray-500 mb-2">{member.contact}</p>
                      <div className="flex flex-wrap gap-1">
                        {member.expertise.map((skill) => (
                          <Badge key={skill} variant="outline" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button className="w-full justify-start" variant="outline">
                    <Bell className="w-4 h-4 mr-2" />
                    Send Alert
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <Phone className="w-4 h-4 mr-2" />
                    Emergency Call
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <Mail className="w-4 h-4 mr-2" />
                    Notify Stakeholders
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <FileText className="w-4 h-4 mr-2" />
                    Generate Report
                  </Button>
                  <Button className="w-full justify-start" variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Export Evidence
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IncidentResponse;

