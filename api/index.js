// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
import { handle } from '../lib/api.js';

export default function handler(req, res) {
  return handle(req, res);
}
