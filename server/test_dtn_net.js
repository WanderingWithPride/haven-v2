const fetch = require('node-fetch').default || require('node-fetch');
const https = require('https');
const dgram = require('dgram');

async function testFetch() {
    console.log('Testing HTTPS agent fetch back to localhost:8443...');
    const agent = new https.Agent({ rejectUnauthorized: false });
    try {
        const res = await fetch('https://127.0.0.1:8443/api/dtn/packets', {
            agent: agent,
            timeout: 5000
        });
        const data = await res.json();
        console.log('HTTPS Fetch Success! Packets found:', data.packets ? data.packets.length : 0);
    } catch (e) {
        console.error('HTTPS Fetch Error:', e.message);
    }
}

function testUdp() {
    console.log('Testing UDP broadcast to 255.255.255.255:8887...');
    const udpClient = dgram.createSocket('udp4');
    udpClient.bind(() => {
        try {
            udpClient.setBroadcast(true);
            const msg = Buffer.from(JSON.stringify({ cyberdtn: true }));
            udpClient.send(msg, 0, msg.length, 8887, '255.255.255.255', (err) => {
                if (err) console.error('UDP Send Error:', err.message);
                else console.log('UDP Broadcast to 255.255.255.255 Success!');
                udpClient.close();
            });
        } catch (e) {
            console.error('UDP Setup Error:', e.message);
            udpClient.close();
        }
    });
}

testFetch().then(() => testUdp());
