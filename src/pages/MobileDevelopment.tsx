import { Navigation } from "@/components/Navigation";
import { MobileViewport } from "@/components/MobileViewport";

export default function MobileDevelopment() {
  return (
    <div className="min-h-screen bg-background text-foreground preserve-cyberpunk android-scroll">
      <MobileViewport />
      <Navigation />
      <main className="pt-20 sm:pt-24 px-4 max-w-6xl mx-auto responsive-container">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 text-cyber-blue neon-text responsive-text-5xl">
          Mobile Development Tools
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto responsive-text-lg mb-8">
          Simulate mobile devices for testing and development.
        </p>

        <div className="space-y-4">
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
        </div>
      </main>
    </div>
  );
}


