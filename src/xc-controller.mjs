// One worker job per distinct file. Await persistence between batches so a save
// failure stops the queue without losing already completed geometry in memory.
export function startXC(flights,onResult,onProgress,onFinish,budgetMs=1000){
  const url=URL.createObjectURL(new Blob([XC_WORKER],{type:'text/javascript'})),worker=new Worker(url);
  let cursor=0,completed=0,active=null,stopped=false,timer;
  function finish(){if(stopped)return;stopped=true;clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);onFinish?.();}
  function next(){
    if(stopped)return;
    if(cursor>=flights.length){finish();return;}
    active=flights[cursor++];onProgress?.({completed,total:flights.length,active});
    timer=setTimeout(()=>{active.xcError='Calculation timed out; completed results were preserved.';finish();},Math.max(30000,budgetMs*10+10000));
    worker.postMessage({key:active.key,points:active.points,budgetMs,previous:active.xc||{}});
  }
  worker.onmessage=async({data})=>{
    if(stopped||data.key!==active?.key)return;clearTimeout(timer);
    const flight=active;
    if(data.error)flight.xcError=data.error;
    else{try{await onResult(flight,data.result,budgetMs,completed+1===flights.length);}catch(error){flight.xcError=`Save failed: ${error.message}`;finish();return;}}
    completed++;onProgress?.({completed,total:flights.length,active:null});next();
  };
  worker.onerror=event=>{if(active)active.xcError=event.message||'XC worker failed';finish();};
  next();
  return {get pending(){return Math.max(0,flights.length-completed);},get completed(){return completed;},stop:finish};
}
