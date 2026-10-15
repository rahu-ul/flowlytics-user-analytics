import { io } from 'socket.io-client';
import { CONNECTION_STATES, REALTIME_EVENTS } from './lib/realtime.js';

export { CONNECTION_STATES, REALTIME_EVENTS };

// Same-origin by default (Vite proxy in dev, Express in prod). Can be customized via VITE_SOCKET_URL or VITE_API_URL.
const SOCKET_URL = import.meta.env?.VITE_SOCKET_URL || import.meta.env?.VITE_API_URL || '';

let socketInstance = null;
let currentState = CONNECTION_STATES.CONNECTING;
const statusListeners = new Set();

function setConnectionState(newState) {
  if (currentState === newState) return;
  currentState = newState;
  for (const listener of statusListeners) {
    try {
      listener(currentState);
    } catch (err) {
      console.error('Socket status listener error:', err);
    }
  }
}

/**
 * Returns the singleton Socket.IO instance, lazily initialized on first call.
 * This guarantees a single connection across all components and React renders.
 */
export function getSocket() {
  if (socketInstance) return socketInstance;

  // In non-browser / test environments without socket.io-client
  if (typeof window === 'undefined' && !io) {
    return null;
  }

  socketInstance = io(SOCKET_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    autoConnect: true,
  });

  socketInstance.on('connect', () => {
    setConnectionState(CONNECTION_STATES.LIVE);
  });

  socketInstance.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') {
      setConnectionState(CONNECTION_STATES.DISCONNECTED);
    } else {
      setConnectionState(CONNECTION_STATES.RECONNECTING);
    }
  });

  socketInstance.on('connect_error', () => {
    if (socketInstance.connected) {
      setConnectionState(CONNECTION_STATES.RECONNECTING);
    } else {
      // Still trying to connect / reconnect
      setConnectionState(CONNECTION_STATES.RECONNECTING);
    }
  });

  if (socketInstance.io) {
    socketInstance.io.on('reconnect_attempt', () => {
      setConnectionState(CONNECTION_STATES.RECONNECTING);
    });

    socketInstance.io.on('reconnect', () => {
      setConnectionState(CONNECTION_STATES.LIVE);
    });

    socketInstance.io.on('reconnect_failed', () => {
      setConnectionState(CONNECTION_STATES.DISCONNECTED);
    });
  }

  return socketInstance;
}

/**
 * Returns current connection state ('Connecting', 'Live', 'Reconnecting', 'Disconnected').
 */
export function getConnectionState() {
  return currentState;
}

/**
 * Subscribes to connection state changes.
 * Calls listener immediately with current state. Returns an unsubscribe function.
 */
export function onConnectionChange(listener) {
  statusListeners.add(listener);
  try {
    listener(currentState);
  } catch (err) {
    console.error('Error invoking status listener:', err);
  }
  return () => {
    statusListeners.delete(listener);
  };
}

/**
 * Subscribes to a Socket.IO event. Returns an unsubscribe function.
 */
export function onSocketEvent(eventName, callback) {
  const socket = getSocket();
  if (!socket) return () => {};

  socket.on(eventName, callback);
  return () => {
    socket.off(eventName, callback);
  };
}
