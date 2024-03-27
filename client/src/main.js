const mediasoup = require('mediasoup-client');
const uuidv4 = require('uuid');

const websocketURL = 'ws://localhost:8000/ws';

const APP_ID = "d71fc74e8f6f4f59a3887902bcaeb1e7"
const TOKEN = "007eJxTYPgXvGpRmvPP/0+s7lvs2bGxXUz64YwdwbaVkg2LPNpdzigpMKSYG6Ylm5ukWqSZpZmkmVomGltYmFsaGCUlJ6YmGaaaC6WzpDUEMjLo6fgzMEIhiM/CkJuYmcfAAACpQh8b"
const APP_CERTIFICATE = "5ced2d504ae94850add338b253aadf64"
const CHANNEL = "main"

const client = AgoraRTC.createClient({mode:'rtc', codec:'vp8'})

let socket, device;
let startBtn;
let subscribeButton;
let localVideo;
let remoteVideo;
let testVideo;
let testAudio;

let producer;
let consumerTransport;
let remoteStream;

document.addEventListener('DOMContentLoaded', async () => {
    startBtn = document.getElementById('startButton');
    subscribeButton = document.getElementById('subscribeButton');
    localVideo = document.getElementById('localVideo');
    remoteVideo = document.getElementById('remoteVideo');

    startBtn.addEventListener('click', start);
    subscribeButton.addEventListener('click', subscribe);

    await joinStream()
});

let joinAndDisplayLocalStream = async () => {

    client.on('user-published', handleUserJoined)
    
    let UID = await client.join(APP_ID, CHANNEL, TOKEN, null)
}

let joinStream = async () => {
    await joinAndDisplayLocalStream()
}

let handleUserJoined = async (user, mediaType) => {
    await client.subscribe(user, mediaType)

    if (mediaType === 'video'){
        testVideo = user.videoTrack
    }

    if (mediaType === 'audio'){
        testAudio = user.audioTrack
    }
}

async function start() {
    // await joinStream()
    const message = {
        type: 'createProducerTransport',
        forceTcp: false,
        rtpCapabilities: device.rtpCapabilities,
    }

    socket.send(JSON.stringify(message));
}

async function subscribe() {
    const message = {
        type: 'createConsumerTransport',
        forceTcp: false,
    }

    socket.send(JSON.stringify(message));
}

const createSocketConnection = () => {
    socket = new WebSocket(websocketURL);

    socket.onopen = () => {
        console.log('WebSocket connection opened');
        const message = {
            type: 'getRouterRtpCapabilities',
        }

        socket.send(JSON.stringify(message));
    };

    socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);

        switch (message.type) {
            case 'routerRtpCapabilities':
                onRouterRtpCapabilities(message.data);
                break;
            case 'producerTransport':
                onProducerTransport(message.data);
                break;
            case 'consumerTransport':
                onConsumerTransport(message.data);
                break;
            case 'resumed':
                console.log('Consumer resumed');
                break;
            case 'consumed':
                console.log('Consumed');
                onConsumed(message.data);
                break;
            default:
                break;
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

const onRouterRtpCapabilities = async (routerRtpCapabilities) => {
    device = new mediasoup.Device();
    await device.load({ routerRtpCapabilities });
}

const onProducerTransport = async (data) => {
    const transport = device.createSendTransport(data);
    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        const message = {
            type: 'connectProducerTransport',
            dtlsParameters,
        }

        socket.send(JSON.stringify(message));
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'producerTransportConnected') {
                callback();
            }
        });
    });

    transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        console.log('Produce event:', kind, rtpParameters);
        const message = {
            type: 'produce',
            transportId: transport.id,
            kind,
            rtpParameters,
        }

        socket.send(JSON.stringify(message));
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'produced') {
                callback({ id: message.id });
            }
        });
    });

    transport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connecting':
                console.log('Producer transport connecting');
                break;
            case 'connected':
                localVideo.srcObject = stream;
                testAudio.play()
                // stream.play(localVideo)
                console.log('Producer transport connected');
                break;
            case 'failed':
                transport.close();
                console.log('Producer transport failed');
                break;
            default:
                console.error('Producer transport state:', state);
        }
    });

    /* let stream;
    try {
        stream = await getUserMedia();
        const track = stream.getVideoTracks()[0];
        console.log(track);
        const params = { track };

        producer = await transport.produce(params);
    } catch (error) {
        console.error('Error while creating producer:', error);
    } */
    let stream;
    try {
        console.log("stream:::::", testVideo.getMediaStreamTrack());
        const track = testVideo.getMediaStreamTrack();
        stream = new MediaStream();
        stream.addTrack(track);
        const params = { track };
        producer = await transport.produce(params);
    } catch (error) {
        console.error('Error while creating producer:', error);
    }
}

const onConsumerTransport = async (data) => {
    consumerTransport = device.createRecvTransport(data);
    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        const message = {
            type: 'connectConsumerTransport',
            transportId: consumerTransport.id,
            dtlsParameters,
        }

        socket.send(JSON.stringify(message));
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'consumerTransportConnected') {
                callback();
            }
        });
    });

    consumerTransport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connecting':
                console.log('Consumer transport connecting');
                break;
            case 'connected':
                console.log('Consumer transport connected');
                remoteVideo.srcObject = remoteStream;
                testAudio.play()
                // remoteStream.play(remoteVideo)
                const message = {
                    type: 'resume'
                }
                socket.send(JSON.stringify(message));
                break;
            case 'failed':
                consumerTransport.close();
                console.log('Consumer transport failed');
                break;
            default:
                console.error('Consumer transport state:', state);
        }
    });
    
    consume();
}

const onConsumed = async (data) => {
    const { producerId, id, kind, rtpParameters } = data;
    console.log("id:::::", id);
    const consumer = await consumerTransport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
    });

    console.log(`Consumer track: ${consumer.track}`)

    const stream = new MediaStream();
    stream.addTrack(consumer.track);

    remoteStream = stream;
    // remoteStream = consumer.track;
}

const consume = async () => {
    const { rtpCapabilities } = device;

    const message = {
        type: 'consume',
        rtpCapabilities,
    }
    socket.send(JSON.stringify(message));
}

createSocketConnection();
