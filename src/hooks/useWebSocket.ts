import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: number;
}

interface UseWebSocketOptions {
  url?: string;
  protocols?: string | string[];
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const {
    url = 'wss://ws.postman-echo.com/raw', // More reliable WebSocket test server
    protocols,
    onMessage,
    onError,
    reconnectAttempts = 3, // Reduced from 5
    reconnectInterval = 5000 // Increased from 3000
  } = options;

  const { setConnectionStatus, addNotification } = useAppStore();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    try {
      setConnectionStatus('connecting');
      ws.current = new WebSocket(url, protocols);

      ws.current.onopen = () => {
        setIsConnected(true);
        setConnectionStatus('online');
        setConnectionAttempts(0);
        
        addNotification({
          type: 'success',
          message: 'Real-time connection established'
        });
      };

      ws.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = {
            type: 'message',
            payload: JSON.parse(event.data),
            timestamp: Date.now()
          };
          
          setLastMessage(message);
          onMessage?.(message);
        } catch (error) {
          // Handle non-JSON messages
          const message: WebSocketMessage = {
            type: 'text',
            payload: event.data,
            timestamp: Date.now()
          };
          
          setLastMessage(message);
          onMessage?.(message);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
        
        addNotification({
          type: 'error',
          message: 'Real-time connection error'
        });
      };

      ws.current.onclose = (event) => {
        setIsConnected(false);
        setConnectionStatus('offline');
        
        if (!event.wasClean && connectionAttempts < reconnectAttempts) {
          addNotification({
            type: 'warning',
            message: `Connection lost. Reconnecting... (${connectionAttempts + 1}/${reconnectAttempts})`
          });
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setConnectionAttempts(prev => prev + 1);
            connect();
          }, reconnectInterval);
        } else if (connectionAttempts >= reconnectAttempts) {
          addNotification({
            type: 'error',
            message: 'Failed to reconnect. Please refresh the page.'
          });
        }
      };
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('offline');
    }
  }, [url, protocols, onMessage, onError, connectionAttempts, reconnectAttempts, reconnectInterval, setConnectionStatus, addNotification]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (ws.current) {
      ws.current.close(1000, 'User disconnected');
    }
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const messageToSend = typeof message === 'string' ? message : JSON.stringify(message);
      ws.current.send(messageToSend);
      return true;
    } else {
      addNotification({
        type: 'error',
        message: 'Cannot send message: Connection not established'
      });
      return false;
    }
  }, [addNotification]);

  const sendHeartbeat = useCallback(() => {
    sendMessage({ type: 'heartbeat', timestamp: Date.now() });
  }, [sendMessage]);

  useEffect(() => {
    connect();
    
    // Set up heartbeat
    const heartbeatInterval = setInterval(sendHeartbeat, 30000);
    
    return () => {
      clearInterval(heartbeatInterval);
      disconnect();
    };
  }, [connect, disconnect, sendHeartbeat]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
    connectionAttempts
  };
};

