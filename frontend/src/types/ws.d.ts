declare module "ws" {
  class WebSocket {
    constructor(url: string);
    close(): void;
    ping(): void;
    on(event: string, cb: (...args: unknown[]) => void): void;
    readonly readyState: number;
  }

  export default WebSocket;
}
