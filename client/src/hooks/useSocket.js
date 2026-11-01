import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

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
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
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
