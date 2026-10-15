import { useEffect, useRef, useState } from 'react';
import {
  CONNECTION_STATES,
  getConnectionState,
  getSocket,
  onConnectionChange,
  onSocketEvent,
} from './socket.js';

/**
 * Hook to observe the real-time Socket.IO connection status:
 * 'Connecting' | 'Live' | 'Reconnecting' | 'Disconnected'
 */
export function useSocketStatus() {
  const [status, setStatus] = useState(getConnectionState);

  useEffect(() => {
    // Calling getSocket() ensures the connection is initialized
    getSocket();
    return onConnectionChange((nextStatus) => {
      setStatus(nextStatus);
    });
  }, []);

  return status;
}

/**
 * Hook to listen to a specific Socket.IO event with automatic registration and cleanup.
 * Handles React Strict Mode and component unmount cleanly.
 */
export function useSocketEvent(eventName, handler, deps = []) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!eventName) return undefined;
    getSocket(); // Ensure initialized

    const listener = (...args) => {
      handlerRef.current?.(...args);
    };

    return onSocketEvent(eventName, listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, ...deps]);
}

/**
 * Hook that calls onReconnect() whenever the socket transitions back to 'Live'
 * after having been in 'Reconnecting' or 'Disconnected' state.
 */
export function useSocketReconnect(onReconnect) {
  const prevRef = useRef(getConnectionState());
  const callbackRef = useRef(onReconnect);
  callbackRef.current = onReconnect;

  useEffect(() => {
    return onConnectionChange((nextStatus) => {
      const prev = prevRef.current;
      prevRef.current = nextStatus;

      if (
        nextStatus === CONNECTION_STATES.LIVE &&
        (prev === CONNECTION_STATES.RECONNECTING || prev === CONNECTION_STATES.DISCONNECTED)
      ) {
        callbackRef.current?.();
      }
    });
  }, []);
}
