export {};

declare global {
  interface RTCSessionDescriptionInit {
    toJSON(): RTCSessionDescriptionInit;
  }
}
