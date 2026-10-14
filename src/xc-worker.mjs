import { calculateXC } from './xc.mjs';
self.onmessage = ({ data }) => {
  try { self.postMessage({ key: data.key, result: calculateXC(data.points, data.budgetMs) }); }
  catch (error) { self.postMessage({ key: data.key, error: error.message }); }
};
