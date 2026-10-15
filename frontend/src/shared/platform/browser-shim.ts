// Bundled module, not an inline <script>: safe with extension script-src 'self'.
// Preserve the real extension API; only standalone web/desktop needs this shim.
if (!window.chrome?.tabs) {
    const event = {addListener() {}, removeListener() {}};
    const port = () => ({postMessage() {}, onMessage: event, disconnect() {}, onDisconnect: event});
    window.chrome = Object.assign(window.chrome ?? {}, {
        tabs: {connect: port, query: async () => [{url: ""}], onUpdated: event, onActivated: event, onRemoved: event},
        windows: {onFocusChanged: event},
        runtime: {connect: port, onMessage: event, sendMessage: async () => undefined},
    });
}
