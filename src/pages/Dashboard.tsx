import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TerminalWindow } from "@/components/TerminalWindow";
import { CyberCard } from "@/components/CyberCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAppStore } from "@/store/useAppStore";
import { supabase, supabaseAPI } from "@/lib/supabase";
import { analyticsService } from "@/lib/analyticsService";
import { 
  User, 
  Settings, 
  Database, 
  HelpCircle, 
  Zap, 
  Shield, 
  LogOut,
  Home,
  Activity,
  Bell,
  Code
} from "lucide-react";

const Dashboard = () => {
  const navigate = useNavigate();
  const { addNotification } = useAppStore();
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("home");
  const [editableUserName, setEditableUserName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          addNotification({
            type: "error",
            message: "Please sign in to access the dashboard"
          });
          navigate("/signin");
          return;
        }
        
        setUser(user);
        setEditableUserName(user.user_metadata?.name || "");
        
        analyticsService.trackPageView("/dashboard");
        analyticsService.setUserId(user.id);
        
      } catch (error) {
        console.error("Auth check error:", error);
        navigate("/signin");
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [navigate, addNotification]);

  const handleProfileUpdate = async () => {
    setIsSavingProfile(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { name: editableUserName }
      });

      if (error) throw error;

      setUser(data.user);
      addNotification({
        type: "success",
        message: "Profile updated successfully!"
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      addNotification({
        type: "error",
        message: "Failed to update profile. Please try again."
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabaseAPI.signOut();
      
      addNotification({
        type: 'success',
        message: 'Signed out successfully'
      });
      
      navigate('/');
    } catch (error) {
      addNotification({
        type: 'error',
        message: 'Error signing out'
      });
    }
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    analyticsService.trackInteraction('dashboard_tab', 'click', { tab });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <LoadingSpinner variant="cyber" text="Loading Dashboard..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-primary glitch" data-text="ETERNYX">
                ETERNYX
              </h1>
              <span className="text-cyber-green">Dashboard</span>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">
                Welcome, {user?.user_metadata?.name || user?.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-cyber-blue hover:text-cyber-green"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <TerminalWindow title="navigation.sys" className="sticky top-24">
              <nav className="space-y-2">
                {[
                  { id: 'home', label: 'Home', icon: Home },
                  { id: 'profile', label: 'Profile', icon: User },
                  { id: 'settings', label: 'Settings', icon: Settings },
                  { id: 'data', label: 'Data Storage', icon: Database },
                  { id: 'integrations', label: 'Integrations', icon: Zap },
                  { id: 'apis', label: 'APIs', icon: Code },
                  { id: 'help', label: 'Help Center', icon: HelpCircle },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleTabChange(item.id)}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded text-left transition-colors ${
                      activeTab === item.id
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </TerminalWindow>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeTab === 'home' && (
              <div className="space-y-6">
                <TerminalWindow title="system-overview.exe">
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-cyber-green">System Status</h2>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-muted/20 p-4 rounded border border-border">
                        <div className="flex items-center space-x-2">
                          <Activity className="h-5 w-5 text-cyber-green" />
                          <span className="text-sm font-medium">Status</span>
                        </div>
                        <p className="text-lg font-bold text-cyber-green mt-1">ONLINE</p>
                      </div>
                      <div className="bg-muted/20 p-4 rounded border border-border">
                        <div className="flex items-center space-x-2">
                          <Shield className="h-5 w-5 text-cyber-blue" />
                          <span className="text-sm font-medium">Security</span>
                        </div>
                        <p className="text-lg font-bold text-cyber-blue mt-1">SECURE</p>
                      </div>
                      <div className="bg-muted/20 p-4 rounded border border-border">
                        <div className="flex items-center space-x-2">
                          <Bell className="h-5 w-5 text-yellow-500" />
                          <span className="text-sm font-medium">Alerts</span>
                        </div>
                        <p className="text-lg font-bold text-yellow-500 mt-1">0</p>
                      </div>
                    </div>
                  </div>
                </TerminalWindow>

                <div className="grid md:grid-cols-2 gap-6">
                  <CyberCard
                    title="Quick Actions"
                    description="Access frequently used features and tools"
                    icon={<Zap />}
                  />
                  <CyberCard
                    title="Recent Activity"
                    description="View your latest actions and system events"
                    icon={<Activity />}
                  />
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <TerminalWindow title="user-profile.exe">
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-cyber-green">User Profile</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-cyber-green mb-2">
                        Email Address
                      </label>
                      <p className="text-foreground">{user?.email}</p>
                    </div>
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-cyber-green mb-2">
                        Username
                      </label>
                      <Input
                        id="username"
                        type="text"
                        value={editableUserName}
                        onChange={(e) => setEditableUserName(e.target.value)}
                        className="bg-background border-border text-foreground neon-border"
                        placeholder="Enter your username..."
                        disabled={isSavingProfile}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-cyber-green mb-2">
                        Access Level
                      </label>
                      <p className="text-cyber-blue">{user?.user_metadata?.access_level || 'Basic'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-cyber-green mb-2">
                        Account Created
                      </label>
                      <p className="text-foreground">
                        {new Date(user?.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-cyber-green mb-2">
                        Last Sign In
                      </label>
                      <p className="text-foreground">
                        {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'N/A'}
                      </p>
                    </div>
                    <Button 
                      onClick={handleProfileUpdate}
                      disabled={isSavingProfile || editableUserName === user?.user_metadata?.name}
                      className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border animate-pulse-glow"
                    >
                      {isSavingProfile ? (
                        <LoadingSpinner size="sm" text="Saving..." />
                      ) : (
                        "Save Profile"
                      )}
                    </Button>
                  </div>
                </div>
              </TerminalWindow>
            )}

            {activeTab === 'settings' && (
              <TerminalWindow title="system-settings.exe">
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-cyber-green">Settings</h2>
                  <p className="text-muted-foreground">
                    Configure your account preferences and system settings.
                  </p>
                  
                  {/* Notifications Settings */}
                  <div className="p-4 border border-border rounded space-y-4">
                    <h3 className="font-medium text-foreground mb-2">Notifications</h3>
                    <p className="text-sm text-muted-foreground">
                      Manage your notification preferences.
                    </p>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="emailNotifications" className="form-checkbox text-cyber-green rounded" />
                      <label htmlFor="emailNotifications" className="text-foreground">Email Notifications</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="appNotifications" className="form-checkbox text-cyber-green rounded" />
                      <label htmlFor="appNotifications" className="text-foreground">In-App Notifications</label>
                    </div>
                    <Button variant="outline" className="border-cyber-blue text-cyber-blue hover:bg-cyber-blue/10 neon-border">Save Notification Settings</Button>
                  </div>

                  {/* Security Settings */}
                  <div className="p-4 border border-border rounded space-y-4">
                    <h3 className="font-medium text-foreground mb-2">Security</h3>
                    <p className="text-sm text-muted-foreground">
                      Update your password and security settings.
                    </p>
                    <div>
                      <label htmlFor="currentPassword" className="block text-sm font-medium text-cyber-green mb-2">Current Password:</label>
                      <Input type="password" id="currentPassword" className="bg-background border-border text-foreground neon-border" placeholder="Enter current password" />
                    </div>
                    <div>
                      <label htmlFor="newPassword" className="block text-sm font-medium text-cyber-green mb-2">New Password:</label>
                      <Input type="password" id="newPassword" className="bg-background border-border text-foreground neon-border" placeholder="Enter new password" />
                    </div>
                    <div>
                      <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-cyber-green mb-2">Confirm New Password:</label>
                      <Input type="password" id="confirmNewPassword" className="bg-background border-border text-foreground neon-border" placeholder="Confirm new password" />
                    </div>
                    <Button variant="outline" className="border-cyber-blue text-cyber-blue hover:bg-cyber-blue/10 neon-border">Change Password</Button>
                  </div>

                  {/* Privacy Settings */}
                  <div className="p-4 border border-border rounded space-y-4">
                    <h3 className="font-medium text-foreground mb-2">Privacy</h3>
                    <p className="text-sm text-muted-foreground">
                      Control your data and privacy settings.
                    </p>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="dataSharing" className="form-checkbox text-cyber-green rounded" />
                      <label htmlFor="dataSharing" className="text-foreground">Allow Data Sharing</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" id="personalizedAds" className="form-checkbox text-cyber-green rounded" />
                      <label htmlFor="personalizedAds" className="text-foreground">Personalized Advertisements</label>
                    </div>
                    <Button variant="outline" className="border-cyber-blue text-cyber-blue hover:bg-cyber-blue/10 neon-border">Save Privacy Settings</Button>
                  </div>
                </div>
              </TerminalWindow>
            )}

            {activeTab === 'data' && (
              <TerminalWindow title="data-storage.exe">
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-cyber-green">Data Storage</h2>
                  <p className="text-muted-foreground">
                    Manage your stored data and files.
                  </p>
                  <div className="text-center py-8">
                    <Database className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No data stored yet</p>
                  </div>
                </div>
              </TerminalWindow>
            )}

            {activeTab === 'integrations' && (
              <TerminalWindow title="integrations.exe">
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-cyber-green">Integrations</h2>
                  <p className="text-muted-foreground">
                    Connect with external services and tools.
                  </p>
                  <div className="text-center py-8">
                    <Zap className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No integrations configured</p>
                  </div>
                </div>
              </TerminalWindow>
            )}

            {activeTab === 'apis' && (
              <TerminalWindow title="api-management.exe">
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-cyber-green">API Management</h2>
                  <p className="text-muted-foreground">
                    Manage your API keys and endpoints.
                  </p>
                  <div className="text-center py-8">
                    <Code className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No APIs configured</p>
                  </div>
                </div>
              </TerminalWindow>
            )}

            {activeTab === 'help' && (
              <TerminalWindow title="help-center.exe">
                <div className="space-y-6">
                  <h2 className="text-xl font-bold text-cyber-green">Help Center</h2>
                  <div className="space-y-4">
                    <div className="p-4 border border-border rounded">
                      <h3 className="font-medium text-foreground mb-2">Documentation</h3>
                      <p className="text-sm text-muted-foreground">
                        Access comprehensive guides and tutorials
                      </p>
                    </div>
                    <div className="p-4 border border-border rounded">
                      <h3 className="font-medium text-foreground mb-2">Support</h3>
                      <p className="text-sm text-muted-foreground">
                        Get help from our support team
                      </p>
                    </div>
                    <div className="p-4 border border-border rounded">
                      <h3 className="font-medium text-foreground mb-2">Community</h3>
                      <p className="text-sm text-muted-foreground">
                        Connect with other users and developers
                      </p>
                    </div>
                  </div>
                </div>
              </TerminalWindow>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

