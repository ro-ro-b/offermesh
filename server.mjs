// Revolv local server — thin wrapper around the OfferMesh engine handler.
import { createServer } from 'node:http';
import { handle, meta } from './lib/app.mjs';

const PORT = Number(process.env.PORT || 4310);
createServer(handle).listen(PORT, () => {
  console.log(`Revolv v${meta.VERSION} at http://127.0.0.1:${PORT} (OfferMesh MCP engine at /mcp). Write mode: read_only.`);
});
