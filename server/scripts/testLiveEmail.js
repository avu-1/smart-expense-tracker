// Hit the Railway app via IP directly to bypass local DNS issues
const https = require('https');

const IP = '66.33.22.193';
const HOST = 'spendwise-app-production.up.railway.app';

function request(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: IP,
      port: 443,
      path,
      method,
      headers: {
        'Host': HOST,
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('1. Logging in...');
  const login = await request('/api/auth/login', 'POST', { email: 'avu0000001@gmail.com', password: 'demo123' });
  if (!login.success) { console.error('❌ Login failed:', login); return; }
  console.log('✅ Logged in. Token:', login.accessToken?.slice(0,20) + '...');

  console.log('\n2. Adding transaction (triggers email)...');
  const tx = await request('/api/transactions', 'POST', {
    amount: 99,
    type: 'expense',
    category: 'Food',
    date: new Date().toISOString().split('T')[0],
    note: 'Debug email test',
  }, login.accessToken);

  if (tx.success) console.log('✅ Transaction created:', tx.transaction._id);
  else console.error('❌ Transaction failed:', tx);
}

main().catch(console.error);
