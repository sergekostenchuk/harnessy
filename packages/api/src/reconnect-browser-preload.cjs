// Close the actual test SSE socket; reconnection creates a fresh socket on demand.
const NativeEventSource=window.EventSource;
const sources=new Set();
class ControlledEventSource {
  constructor(url){this.url=url;this.closed=false;sources.add(this);this.connect()}
  connect(){if(this.closed)return;const socket=this.socket=new NativeEventSource(this.url);for(const type of ['open','message','error'])socket['on'+type]=event=>{if(this.socket===socket)this['on'+type]?.(event)}}
  close(){this.closed=true;this.socket?.close();this.socket=null;sources.delete(this)}
}
window.EventSource=ControlledEventSource;
window.__dropHarnessEvents=()=>{for(const source of sources){source.socket?.close();source.socket=null;source.onerror?.(new Event('error'))}};
window.__restoreHarnessEvents=()=>{for(const source of sources)if(!source.socket)source.connect()};
