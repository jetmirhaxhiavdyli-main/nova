// A timeout owns late successful results too; Promise.race alone leaks them.
export function captureDeadline(promise,ms,message,dispose=()=>{}){
  return new Promise((resolve,reject)=>{
    let expired=false;
    const timer=setTimeout(()=>{expired=true;reject(Error(message));},ms);
    Promise.resolve(promise).then(value=>{clearTimeout(timer);if(expired){Promise.resolve().then(()=>dispose(value)).catch(()=>{});}else resolve(value);},error=>{clearTimeout(timer);if(!expired)reject(error);});
  });
}
