// OfferMesh local server — thin wrapper around the shared app handler.
import { createServer } from 'node:http';
import { handle, meta } from './lib/app.mjs';

const PORT = Number(process.env.PORT || 4310);
createServer(handle).listen(PORT, () => {
  console.log(`OfferMesh v${meta.VERSION} at http://127.0.0.1:${PORT} (MCP at /mcp). Write mode: read_only.`);
});
