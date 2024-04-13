import WebSocket from 'ws';
import { createRouter } from './worker';
import { Consumer, Producer, Router, Transport } from 'mediasoup/node/lib/types';
import { createWebRtcTransport } from './createWebRtcTransport';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';

let mediasoupRouter: Router;
let producerTransport: Transport;

class Host {
    userId: string;
    producers: Producer[];
}

class Client {
    userId: string;
    consumerTransport: Transport;
    consumers: Consumer[];
}

let hosts: Host[] = [];
let clients: Client[] = [];

const websocketconnection = async (websock: WebSocket.Server) => {
    try {
        mediasoupRouter = await createRouter();
    } catch (error) {
        throw error;
    }

    websock.on('connection', (ws: WebSocket) => {
        // TODO: implement websocket protocols
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
                /* case 'closeProducerTransport':
                    // producerTransport.close();
                    closeProducerTransport(event.id);
                    break; */
                case 'createProducer':
                    createProducer(websock, ws, event);
                    break;
                case 'createConsumerTransport':
                    createConsumerTransport(ws, event);
                    break;
                case 'connectConsumerTransport':
                    connectConsumerTransport(ws, event);
                    break;
                case 'closeConsumerTransport':
                    closeConsumerTransport(ws, event);
                    break;
                case 'resumeConsumer':
                    resumeConsumer(event);
                    break;
                case 'consumeAllProducers':
                    consumeAllProducers(ws, event);
                    break;
                case 'consumeProducer':
                    consumeProducer(ws, event);
                    break;
                case 'pauseProducer':
                    pauseProducer(websock, ws, event);
                    break;
                case 'resumeProducer':
                    resumeProducer(websock, ws, event);
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
    send(ws, 'getRouterRtpCapabilities', mediasoupRouter.rtpCapabilities);
}

// Create producer transport
const createProducerTransport = async (ws: WebSocket, event: any) => {
    try {
        const { transport, params } = await createWebRtcTransport(mediasoupRouter);
        producerTransport = transport;
        send(ws, 'createProducerTransport', params);
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
const createProducer = async (websock: WebSocket.Server, ws: WebSocket, event: any) => {
    const { id, userId, kind, rtpParameters } = event;
    let producer = await producerTransport.produce({ id, kind, rtpParameters, appData: { userId } });

    // When the producer transport is closed, close the producer and remove it from the array
    // producer.on('transportclose', () => {
    //     producers = producers.filter(p => p.id !== producer.id);
    //     producer.close();
    // });

    let host = hosts.find(host => host.userId === userId);
    if (host) {
        host.producers.push(producer);
    } else {
        hosts.push({ userId, producers: [producer]});
    }
    broadcast(websock, 'producerCreated', { producerUserId: userId, producerId: producer.id });
}

const closeProducerTransport = (id: string) => {
    producerTransport.close();
}

// Create consumer transport
const createConsumerTransport = async (ws: WebSocket, event: any) => {
    try {
        // TODO: create a new transport everytime
        const { transport, params } = await createWebRtcTransport(mediasoupRouter);
        clients.push({ userId: event.userId, consumerTransport: transport, consumers: [] })
        send(ws, 'createConsumerTransport', params);
    } catch (error) {
        
    }
}

// Connect consumer transport
const connectConsumerTransport = async (ws: WebSocket, event: any) => {
    let consumerTransport = clients.find(c => c.userId === event.userId).consumerTransport;
    await consumerTransport.connect({ dtlsParameters: event.dtlsParameters });
    send(ws, 'consumerTransportConnected', 'consumer transport connected');
}

const closeConsumerTransport = async (ws: WebSocket, event: any) => {
    clients.filter(client => client.consumerTransport.id !== event.id);
}

// Consume all available producers
const consumeAllProducers = async (ws: WebSocket, event: any) => {
    for (const host of hosts) {
        for (const producer of host.producers) {
            const res = await createConsumer(producer, event.rtpCapabilities, event.userId);
            send(ws, 'consumeProducer', res);
        }
    }
}

const consumeProducer = async (ws: WebSocket, event: any) => {
    let host = hosts.find(host => host.userId === event.producerUserId);
    let producer = host.producers.find(p => p.id === event.producerId);
    const res = await createConsumer(producer, event.rtpCapabilities, event.userId);
    send(ws, 'consumeProducer', res);
}

// Pause producer
const pauseProducer = async (websock: WebSocket.Server, ws: WebSocket, event: any) => {
    let host = hosts.find(host => host.userId === event.producerUserId);
    let producer = host.producers.find(p => p.id === event.producerId);
    for (const client of clients) {
        const consumer = client.consumers.find(c => c.producerId === producer.id);
        await consumer.pause();
        broadcast(websock, 'producerPaused', consumer.id);
    }
}

const resumeProducer = async (websock: WebSocket.Server, ws: WebSocket, event: any) => {
    let host = hosts.find(host => host.userId === event.producerUserId);
    let producer = host.producers.find(p => p.id === event.producerId);
    for (const client of clients) {
        const consumer = client.consumers.find(c => c.producerId === producer.id);
        await consumer.resume();
        broadcast(websock, 'producerResumed', consumer.id);
    }
}

// Resume consumer
const resumeConsumer = async (event: any) => {
    let client = clients.find(c => c.userId === event.userId);
    const consumer = client.consumers.find(consumer => consumer.id === event.id);
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
const createConsumer = async (producer: Producer, rtpCapabilities: RtpCapabilities, userId: string) => {
    if (!mediasoupRouter.canConsume({ producerId: producer.id, rtpCapabilities })) {
        console.error('can not consume');
        return;
    }
    let client = clients.find(c => c.userId === userId);
    const consumer = await client.consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities: rtpCapabilities,
        paused: producer.kind === 'video',
    });

    client.consumers.push(consumer);

    // When the producer is closed, close the consumer and remove it from the array
    // consumer.on('producerclose', () => {
    //     consumers = consumers.filter(c => c.id !== consumer.id);
    //     consumer.close();
    //     console.log('closing consumer', consumer.id);
    // });

    //TODO: implement simulcast

    return {
        producerId: producer.id,
        id: consumer.id,
        producerUserId: producer.appData.userId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
    }
};

// broadcast to all clients
const broadcast = (ws: WebSocket.Server, type: string, msg: any) => {
    ws.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            send(client, type, msg);
        }
    });
}

export { websocketconnection }