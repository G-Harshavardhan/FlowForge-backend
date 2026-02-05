
const https = require('https');

async function diagnose() {
  console.log('🩺 Network Diagnosis Tool\n');
  
  // 1. Check Node Version
  console.log(`Checking Node.js environment: ${process.version}`);
  
  // 2. Check General Internet Connectivity (UDP/DNS)
  console.log('\n1. Testing DNS Resolution (google.com)...');
  try {
    const lookup = await new Promise((resolve, reject) => {
      require('dns').lookup('google.com', (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });
    console.log(`   ✅ Resolved: ${lookup}`);
  } catch (err) {
    console.error(`   ❌ DNS Failed: ${err.message}`);
  }

  // 3. Check HTTPS to Public API (Google)
  console.log('\n2. Testing HTTPS Connection (https://www.google.com)...');
  try {
    const res = await fetch('https://www.google.com', { method: 'HEAD' });
    console.log(`   ✅ Status: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.error(`   ❌ HTTPS Failed: ${err.message}`);
    if (err.cause) console.error('   Cause:', err.cause);
  }

  // 4. Check Unbound API Reachability (TCP Handshake only)
  console.log('\n3. Testing Unbound API Reachability (api.getunbound.ai)...');
  try {
    const req = https.request({
      hostname: 'api.getunbound.ai',
      port: 443,
      method: 'HEAD', // Light request
      timeout: 5000
    }, (res) => {
      console.log(`   ✅ Reachable (Status: ${res.statusCode})`);
    });
    
    req.on('error', (e) => {
      console.error(`   ❌ Connection Failed: ${e.message}`);
    });
    
    req.on('timeout', () => {
      req.destroy();
      console.error('   ❌ Connection Timed Out');
    });
    
    req.end();
  } catch (err) {
    console.error(`   ❌ Setup Failed: ${err.message}`);
  }

  // 5. Test Full Fetch to Unbound
  console.log('\n4. Testing Unbound API Call (fetch)...');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch('https://api.getunbound.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer c87829d8a0dd941e60fa2a2e265728f039534d4061b36f6a572159678eab3bca8829550ada87bc4f496d150dc4d0420a'
      },
      body: JSON.stringify({
        model: 'kimi-k2-instruct-0905',
        messages: [{ role: 'user', content: 'ping' }]
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    console.log(`   Response Status: ${res.status}`);
    const text = await res.text();
    console.log(`   Response Body Preview: ${text.substring(0, 100)}`);
    
    if (res.ok) console.log('   ✅ API Call Successful');
    else console.log('   ⚠️ API Call Returned Error Status');
    
  } catch (err) {
    console.error(`   ❌ API Call Failed: ${err.message}`);
    if (err.cause) console.error(`   Cause:`, err.cause);
  }
  // 6. Test Native HTTPS Request with Keep-Alive Disabled
  console.log('\n5. Testing Native HTTPS with Keep-Alive: false...');
  try {
    const data = JSON.stringify({
      model: 'kimi-k2-instruct-0905',
      messages: [{ role: 'user', content: 'ping' }]
    });

    const options = {
      hostname: 'api.getunbound.ai',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer c87829d8a0dd941e60fa2a2e265728f039534d4061b36f6a572159678eab3bca8829550ada87bc4f496d150dc4d0420a',
        'Content-Length': data.length,
        'Connection': 'close' // Force close
      },
      agent: new https.Agent({ keepAlive: false })
    };

    const req = https.request(options, (res) => {
      console.log(`   ✅ Status: ${res.statusCode}`);
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        console.log(`   Response: ${body.substring(0, 100)}`);
      });
    });

    req.on('error', (e) => {
      console.error(`   ❌ Native Request Failed: ${e.message}`);
    });

    req.write(data);
    req.end();
    
    // Wait for async
    await new Promise(r => setTimeout(r, 5000));
      } catch (err) {
    console.error(`   ❌ Setup Failed: ${err.message}`);
  }

  // 7. Test Axios
  console.log('\n6. Testing Axios...');
  try {
    const axios = require('axios');
    const res = await axios.post('https://api.getunbound.ai/v1/chat/completions', {
      model: 'kimi-k2-instruct-0905',
      messages: [{ role: 'user', content: 'ping' }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer c87829d8a0dd941e60fa2a2e265728f039534d4061b36f6a572159678eab3bca8829550ada87bc4f496d150dc4d0420a'
      },
      timeout: 10000
    });
    
    console.log(`   ✅ Status: ${res.status}`);
    console.log(`   Response: ${JSON.stringify(res.data).substring(0, 100)}`);
  } catch (err) {
    if (err.response) {
      console.log(`   ✅ Reachable (Status: ${err.response.status})`);
      console.log(`   Error Response: ${JSON.stringify(err.response.data).substring(0, 100)}`);
    } else {
      console.error(`   ❌ Axios Failed: ${err.message}`);
      if (err.code) console.error(`   Code: ${err.code}`);
    }
  }
}

diagnose();
