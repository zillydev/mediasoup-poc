import WebSocket from 'ws';
import { createRouter } from './worker';
import { Consumer, Producer, Router, Transport } from 'mediasoup/node/lib/types';
import { createWebRtcTransport } from './createWebRtcTransport';

let mediasoupRouter: Router;
let producerTransport: Transport;
let consumerTransport: Transport;
let producers: Producer[] = [];
let consumers: Consumer[] = [];

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
                    produce(ws, event);
                    break;
                case 'createConsumerTransport':
                    createConsumerTransport(ws, event);
                    break;
                case 'connectConsumerTransport':
                    connectConsumerTransport(ws, event);
                    break;  
                case 'resume':
                    resume(ws, event);
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

// Helper functions

// Send router RTP capabilities to client
const getRouterRtpCapabilities = (ws: WebSocket, event: any) => {
    send(ws, 'routerRtpCapabilities', mediasoupRouter.rtpCapabilities);
}

// Create producer transport
const createProducerTransport = async (ws: WebSocket, event: any) => {
    try {
        const { transport, params } = await createWebRtcTransport(mediasoupRouter);
        producerTransport = transport;
        send(ws, 'producerTransport', params);
    } catch (error) {
        console.error(error);
    }
}

// Connect producer transport
const connectProducerTransport = async (ws: WebSocket, event: any) => {
    await producerTransport.connect({ dtlsParameters: event.dtlsParameters });
    send(ws, 'producerTransportConnected', 'producer transport connected');
}

// When a producer is created
const produce = async (ws: WebSocket, event: any) => {
    const { kind, rtpParameters } = event;
    let producer = await producerTransport.produce({ kind, rtpParameters });
    producers.push(producer);
    send(ws, 'produced', { id: producer.id });
}

// Create consumer transport
const createConsumerTransport = async (ws: WebSocket, event: any) => {
    try {
        const { transport, params } = await createWebRtcTransport(mediasoupRouter);
        consumerTransport = transport;
        send(ws, 'consumerTransport', params);
    } catch (error) {
        
    }
}

// Connect consumer transport
const connectConsumerTransport = async (ws: WebSocket, event: any) => {
    await consumerTransport.connect({ dtlsParameters: event.dtlsParameters });
    send(ws, 'consumerTransportConnected', 'consumer transport connected');
}

// Consume all available producers
const consume = async (ws: WebSocket, event: any) => {
    for (const producer of producers) {
        const res = await createConsumer(producer, event.rtpCapabilities);
        send(ws, 'consumed', res);
    }
}

// Resume consumer
const resume = async (ws: WebSocket, event: any) => {
    const consumer = consumers.find(consumer => consumer.id === event.id);
    await consumer.resume();
}

// Send message to client
const send = (ws: WebSocket, type: string, msg: any) => {
    const message = JSON.stringify({
        type,
        data: msg,
    });
    ws.send(message);
}

// Create server side consumer
const createConsumer = async (producer: Producer, rtpCapabilities: any) => {
    if (!mediasoupRouter.canConsume({ producerId: producer.id, rtpCapabilities })) {
        console.error('can not consume');
        return;
    }
    const consumer = await consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === 'video',
    });
    consumers.push(consumer);

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