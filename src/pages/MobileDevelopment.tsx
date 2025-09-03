import { useState } from 'react';
import { MobileViewport } from "@/components/MobileViewport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MobileDevelopment() {
  const [appPackageName, setAppPackageName] = useState('');
  const [appInfo, setAppInfo] = useState('');
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationBody, setNotificationBody] = useState('');
  const [notificationStatus, setNotificationStatus] = useState('');

  const getAppInfo = () => {
    if (appPackageName) {
      setAppInfo(`Simulating app info for: ${appPackageName}\nVersion: 1.0.0\nDeveloper: ETERNYX\nPermissions: Internet, Storage`);
    } else {
      setAppInfo('Please enter an app package name.');
    }
  };

  const sendPushNotification = () => {
    if (notificationTitle && notificationBody) {
      setNotificationStatus(`Push notification sent!\nTitle: ${notificationTitle}\nBody: ${notificationBody}`);
    } else {
      setNotificationStatus('Please enter both title and body for the notification.');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Mobile Development Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Simulate mobile devices and test app functionalities.
        </p>

        <Tabs defaultValue="device-emulator" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="device-emulator">Device Emulator</TabsTrigger>
            <TabsTrigger value="app-info-extractor">App Info Extractor</TabsTrigger>
            <TabsTrigger value="push-notification-tester">Push Notification Tester</TabsTrigger>
          </TabsList>
          <TabsContent value="device-emulator" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-primary">Device Emulator</h2>
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 flex justify-center items-center min-h-[300px]">
              <img 
                src="https://via.placeholder.com/200x400.png?text=Mobile+Device+Emulator"
                alt="Mobile Device Emulator Placeholder"
                className="max-w-full h-auto"
              />
            </div>
            <p className="text-muted-foreground text-sm text-center">
              (This is a placeholder for a more advanced device emulator)
            </p>
          </TabsContent>
          <TabsContent value="app-info-extractor" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-secondary">App Info Extractor</h2>
            <Label htmlFor="app-package-name">App Package Name (e.g., com.example.app):</Label>
            <Input
              id="app-package-name"
              type="text"
              placeholder="Enter app package name..."
              value={appPackageName}
              onChange={(e) => setAppPackageName(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Button onClick={getAppInfo} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Get App Info
            </Button>
            {appInfo && (
              <Textarea
                readOnly
                value={appInfo}
                className="bg-input-background border-input-border text-input-foreground min-h-[150px]"
              />
            )}
          </TabsContent>
          <TabsContent value="push-notification-tester" className="space-y-4 mt-8">
            <h2 className="text-2xl font-bold text-accent">Push Notification Tester</h2>
            <Label htmlFor="notification-title">Notification Title:</Label>
            <Input
              id="notification-title"
              type="text"
              placeholder="Enter notification title..."
              value={notificationTitle}
              onChange={(e) => setNotificationTitle(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300"
            />
            <Label htmlFor="notification-body">Notification Body:</Label>
            <Textarea
              id="notification-body"
              placeholder="Enter notification body..."
              value={notificationBody}
              onChange={(e) => setNotificationBody(e.target.value)}
              className="bg-input-background border-input-border text-input-foreground focus:ring-primary focus:border-primary transition-all duration-300 min-h-[100px]"
            />
            <Button onClick={sendPushNotification} className="w-full bg-primary hover:bg-primary/80 text-primary-foreground neon-border">
              Send Test Notification
            </Button>
            {notificationStatus && (
              <Textarea
                readOnly
                value={notificationStatus}
                className="bg-input-background border-input-border text-input-foreground min-h-[100px]"
              />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}


