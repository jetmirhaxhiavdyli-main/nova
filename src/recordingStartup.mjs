/** Open independent inputs together; release both, including late results, on failure. */
export async function prepareRecordingInputs(inputs,openScreen,onTiming=()=>{}) {
  let failed=false,screen;
  const began=performance.now();
  const devices=Promise.resolve().then(()=>inputs.prepare()).then(value=>{
    onTiming('devices',performance.now()-began);
    if(failed)inputs.release();
    return value;
  });
  const capture=Promise.resolve().then(openScreen).then(value=>{
    onTiming('screen',performance.now()-began);
    screen=value;
    if(failed)value.dispose();
    return value;
  });
  try{const [ready,captured]=await Promise.all([devices,capture]);return {devices:ready,capture:captured};}
  catch(error){failed=true;inputs.release();screen?.dispose();throw error;}
}
