// Simple test script to verify MusicJam functionality
const http = require('http');

console.log('🎵 Testing MusicJam Application...\n');

// Test server health
function testServerHealth() {
    return new Promise((resolve, reject) => {
        const req = http.get('http://localhost:3000', (res) => {
            if (res.statusCode === 200) {
                console.log('✅ Server is responding');
                resolve(true);
            } else {
                console.log(`❌ Server responded with status: ${res.statusCode}`);
                resolve(false);
            }
        });
        
        req.on('error', (err) => {
            console.log('❌ Server is not running:', err.message);
            resolve(false);
        });
        
        req.setTimeout(5000, () => {
            console.log('❌ Server response timeout');
            resolve(false);
        });
    });
}

// Test API endpoints
function testAPI() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({});
        
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/rooms',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = http.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.success && response.room && response.room.code) {
                        console.log('✅ API is working - Room created:', response.room.code);
                        resolve(true);
                    } else {
                        console.log('❌ API response invalid:', response);
                        resolve(false);
                    }
                } catch (error) {
                    console.log('❌ API response parsing failed:', error.message);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (err) => {
            console.log('❌ API test failed:', err.message);
            resolve(false);
        });
        
        req.write(postData);
        req.end();
    });
}

// Main test function
async function runTests() {
    console.log('Testing MusicJam components:\n');
    
    const serverHealth = await testServerHealth();
    const apiHealth = await testAPI();
    
    console.log('\n📊 Test Results:');
    console.log('=================');
    console.log(`Server Health: ${serverHealth ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`API Endpoints: ${apiHealth ? '✅ PASS' : '❌ FAIL'}`);
    
    if (serverHealth && apiHealth) {
        console.log('\n🎉 All tests passed! MusicJam is ready to use.');
        console.log('🌐 Visit: http://localhost:3000');
        console.log('📱 Mobile: http://YOUR-IP:3000 (replace YOUR-IP with your computer\'s IP)');
    } else {
        console.log('\n❌ Some tests failed. Check the server logs for details.');
    }
    
    process.exit(serverHealth && apiHealth ? 0 : 1);
}

// Run tests after a short delay to ensure server is ready
setTimeout(runTests, 2000);