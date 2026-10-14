export function startXC(flights, cache, onUpdate, preferred) {
  const workerURL = URL.createObjectURL(new Blob([XC_WORKER], { type: 'text/javascript' }));
  let worker, active = null, watchdog, stopped = false;
  const queue = [];
  for (const flight of flights) {
    if (flight.points.length < 5) continue;
    if (cache.has(flight.key)) flight.xc = cache.get(flight.key);
    else queue.push({ flight, budgetMs: 75 });
  }
  if (preferred) queue.sort((a, b) => Number(b.flight === preferred) - Number(a.flight === preferred));
  function launchWorker() {
    worker = new Worker(workerURL);
    worker.onmessage = ({ data }) => {
      if (!active || data.key !== active.flight.key) return;
      clearTimeout(watchdog);
      const flight = active.flight;
      if (data.error) flight.xcError = data.error;
      else {
        const old = flight.xc;
        flight.xc = Object.fromEntries(Object.entries(data.result || {}).map(([key, value]) => [key, old?.[key] && (old[key].optimal || (old[key].distanceKm ?? -1) > (value.distanceKm ?? -1)) ? old[key] : value]));
        delete flight.xcError; cache.set(flight.key, flight.xc);
      }
      active = null; onUpdate(flight); next();
    };
    worker.onerror = event => fail(event.message || 'XC worker could not start');
  }
  function fail(message) {
    clearTimeout(watchdog); worker.terminate(); worker = null;
    if (active) { active.flight.xcError = message; const flight = active.flight; active = null; onUpdate(flight); }
    if (!stopped && queue.length) next();
  }
  function next() {
    if (stopped || active || !queue.length) return;
    if (!worker) launchWorker();
    active = queue.shift();
    watchdog = setTimeout(() => fail('XC calculation timed out. Select the flight and retry refinement.'), 15000);
    worker.postMessage({ key: active.flight.key, points: active.flight.points, budgetMs: active.budgetMs });
  }
  launchWorker(); next();
  return {
    refine(flight) {
      if (!flight || flight.points.length < 5 || active?.flight === flight && active.budgetMs > 75) return;
      const index = queue.findIndex(job => job.flight === flight);
      if (index >= 0) queue.splice(index, 1);
      queue.unshift({ flight, budgetMs: 2000 }); next();
    },
    get pending() { return queue.length + Number(!!active); },
    get refining() { return active?.budgetMs > 75 ? active.flight : queue.find(job => job.budgetMs > 75)?.flight || null; },
    stop() { stopped = true; clearTimeout(watchdog); worker?.terminate(); URL.revokeObjectURL(workerURL); }
  };
}
