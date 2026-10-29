// Thin wrapper around the Socket.IO connection.
/* global io */

export const socket = io({ transports: ['websocket', 'polling'] });

export function call(event, args) {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, args, (err, res) => resolve(err ? { ok: false, error: 'The server did not answer.' } : res));
  });
}

export const send = (event, args) => socket.emit(event, args);
export const on = (event, fn) => socket.on(event, fn);
