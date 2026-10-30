import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rename, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';

const shell=process.env.PWSH || (process.platform==='win32'?'powershell.exe':null);
const source=await readFile(new URL('./native-blur-probe.js',import.meta.url),'utf8');
const worker=source.match(/const capturePS = String.raw`([\s\S]*?)`;/)[1];

// Run the shipped transport in another process. Substitute only desktop capture;
// keep real PowerShell parsing, file handles, JSON, atomic publication and stop IO.
const fixture=String.raw`param([string]$Directory,[string]$Source)
$ErrorActionPreference = 'Stop'
$worker = Get-Content -Raw -Encoding UTF8 -LiteralPath $Source
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput($worker,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$loop = $ast.Find({ param($n) $n -is [System.Management.Automation.Language.WhileStatementAst] },$true)
$start = $ast.Find({ param($n)
 $n -is [System.Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -eq '$utf8'
},$true).Extent.StartOffset
$capture = $loop.Body.Statements | Where-Object {
 $_ -is [System.Management.Automation.Language.TryStatementAst] -and $_.Body.Extent.Text.Contains("'verify-window'")
}
$outer = $ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] }
if (!$loop -or !$start -or !$capture -or !$outer) { throw 'Worker transport boundaries missing' }
$replacement = @'
{
 $stage = 'synthetic-capture'
 $held.Add([IO.File]::Open($requestPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
 if ($previousResponse) {
  $held.Add([IO.File]::Open($previousResponse,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read))
 }
 $previousResponse = $responsePath
 $answer.fixture = 'transport-only'
}
'@
$offset = $capture.Body.Extent.StartOffset - $loop.Extent.StartOffset
$transport = $worker.Substring($start,$loop.Extent.StartOffset-$start) +
 $loop.Extent.Text.Remove($offset,$capture.Body.Extent.Text.Length).Insert($offset,$replacement)
$held = New-Object 'System.Collections.Generic.List[System.IO.Stream]'
$previousResponse = $null
$stage = 'fixture-start'
$script = 'try {' + $transport + '} catch ' + $outer.CatchClauses[0].Body.Extent.Text +
 ' finally { foreach ($stream in $held) { $stream.Dispose() } }'
& ([scriptblock]::Create($script))
`;

async function startWorker(t) {
  const directory=await mkdtemp(join(tmpdir(),'zen-blur-ipc-fixture-'));
  const workerPath=join(directory,'worker.ps1'),runner=join(directory,'fixture.ps1');
  await writeFile(workerPath,worker);await writeFile(runner,fixture);
  const child=spawn(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',runner,'-Directory',directory,'-Source',workerPath]);
  let state,output='';
  child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  const finished=new Promise(resolve=>{
    child.once('error',error=>{state={error};resolve(state);});
    child.once('exit',(code,signal)=>{state={code,signal};resolve(state);});
  });
  const stop=async()=>{
    await writeFile(join(directory,'stop'),'stop');
    for(let n=0;n<200&&!state;n++)await delay(25);
    if(!state){child.kill();await finished;throw Error('Worker ignored stop');}
    return state;
  };
  t.after(async()=>{
    try { if(!state)await stop(); }
    finally { await rm(directory,{recursive:true,force:true}); }
  });
  const read=async name=>{
    for(let n=0;n<400;n++) {
      try { return JSON.parse(await readFile(join(directory,name),'utf8')); }
      catch(error){if(error.code!=='ENOENT')throw error;}
      if(state)throw Error('Worker exited: '+JSON.stringify(state)+' '+output);
      await delay(25);
    }
    throw Error('Worker response timed out: '+output);
  };
  return {directory,read,stop,finished,get output(){return output;}};
}

test('PowerShell transport completes 32 cases while old requests/replies stay reader-locked',
  {skip:!shell,timeout:25000},async t=>{
    const e=await startWorker(t);
    for(let id=1;id<=32;id++) {
      const number=String(id).padStart(2,'0'),temp=join(e.directory,'request-'+number+'.tmp');
      const request=join(e.directory,'request-'+number+'.json');
      const text=JSON.stringify({id,fixture:true});
      if(id===2) {
        await writeFile(temp,text.slice(0,5),{flag:'wx'});await delay(150);
        await assert.rejects(readFile(join(e.directory,'response-02.json')),error=>error.code==='ENOENT');
        await writeFile(temp,text.slice(5),{flag:'a'});
      } else await writeFile(temp,text,{flag:'wx'});
      await rename(temp,request);
      const reply=await e.read('response-'+number+'.json');
      assert.equal(reply.id,id);assert.equal(reply.error,null);assert.equal(reply.fixture,'transport-only');
      if(process.platform==='win32' && id<=2) {
        // Reproduce the old replacement failure with an actual non-delete-sharing
        // Windows reader, then continue using the unaffected per-case protocol.
        const collision=join(e.directory,'collision-'+id+'.tmp');await writeFile(collision,'replacement');
        const held=join(e.directory,id===1?'request-01.json':'response-01.json');
        await assert.rejects(rename(collision,held),error=>['EPERM','EACCES','EBUSY'].includes(error.code));
      }
    }
    assert.equal((await e.stop()).code,0,e.output);
    assert.equal((await e.read('request-01.json')).id,1);
    assert.equal((await e.read('response-32.json')).id,32);
  });

for(const [name,payload,message] of [
  ['malformed JSON','{',null],['wrong ID',JSON.stringify({id:2}),'Capture request id mismatch'],
])test('PowerShell transport reports '+name+' without silent polling',{skip:!shell,timeout:15000},async t=>{
  const e=await startWorker(t);
  await writeFile(join(e.directory,'request-01.tmp'),payload);
  await rename(join(e.directory,'request-01.tmp'),join(e.directory,'request-01.json'));
  const fatal=await e.read('fatal.json');
  assert.equal(fatal.failure.stage,'read-request');assert.ok(fatal.failure.line>0);assert.ok(fatal.failure.id);
  if(message)assert.equal(fatal.error,message);
  assert.equal((await e.finished).code,1,e.output);
  await assert.rejects(readFile(join(e.directory,'response-01.json')),error=>error.code==='ENOENT');
});
