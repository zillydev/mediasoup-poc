import express from 'express';
import * as http from 'http';
import * as websocket from 'ws';
import { websocketconnection } from './lib/ws';

const main = () => {
    const app = express();
    const server = http.createServer(app);
    const wss = new websocket.Server({ server, path: '/ws' });

    websocketconnection(wss);

    const port = 8000;

    server.listen(port, () => {
        console.log(`Server started on http://localhost:${port}`);
    });
}

export { main }