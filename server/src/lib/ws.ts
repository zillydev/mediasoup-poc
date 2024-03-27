import WebSocket from 'ws';
import { createRouter } from './worker';
import { Consumer, Producer, Router, Transport } from 'mediasoup/node/lib/types';
import { createWebRtcTransport } from './createWebRtcTransport';

let mediasoupRouter: Router;
let producerTransport: Transport;
let consumerTransport: Transport;
let producer: Producer;
let consumer: Consumer;

const websocketconnection = async (websock: WebSocket.Server) => {
    try {
        mediasoupRouter = await createRouter();
    } catch (error) {
        throw error;
    }

    websock.on('connection', (ws: WebSocket) => {
        ws.on('message', (message: string) => {
            const event = JSON.parse(message);

            switch(event.type) {
                case 'getRouterRtpCapabilities':
                    getRouterRtpCapabilities(ws, event);
                    break;
                case 'createProducerTransport':
                    createProducerTransport(ws, event);
                    break;
                case 'connectProducerTransport':
                    connectProducerTransport(ws, event);
                    break;
                case 'produce':
                    produce(ws, websock, event);
                    break;
                case 'createConsumerTransport':
                    createConsumerTransport(ws, event);
                    break;
                case 'connectConsumerTransport':
                    connectConsumerTransport(ws, event);
                    break;  
                case 'resume':
                    resume(ws);
                    break;
                case 'consume':
                    consume(ws, event);
                    break;
                default:
                    break;
            }
        });
    });
}

const  getRouterRtpCapabilities = (ws: WebSocket, event: any) => {
    send(ws, 'routerRtpCapabilities', mediasoupRouter.rtpCapabilities);
}

const createProducerTransport = async (ws: WebSocket, event: any) => {
    try {
        const { transport, params } = await createWebRtcTransport(mediasoupRouter);
        producerTransport = transport;
        send(ws, 'producerTransport', params);
    } catch (error) {
        console.error(error);
    }
}

const connectProducerTransport = async (ws: WebSocket, event: any) => {
    await producerTransport.connect({ dtlsParameters: event.dtlsParameters });
    send(ws, 'producerTransportConnected', 'producer transport connected');
}

const produce = async (ws: WebSocket, websocket: WebSocket.Server, event: any) => {
    const { kind, rtpParameters } = event;
    producer = await producerTransport.produce({ kind, rtpParameters });
    send(ws, 'produced', { id: producer.id });
    broadcast(websocket, 'newProducer', 'new producer');
}

const createConsumerTransport = async (ws: WebSocket, event: any) => {
    try {
        const { transport, params } = await createWebRtcTransport(mediasoupRouter);
        consumerTransport = transport;
        send(ws, 'consumerTransport', params);
    } catch (error) {
        
    }
}

const connectConsumerTransport = async (ws: WebSocket, event: any) => {
    await consumerTransport.connect({ dtlsParameters: event.dtlsParameters });
    send(ws, 'consumerTransportConnected', 'consumer transport connected');
}

const resume = async (ws: WebSocket) => {
    await consumer.resume();
    send(ws, 'resumed', 'resumed');
}

const consume = async (ws: WebSocket, event: any) => {
    const res = await createConsumer(producer, event.rtpCapabilities);
    send(ws, 'consumed', res);
}

const broadcast = async (ws: WebSocket.Server, type: string, msg: any) => {
    const message = JSON.stringify({
        type,
        data: msg,
    });
    ws.clients.forEach(client => {
        client.send(message);
    });
}

const send = (ws: WebSocket, type: string, msg: any) => {
    const message = JSON.stringify({
        type,
        data: msg,
    });
    ws.send(message);
}

const createConsumer = async (producer: Producer, rtpCapabilities: any) => {
    if (!mediasoupRouter.canConsume({ producerId: producer.id, rtpCapabilities })) {
        console.error('can not consume');
        return;
    }
    consumer = await consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === 'video',
    });

    //TODO: implement simulcast

    return {
        producerId: producer.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
    }
};

export { websocketconnection }