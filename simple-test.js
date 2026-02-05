// Simple API test
const API = 'http://localhost:3000/api';

async function test() {
  console.log('🧪 Simple API Test\n');
  
  // Create workflow with step
  console.log('1. Creating workflow...');
  const createRes = await fetch(`${API}/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Hello Test',
      description: 'Test workflow',
      steps: [{
        name: 'Say Hello',
        model: 'kimi-k2-instruct-0905',
        prompt: 'Say "Hello World" and nothing else.',
        criteria_type: 'contains',
        criteria_value: 'Hello',
        retry_limit: 3,
        context_mode: 'full'
      }]
    })
  });
  const workflow = await createRes.json();
  console.log('   Workflow ID:', workflow.id);
  console.log('   Steps created:', workflow.steps?.length || 0);
  
  if (!workflow.steps || workflow.steps.length === 0) {
    console.log('   ❌ No steps created!');
    return;
  }
  
  // Start run
  console.log('\n2. Starting run...');
  const runRes = await fetch(`${API}/runs/start/${workflow.id}`, { method: 'POST' });
  const run = await runRes.json();
  console.log('   Run ID:', run.id);
  
  // Wait for completion
  console.log('\n3. Waiting for completion...');
  let status = 'running';
  let finalRun = null;
  const maxWait = 120000;
  const start = Date.now();
  
  while (status === 'running' && Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(`${API}/runs/${run.id}`);
    finalRun = await statusRes.json();
    status = finalRun.status;
    console.log('   Status:', status);
  }
  
  console.log('\n4. Result:');
  console.log('   Final Status:', finalRun?.status);
  console.log('   Step Status:', finalRun?.step_executions?.[0]?.status);
  console.log('   Attempts:', finalRun?.step_executions?.[0]?.attempts);
  console.log('   Output:', finalRun?.step_executions?.[0]?.output?.substring(0, 100));
  console.log('   Tokens:', finalRun?.total_tokens);
  console.log('   Cost:', finalRun?.total_cost);
  
  if (finalRun?.status === 'completed') {
    console.log('\n   ✅ TEST PASSED!');
  } else {
    console.log('\n   ❌ TEST FAILED');
    console.log('   Error:', finalRun?.step_executions?.[0]?.error);
  }
}

test().catch(console.error);
