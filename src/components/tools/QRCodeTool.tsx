import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { QrCode, Download, Upload, Camera, RefreshCw, Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const QRCodeTool: React.FC = () => {
  const [inputText, setInputText] = useState('https://github.com/sunnybai72592/eternyx-haunted-hollow');
  const [qrCodeDataURL, setQrCodeDataURL] = useState('');
  const [qrSize, setQrSize] = useState('256');
  const [errorLevel, setErrorLevel] = useState('M');
  const [qrColor, setQrColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [decodedText, setDecodedText] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Generate QR Code using a simple QR code algorithm
  const generateQRCode = async () => {
    if (!inputText.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter text to generate QR code',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Use QR Server API for QR code generation
      const size = parseInt(qrSize);
      const encodedText = encodeURIComponent(inputText);
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedText}&ecc=${errorLevel}&color=${qrColor.replace('#', '')}&bgcolor=${bgColor.replace('#', '')}`;
      
      // Fetch the QR code image
      const response = await fetch(qrUrl);
      const blob = await response.blob();
      const dataURL = URL.createObjectURL(blob);
      
      setQrCodeDataURL(dataURL);
      
      toast({
        title: 'QR Code Generated',
        description: 'QR code created successfully'
      });
    } catch (error) {
      toast({
        title: 'Generation Error',
        description: 'Failed to generate QR code',
        variant: 'destructive'
      });
    }
  };

  // Download QR Code
  const downloadQRCode = () => {
    if (!qrCodeDataURL) {
      toast({
        title: 'Error',
        description: 'No QR code to download',
        variant: 'destructive'
      });
      return;
    }

    const link = document.createElement('a');
    link.href = qrCodeDataURL;
    link.download = `qrcode-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: 'Downloaded!',
      description: 'QR code saved successfully'
    });
  };

  // Copy QR code data URL
  const copyQRCode = () => {
    if (qrCodeDataURL) {
      navigator.clipboard.writeText(qrCodeDataURL);
      toast({
        title: 'Copied!',
        description: 'QR code data URL copied to clipboard'
      });
    }
  };

  // Handle file upload for QR code reading
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Error',
        description: 'Please select an image file',
        variant: 'destructive'
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageDataURL = e.target?.result as string;
      decodeQRCode(imageDataURL);
    };
    reader.readAsDataURL(file);
  };

  // Decode QR Code (simplified - in real implementation you'd use a QR code library)
  const decodeQRCode = async (imageDataURL: string) => {
    try {
      // This is a simplified decoder - in a real implementation, you'd use a library like jsQR
      // For now, we'll simulate decoding
      setDecodedText('QR Code decoding requires a specialized library like jsQR. This is a demo implementation.');
      
      toast({
        title: 'QR Code Processed',
        description: 'Image uploaded successfully (decoding simulation)'
      });
    } catch (error) {
      toast({
        title: 'Decode Error',
        description: 'Failed to decode QR code',
        variant: 'destructive'
      });
    }
  };

  // Preset QR code data
  const presetData = [
    {
      name: 'Website URL',
      data: 'https://github.com/sunnybai72592/eternyx-haunted-hollow',
      type: 'URL'
    },
    {
      name: 'Contact Info',
      data: 'BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nORG:Eternyx\nTEL:+1234567890\nEMAIL:john@eternyx.com\nEND:VCARD',
      type: 'vCard'
    },
    {
      name: 'WiFi Network',
      data: 'WIFI:T:WPA;S:MyNetwork;P:MyPassword;;',
      type: 'WiFi'
    },
    {
      name: 'SMS Message',
      data: 'SMSTO:+1234567890:Hello from Eternyx QR Code!',
      type: 'SMS'
    },
    {
      name: 'Email',
      data: 'mailto:contact@eternyx.com?subject=Hello&body=Message from QR code',
      type: 'Email'
    },
    {
      name: 'Location',
      data: 'geo:37.7749,-122.4194',
      type: 'Location'
    }
  ];

  const errorLevels = [
    { value: 'L', label: 'Low (~7%)', description: 'Suitable for clean environments' },
    { value: 'M', label: 'Medium (~15%)', description: 'Balanced error correction' },
    { value: 'Q', label: 'Quartile (~25%)', description: 'Good for industrial use' },
    { value: 'H', label: 'High (~30%)', description: 'Maximum error correction' }
  ];

  const sizes = ['128', '256', '512', '1024'];

  return (
    <div className="w-full space-y-4">
      <Card className="bg-gray-900/50 border-green-500/30">
        <CardHeader>
          <CardTitle className="text-green-400 flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            QR Code Generator & Reader
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-800/50">
              <TabsTrigger value="generate">Generate</TabsTrigger>
              <TabsTrigger value="presets">Presets</TabsTrigger>
              <TabsTrigger value="read">Read QR</TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="space-y-4">
              {/* Input Text */}
              <div>
                <label className="text-sm font-medium text-green-400 mb-2 block">Text or Data to Encode</label>
                <Textarea
                  placeholder="Enter text, URL, or data to generate QR code..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="bg-gray-800 border-green-500/30"
                  rows={4}
                />
                <div className="text-xs text-gray-400 mt-1">
                  Characters: {inputText.length} | Max recommended: 2953 (depending on error correction level)
                </div>
              </div>

              {/* QR Code Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Size */}
                <div>
                  <label className="text-sm font-medium text-green-400 mb-2 block">Size (px)</label>
                  <Select value={qrSize} onValueChange={setQrSize}>
                    <SelectTrigger className="bg-gray-800 border-green-500/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-green-500/30">
                      {sizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}x{size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Error Correction */}
                <div>
                  <label className="text-sm font-medium text-green-400 mb-2 block">Error Correction</label>
                  <Select value={errorLevel} onValueChange={setErrorLevel}>
                    <SelectTrigger className="bg-gray-800 border-green-500/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-green-500/30">
                      {errorLevels.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* QR Color */}
                <div>
                  <label className="text-sm font-medium text-green-400 mb-2 block">QR Color</label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={qrColor}
                      onChange={(e) => setQrColor(e.target.value)}
                      className="w-12 h-10 bg-gray-800 border-green-500/30 p-1"
                    />
                    <Input
                      value={qrColor}
                      onChange={(e) => setQrColor(e.target.value)}
                      className="flex-1 bg-gray-800 border-green-500/30 font-mono text-sm"
                    />
                  </div>
                </div>

                {/* Background Color */}
                <div>
                  <label className="text-sm font-medium text-green-400 mb-2 block">Background</label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-12 h-10 bg-gray-800 border-green-500/30 p-1"
                    />
                    <Input
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="flex-1 bg-gray-800 border-green-500/30 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={generateQRCode}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <QrCode className="w-4 h-4 mr-2" />
                Generate QR Code
              </Button>

              {/* Generated QR Code */}
              {qrCodeDataURL && (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg">
                      <img 
                        src={qrCodeDataURL} 
                        alt="Generated QR Code" 
                        className="max-w-full h-auto"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={downloadQRCode}
                      variant="outline"
                      className="border-green-500/30 text-green-400 hover:bg-green-500/20"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download PNG
                    </Button>
                    <Button
                      onClick={copyQRCode}
                      variant="outline"
                      className="border-green-500/30 text-green-400 hover:bg-green-500/20"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy URL
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="bg-gray-800/30 p-3 rounded-lg border border-green-500/20">
                      <div className="text-gray-400">Size</div>
                      <div className="text-white font-medium">{qrSize}x{qrSize}px</div>
                    </div>
                    <div className="bg-gray-800/30 p-3 rounded-lg border border-green-500/20">
                      <div className="text-gray-400">Error Level</div>
                      <div className="text-white font-medium">{errorLevel}</div>
                    </div>
                    <div className="bg-gray-800/30 p-3 rounded-lg border border-green-500/20">
                      <div className="text-gray-400">Data Length</div>
                      <div className="text-white font-medium">{inputText.length} chars</div>
                    </div>
                    <div className="bg-gray-800/30 p-3 rounded-lg border border-green-500/20">
                      <div className="text-gray-400">Format</div>
                      <div className="text-white font-medium">PNG</div>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="presets" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {presetData.map((preset, index) => (
                  <Card key={index} className="bg-gray-800/50 border-green-500/20 hover:border-green-400/50 transition-colors cursor-pointer"
                        onClick={() => setInputText(preset.data)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-white">{preset.name}</h4>
                        <Badge className="bg-green-500/20 text-green-400">{preset.type}</Badge>
                      </div>
                      <p className="text-sm text-gray-400 truncate">{preset.data}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="read" className="space-y-4">
              {/* File Upload */}
              <div>
                <label className="text-sm font-medium text-green-400 mb-2 block">Upload QR Code Image</label>
                <div className="border-2 border-dashed border-green-500/30 rounded-lg p-8 text-center hover:border-green-400/50 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Upload className="w-12 h-12 text-green-400 mx-auto mb-4" />
                  <p className="text-gray-300 mb-2">Click to upload QR code image</p>
                  <p className="text-sm text-gray-400">Supports PNG, JPG, GIF formats</p>
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    variant="outline"
                    className="mt-4 border-green-500/30 text-green-400 hover:bg-green-500/20"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Choose File
                  </Button>
                </div>
              </div>

              {/* Camera Capture (Note: Would require additional implementation) */}
              <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Camera className="w-5 h-5 text-blue-400" />
                  <h4 className="text-blue-400 font-medium">Camera Capture</h4>
                </div>
                <p className="text-blue-300 text-sm">
                  Camera-based QR code scanning would require additional permissions and WebRTC implementation. 
                  Use the file upload option above to decode QR codes from images.
                </p>
              </div>

              {/* Decoded Result */}
              {decodedText && (
                <div>
                  <label className="text-sm font-medium text-green-400 mb-2 block">Decoded Text</label>
                  <Textarea
                    value={decodedText}
                    readOnly
                    className="bg-gray-800 border-green-500/30 text-green-400"
                    rows={6}
                  />
                  <Button
                    onClick={() => navigator.clipboard.writeText(decodedText)}
                    variant="outline"
                    className="mt-2 border-green-500/30 text-green-400 hover:bg-green-500/20"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Decoded Text
                  </Button>
                </div>
              )}

              {/* Note about QR Reading */}
              <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <p className="text-yellow-400 text-sm">
                  <strong>Note:</strong> Full QR code reading functionality requires specialized libraries like jsQR or ZXing. 
                  This demo shows the interface - in production, you would integrate a proper QR code decoding library.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default QRCodeTool;

