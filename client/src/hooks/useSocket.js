import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getServerOrigin, isNativeApp } from '../services/serverBase';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

/**
 * Real-time connection hook: engine state, live stats, live visit feed.
 * Auto-reconnects on disconnect.
 */
export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [engineState, setEngineState] = useState('stopped');
  const [stats, setStats] = useState({});
  const [liveVisits, setLiveVisits] = useState([]);

  useEffect(() => {
    // Native app with no server configured yet — wait in Settings instead of
    // hammering the bundled-assets origin with doomed connection attempts.
    const origin = getServerOrigin();
    if (isNativeApp() && !origin) return undefined;

    const token =
      import.meta.env.VITE_API_TOKEN || localStorage.getItem('websense_api_token') || '';
    const socket = io(origin || SOCKET_URL || undefined, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      auth: token ? { token } : undefined,
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('engine:state', (data) => setEngineState(data.state));
    socket.on('stats:update', (data) => setStats(data));

    socket.on('visit:complete', (visit) => {
      setLiveVisits((prev) => [visit, ...prev].slice(0, 100));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const clearVisits = useCallback(() => setLiveVisits([]), []);

  return { connected, engineState, stats, liveVisits, clearVisits, socket: socketRef };
}
