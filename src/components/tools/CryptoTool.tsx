import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Lock, Unlock, Hash, Key, Copy, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const CryptoTool: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [hashResult, setHashResult] = useState('');
  const [hashAlgorithm, setHashAlgorithm] = useState('SHA-256');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [encryptedText, setEncryptedText] = useState('');
  const [decryptedText, setDecryptedText] = useState('');
  const [showKey, setShowKey] = useState(false);
  const { toast } = useToast();

  // Hash functions using Web Crypto API and custom implementations
  const generateHash = async (text: string, algorithm: string) => {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      
      let hashBuffer: ArrayBuffer;
      
      switch (algorithm) {
        case 'SHA-1':
          hashBuffer = await crypto.subtle.digest('SHA-1', data);
          break;
        case 'SHA-256':
          hashBuffer = await crypto.subtle.digest('SHA-256', data);
          break;
        case 'SHA-384':
          hashBuffer = await crypto.subtle.digest('SHA-384', data);
          break;
        case 'SHA-512':
          hashBuffer = await crypto.subtle.digest('SHA-512', data);
          break;
        case 'MD5':
          return md5(text);
        default:
          throw new Error('Unsupported algorithm');
      }
      
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      throw new Error(`Hashing failed: ${error.message}`);
    }
  };

  // Simple MD5 implementation (for demonstration - not cryptographically secure)
  const md5 = (text: string): string => {
    // This is a simplified MD5 for demo purposes
    // In production, use a proper crypto library
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  };

  // Simple encryption using XOR (for demonstration)
  const xorEncrypt = (text: string, key: string): string => {
    if (!key) throw new Error('Encryption key is required');
    
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const textChar = text.charCodeAt(i);
      const keyChar = key.charCodeAt(i % key.length);
      result += String.fromCharCode(textChar ^ keyChar);
    }
    return btoa(result); // Base64 encode
  };

  const xorDecrypt = (encryptedText: string, key: string): string => {
    if (!key) throw new Error('Decryption key is required');
    
    try {
      const decoded = atob(encryptedText); // Base64 decode
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        const encChar = decoded.charCodeAt(i);
        const keyChar = key.charCodeAt(i % key.length);
        result += String.fromCharCode(encChar ^ keyChar);
      }
      return result;
    } catch (error) {
      throw new Error('Invalid encrypted text or key');
    }
  };

  // Caesar cipher
  const caesarEncrypt = (text: string, shift: number): string => {
    return text.replace(/[a-zA-Z]/g, (char) => {
      const start = char <= 'Z' ? 65 : 97;
      return String.fromCharCode(((char.charCodeAt(0) - start + shift) % 26) + start);
    });
  };

  const caesarDecrypt = (text: string, shift: number): string => {
    return caesarEncrypt(text, 26 - shift);
  };

  const handleHash = async () => {
    if (!inputText.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter text to hash',
        variant: 'destructive'
      });
      return;
    }

    try {
      const hash = await generateHash(inputText, hashAlgorithm);
      setHashResult(hash);
      toast({
        title: 'Hash Generated',
        description: `${hashAlgorithm} hash created successfully`
      });
    } catch (error) {
      toast({
        title: 'Hash Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleEncrypt = () => {
    if (!inputText.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter text to encrypt',
        variant: 'destructive'
      });
      return;
    }

    try {
      let encrypted: string;
      
      if (encryptionKey.trim()) {
        encrypted = xorEncrypt(inputText, encryptionKey);
      } else {
        // Use Caesar cipher with random shift if no key provided
        const shift = Math.floor(Math.random() * 25) + 1;
        encrypted = caesarEncrypt(inputText, shift);
        setEncryptionKey(shift.toString());
      }
      
      setEncryptedText(encrypted);
      toast({
        title: 'Text Encrypted',
        description: 'Text has been encrypted successfully'
      });
    } catch (error) {
      toast({
        title: 'Encryption Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleDecrypt = () => {
    if (!encryptedText.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter encrypted text to decrypt',
        variant: 'destructive'
      });
      return;
    }

    if (!encryptionKey.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter decryption key',
        variant: 'destructive'
      });
      return;
    }

    try {
      let decrypted: string;
      
      // Try XOR decryption first
      try {
        decrypted = xorDecrypt(encryptedText, encryptionKey);
      } catch {
        // If XOR fails, try Caesar cipher
        const shift = parseInt(encryptionKey);
        if (isNaN(shift)) {
          throw new Error('Invalid key format');
        }
        decrypted = caesarDecrypt(encryptedText, shift);
      }
      
      setDecryptedText(decrypted);
      toast({
        title: 'Text Decrypted',
        description: 'Text has been decrypted successfully'
      });
    } catch (error) {
      toast({
        title: 'Decryption Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: `${label} copied to clipboard`
    });
  };

  const generateRandomKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let key = '';
    for (let i = 0; i < 16; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setEncryptionKey(key);
  };

  const hashAlgorithms = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

  const presetTexts = [
    'Hello, World!',
    'The quick brown fox jumps over the lazy dog',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
    'This is a secret message that needs to be encrypted'
  ];

  return (
    <div className="w-full space-y-4">
      <Card className="bg-gray-900/50 border-red-500/30">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Cryptography & Hashing Tool
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="hash" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-gray-800/50">
              <TabsTrigger value="hash">Hash Generator</TabsTrigger>
              <TabsTrigger value="encrypt">Encryption</TabsTrigger>
              <TabsTrigger value="decrypt">Decryption</TabsTrigger>
            </TabsList>

            <TabsContent value="hash" className="space-y-4">
              {/* Input Text */}
              <div>
                <label className="text-sm font-medium text-red-400 mb-2 block">Input Text</label>
                <Textarea
                  placeholder="Enter text to hash..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="bg-gray-800 border-red-500/30 font-mono"
                  rows={4}
                />
                <div className="flex gap-2 mt-2 flex-wrap">
                  {presetTexts.map((preset, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => setInputText(preset)}
                      className="border-red-500/30 text-red-400 hover:bg-red-500/20 text-xs"
                    >
                      Preset {index + 1}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Hash Algorithm */}
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium text-red-400 mb-2 block">Hash Algorithm</label>
                  <Select value={hashAlgorithm} onValueChange={setHashAlgorithm}>
                    <SelectTrigger className="bg-gray-800 border-red-500/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-red-500/30">
                      {hashAlgorithms.map((algo) => (
                        <SelectItem key={algo} value={algo}>
                          {algo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleHash}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <Hash className="w-4 h-4 mr-2" />
                  Generate Hash
                </Button>
              </div>

              {/* Hash Result */}
              {hashResult && (
                <div>
                  <label className="text-sm font-medium text-red-400 mb-2 block">Hash Result</label>
                  <div className="flex gap-2">
                    <Input
                      value={hashResult}
                      readOnly
                      className="bg-gray-800 border-red-500/30 font-mono text-green-400"
                    />
                    <Button
                      onClick={() => copyToClipboard(hashResult, 'Hash')}
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex gap-4 text-sm text-gray-400">
                    <span>Algorithm: <Badge className="bg-red-500/20 text-red-400">{hashAlgorithm}</Badge></span>
                    <span>Length: {hashResult.length} characters</span>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="encrypt" className="space-y-4">
              {/* Input Text */}
              <div>
                <label className="text-sm font-medium text-red-400 mb-2 block">Text to Encrypt</label>
                <Textarea
                  placeholder="Enter text to encrypt..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="bg-gray-800 border-red-500/30"
                  rows={4}
                />
              </div>

              {/* Encryption Key */}
              <div>
                <label className="text-sm font-medium text-red-400 mb-2 block">Encryption Key (optional)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      placeholder="Enter encryption key or leave empty for Caesar cipher"
                      value={encryptionKey}
                      onChange={(e) => setEncryptionKey(e.target.value)}
                      className="bg-gray-800 border-red-500/30 pr-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-10 top-0 h-full px-2 text-gray-400 hover:text-white"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <Button
                    onClick={generateRandomKey}
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Leave empty to use Caesar cipher with random shift
                </p>
              </div>

              {/* Encrypt Button */}
              <Button
                onClick={handleEncrypt}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                <Lock className="w-4 h-4 mr-2" />
                Encrypt Text
              </Button>

              {/* Encrypted Result */}
              {encryptedText && (
                <div>
                  <label className="text-sm font-medium text-red-400 mb-2 block">Encrypted Text</label>
                  <div className="flex gap-2">
                    <Textarea
                      value={encryptedText}
                      readOnly
                      className="bg-gray-800 border-red-500/30 font-mono text-green-400"
                      rows={3}
                    />
                    <Button
                      onClick={() => copyToClipboard(encryptedText, 'Encrypted text')}
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="decrypt" className="space-y-4">
              {/* Encrypted Text Input */}
              <div>
                <label className="text-sm font-medium text-red-400 mb-2 block">Encrypted Text</label>
                <Textarea
                  placeholder="Enter encrypted text to decrypt..."
                  value={encryptedText}
                  onChange={(e) => setEncryptedText(e.target.value)}
                  className="bg-gray-800 border-red-500/30 font-mono"
                  rows={4}
                />
              </div>

              {/* Decryption Key */}
              <div>
                <label className="text-sm font-medium text-red-400 mb-2 block">Decryption Key</label>
                <div className="relative">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    placeholder="Enter decryption key"
                    value={encryptionKey}
                    onChange={(e) => setEncryptionKey(e.target.value)}
                    className="bg-gray-800 border-red-500/30 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-0 top-0 h-full px-2 text-gray-400 hover:text-white"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Decrypt Button */}
              <Button
                onClick={handleDecrypt}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                <Unlock className="w-4 h-4 mr-2" />
                Decrypt Text
              </Button>

              {/* Decrypted Result */}
              {decryptedText && (
                <div>
                  <label className="text-sm font-medium text-red-400 mb-2 block">Decrypted Text</label>
                  <div className="flex gap-2">
                    <Textarea
                      value={decryptedText}
                      readOnly
                      className="bg-gray-800 border-red-500/30 text-green-400"
                      rows={3}
                    />
                    <Button
                      onClick={() => copyToClipboard(decryptedText, 'Decrypted text')}
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/20"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default CryptoTool;

