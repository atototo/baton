declare module "ws" {
  import type { EventEmitter } from "node:events";
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readonly readyState: number;
    ping(): void;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
  }

  export class WebSocketServer extends EventEmitter {
    readonly clients: Set<WebSocket>;
    constructor(options?: { noServer?: boolean });
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (client: WebSocket) => void,
    ): void;
    emit(event: "connection", client: WebSocket, request: IncomingMessage): boolean;
  }
}
