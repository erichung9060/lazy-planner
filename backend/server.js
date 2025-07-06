import { Cloudflare } from 'cloudflare';
import express from 'express';
import http from 'http';
import { Server as socketIo } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';


dotenv.config();
const KV_NS = process.env.CF_KV_NAMESPACE_ID;
const CF_ACCOUNT = process.env.CF_ACCOUNT_ID
const cf = new Cloudflare({ apiToken: process.env.CF_KV_API_TOKEN, accountId: CF_ACCOUNT });


async function getPlan(key) {
    try {
        const resp = await cf.kv.namespaces.values.get(KV_NS, key, { 
            account_id: CF_ACCOUNT
        });
        
        const data = await resp.json();
        return data.plan;
    } catch (error) {
        return null;
    }
}

async function savePlan(key, value) {
    return cf.kv.namespaces.values.update(KV_NS, key, {
        account_id: CF_ACCOUNT,
        plan: JSON.stringify(value),
    });
}

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new socketIo(server, { cors: { origin: '*' } });

io.on('connection', async (socket) => {
    const userId = socket.handshake.query.id;
    socket.join(userId);
    console.log('user connected', userId);

    let plan = {};
    const restore_plan = await getPlan(userId);
    if(restore_plan){
        plan = JSON.parse(restore_plan);
        socket.emit('plans:update', plan);
        console.log('plan restored');
    }
    
    socket.on('plans:change', async (newPlans) => {
        console.log("plans changed from", userId);
        io.to(userId).emit('plans:update', newPlans);
        console.log("plans update to", userId);
        savePlan(userId, newPlans);
    });
});

app.post('/api/aiplanning', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const payload = req.body;
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        res.json(data.candidates[0].content.parts[0].text);
    } catch (error) {
        console.log('error', error);
        res.status(500).json({ error: 'Failed to fetch from Gemini API', details: error.message });
    }
});

const PORT = 3001;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));