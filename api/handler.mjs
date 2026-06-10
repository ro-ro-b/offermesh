// Vercel serverless adapter — same handler as the local server.
// Note: serverless state is per-instance and ephemeral; set OFFERMESH_EPHEMERAL=1 in Vercel env.
import { handle } from '../lib/app.mjs';
export default function (req, res) { return handle(req, res); }
