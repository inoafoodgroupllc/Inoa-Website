import SCHEDULE from './_schedule.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(SCHEDULE);
}
