import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SCHEDULE = require('../schedule.config.js');

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(SCHEDULE);
}
