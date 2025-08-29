// AI/ML Integration Service for ETERNYX
// This service provides AI-powered features for the application

interface AIAnalysisResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  keywords: string[];
  category: string;
  priority: 'low' | 'medium' | 'high';
  suggestedResponse?: string;
}

interface SecurityThreatAnalysis {
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  threatType: string[];
  confidence: number;
  recommendations: string[];
  blockedIPs?: string[];
}

interface PersonalizationData {
  userSegment: string;
  preferences: Record<string, any>;
  recommendedContent: string[];
  nextBestAction: string;
}

export class AIService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    // In production, these would come from environment variables
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';
    this.baseUrl = 'https://api.openai.com/v1';
  }

  // Analyze contact form messages for sentiment and priority
  async analyzeContactMessage(message: string, email: string): Promise<AIAnalysisResult> {
    try {
      const prompt = `
        Analyze this contact form message for:
        1. Sentiment (positive/negative/neutral)
        2. Priority level (low/medium/high)
        3. Category (support, sales, partnership, complaint, etc.)
        4. Key topics/keywords
        5. Suggested response approach

        Message: "${message}"
        Email: "${email}"

        Respond in JSON format with sentiment, confidence (0-1), keywords array, category, priority, and suggestedResponse.
      `;

      const response = await this.callOpenAI(prompt, 'gpt-3.5-turbo');
      
      // Parse AI response
      const analysis = JSON.parse(response);
      
      return {
        sentiment: analysis.sentiment || 'neutral',
        confidence: analysis.confidence || 0.5,
        keywords: analysis.keywords || [],
        category: analysis.category || 'general',
        priority: analysis.priority || 'medium',
        suggestedResponse: analysis.suggestedResponse
      };
    } catch (error) {
      console.error('AI analysis error:', error);
      
      // Fallback analysis
      return {
        sentiment: 'neutral',
        confidence: 0.3,
        keywords: this.extractKeywords(message),
        category: 'general',
        priority: this.determinePriority(message),
        suggestedResponse: 'Thank you for your message. We will get back to you soon.'
      };
    }
  }

  // Security threat analysis
  async analyzeSecurityThreat(
    ipAddress: string,
    userAgent: string,
    requestPattern: string[]
  ): Promise<SecurityThreatAnalysis> {
    try {
      const prompt = `
        Analyze this web request pattern for security threats:
        
        IP Address: ${ipAddress}
        User Agent: ${userAgent}
        Request Pattern: ${requestPattern.join(', ')}
        
        Look for:
        1. Bot/automated traffic patterns
        2. SQL injection attempts
        3. XSS attempts
        4. Brute force patterns
        5. Suspicious user agents
        6. Rate limiting violations
        
        Respond in JSON format with threatLevel, threatType array, confidence, and recommendations array.
      `;

      const response = await this.callOpenAI(prompt, 'gpt-4');
      const analysis = JSON.parse(response);
      
      return {
        threatLevel: analysis.threatLevel || 'low',
        threatType: analysis.threatType || [],
        confidence: analysis.confidence || 0.5,
        recommendations: analysis.recommendations || [],
        blockedIPs: analysis.shouldBlock ? [ipAddress] : []
      };
    } catch (error) {
      console.error('Security analysis error:', error);
      
      // Fallback security analysis
      return {
        threatLevel: 'low',
        threatType: [],
        confidence: 0.3,
        recommendations: ['Monitor for unusual patterns']
      };
    }
  }

  // User personalization and recommendations
  async generatePersonalization(
    userId: string,
    userBehavior: Record<string, any>,
    preferences: Record<string, any>
  ): Promise<PersonalizationData> {
    try {
      const prompt = `
        Generate personalization recommendations for a cybersecurity/development services website user:
        
        User ID: ${userId}
        Behavior Data: ${JSON.stringify(userBehavior)}
        Preferences: ${JSON.stringify(preferences)}
        
        Provide:
        1. User segment classification
        2. Content recommendations
        3. Next best action
        4. Personalized messaging
        
        Focus on cybersecurity, full-stack development, and performance optimization services.
        Respond in JSON format.
      `;

      const response = await this.callOpenAI(prompt, 'gpt-3.5-turbo');
      const personalization = JSON.parse(response);
      
      return {
        userSegment: personalization.userSegment || 'general',
        preferences: personalization.preferences || {},
        recommendedContent: personalization.recommendedContent || [],
        nextBestAction: personalization.nextBestAction || 'explore_services'
      };
    } catch (error) {
      console.error('Personalization error:', error);
      
      // Fallback personalization
      return {
        userSegment: 'general',
        preferences: {},
        recommendedContent: ['cybersecurity_audit', 'performance_optimization'],
        nextBestAction: 'contact_sales'
      };
    }
  }

  // Generate dynamic content
  async generateContent(
    contentType: 'blog_post' | 'service_description' | 'security_tip' | 'case_study',
    topic: string,
    targetAudience: string = 'technical'
  ): Promise<string> {
    try {
      const prompt = `
        Generate ${contentType.replace('_', ' ')} content for ETERNYX cybersecurity and development services:
        
        Topic: ${topic}
        Target Audience: ${targetAudience}
        Brand Voice: Professional, technical, cyberpunk-inspired
        
        Requirements:
        - Engaging and informative
        - Technical accuracy
        - Cybersecurity focus
        - Call-to-action included
        - 300-500 words
        
        Format as markdown.
      `;

      return await this.callOpenAI(prompt, 'gpt-4');
    } catch (error) {
      console.error('Content generation error:', error);
      return `# ${topic}\n\nContent generation temporarily unavailable. Please contact our team for more information.`;
    }
  }

  // Chatbot responses
  async generateChatbotResponse(
    userMessage: string,
    conversationHistory: string[] = [],
    userContext: Record<string, any> = {}
  ): Promise<string> {
    try {
      const prompt = `
        You are ETERNYX AI, a cybersecurity and development services assistant.
        
        User Message: "${userMessage}"
        Conversation History: ${conversationHistory.join('\n')}
        User Context: ${JSON.stringify(userContext)}
        
        Respond as a knowledgeable cybersecurity expert who can help with:
        - Full-stack development questions
        - Cybersecurity best practices
        - Performance optimization
        - Service inquiries
        
        Keep responses concise, helpful, and professional with a slight cyberpunk edge.
        If you can't help, direct them to contact the team.
      `;

      return await this.callOpenAI(prompt, 'gpt-3.5-turbo');
    } catch (error) {
      console.error('Chatbot response error:', error);
      return "I'm experiencing technical difficulties. Please contact our team directly for assistance.";
    }
  }

  // Code analysis and security scanning
  async analyzeCode(
    code: string,
    language: string,
    analysisType: 'security' | 'performance' | 'quality' = 'security'
  ): Promise<{
    issues: Array<{
      type: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      line?: number;
      description: string;
      recommendation: string;
    }>;
    score: number;
    summary: string;
  }> {
    try {
      const prompt = `
        Analyze this ${language} code for ${analysisType} issues:
        
        \`\`\`${language}
        ${code}
        \`\`\`
        
        Provide:
        1. List of issues with severity levels
        2. Overall score (0-100)
        3. Summary of findings
        4. Specific recommendations
        
        Focus on: ${analysisType === 'security' ? 'vulnerabilities, injection flaws, authentication issues' : 
                   analysisType === 'performance' ? 'optimization opportunities, bottlenecks' : 
                   'code quality, maintainability, best practices'}
        
        Respond in JSON format.
      `;

      const response = await this.callOpenAI(prompt, 'gpt-4');
      return JSON.parse(response);
    } catch (error) {
      console.error('Code analysis error:', error);
      return {
        issues: [],
        score: 50,
        summary: 'Analysis temporarily unavailable'
      };
    }
  }

  // Private helper methods
  private async callOpenAI(prompt: string, model: string = 'gpt-3.5-turbo'): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    const commonWords = ['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'said', 'each', 'which', 'their'];
    return [...new Set(words.filter(word => !commonWords.includes(word)))].slice(0, 10);
  }

  private determinePriority(message: string): 'low' | 'medium' | 'high' {
    const urgentKeywords = ['urgent', 'emergency', 'critical', 'asap', 'immediately', 'hack', 'breach', 'attack'];
    const highKeywords = ['important', 'priority', 'soon', 'quickly', 'security', 'vulnerability'];
    
    const lowerMessage = message.toLowerCase();
    
    if (urgentKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return 'high';
    }
    
    if (highKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return 'medium';
    }
    
    return 'low';
  }
}

// Export singleton instance
export const aiService = new AIService();

