const mediasoup = require('mediasoup-client');

const websocketURL = 'ws://localhost:8000/ws';

const { APP_ID, CHANNEL, TOKEN } = require('./config.js');

const client = AgoraRTC.createClient({mode:'rtc', codec:'vp8'});

let socket, device;
let sendTransport;

let previousTimestamp = null;

const calculateLatency = (stats) => {
    if (previousTimestamp === null) {
        previousTimestamp = stats.timestamp;
        return 0;
    }

    const latency = stats.timestamp - previousTimestamp;
    previousTimestamp = stats.timestamp;

    return latency;
}

const latencyTest = async () => {
    const stats = await webRtcTransport.getStats();
    const latency = calculateLatency(stats[0]);
    console.log(`Latency: ${latency} ms`);
}

// Create a WebSocket connection to the server
const createSocketConnection = () => {
    socket = new WebSocket(websocketURL);

    socket.onopen = () => {
        console.log('WebSocket connection opened');

        const message = {
            type: 'getRouterRtpCapabilities',
        }
        socket.send(JSON.stringify(message));
    };

    // Handle messages from the server
    socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);

        switch (message.type) {
            case 'getRouterRtpCapabilities':
                getRouterRtpCapabilities(message.data);
                break;
            case 'createProducerTransport':
                createProducerTransport(message.data);
                break;
        }
    };

    socket.onclose = () => {
        console.log('WebSocket connection closed');
    };
}

// When the router RTP capabilities are received
const getRouterRtpCapabilities = async (routerRtpCapabilities) => {
    // Create a device and load it with the router RTP capabilities
    device = new mediasoup.Device();
    await device.load({ routerRtpCapabilities });

    // Send a message to the server to create a producer transport
    const message = {
        type: 'createProducerTransport',
        forceTcp: false,
        rtpCapabilities: device.rtpCapabilities,
    }
    socket.send(JSON.stringify(message));
}

// let handleUserJoined = (user) => {}
// let handleUserLeft = (user, reason) => {}

// When a user publishes a track
let handleUserTrackPublished = async (user, mediaType) => {
    console.log('Track published');

    await client.subscribe(user, mediaType);
    let subscriptionsArray = client._p2pChannel.store.state.keyMetrics.subscribe;
    console.log(subscriptionsArray);
    let subscription = subscriptionsArray.find(obj => obj.userId === user.uid && obj.type === mediaType);
    if (subscription.producerId !== undefined) {
        const message = {
            type: 'resumeProducer',
            producerUserId: user.uid,
            producerId: subscription.producerId
        }
        socket.send(JSON.stringify(message));
    } else {
        // Create a local producer for the subscribed track
        let producerId = crypto.randomUUID();
        await sendTransport.produce({ 
            id: producerId, 
            track: user[`${mediaType}Track`].getMediaStreamTrack(), 
            appData: { producerId, userId: user.uid}
        });

        subscription.producerId = producerId;
    }
}

// When a user unpublishes a track
let handleUserTrackUnpublished = async (user, mediaType) => {
    console.log('Track unpublished');

    let subscriptionsArray = client._p2pChannel.store.state.keyMetrics.subscribe;
    console.log(subscriptionsArray);
    let object = subscriptionsArray.find(obj => obj.userId === user.uid && obj.type === mediaType);
    await client.unsubscribe(user, mediaType);
    const message = {
        type: 'pauseProducer',
        producerUserId: user.uid,
        producerId: object.producerId
    }
    socket.send(JSON.stringify(message));
}

let handleUserLeft = async (user, reason) => {
    const message = {
        type: 'closeProducerTransport',
        id: sendTransport.id
    }

    //TODO
}

// When the producer transport is created
const createProducerTransport = async (transportParams) => {
    // Create a local producer transport
    sendTransport = device.createSendTransport(transportParams);

    // When the local transport connects
    sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        // Send a message to the server to connect the corresponding server-side producer transport
        const message = {
            type: 'connectProducerTransport',
            dtlsParameters,
        }
        socket.send(JSON.stringify(message));

        // When the local transport and the corresponding server-side transport are connected
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'producerTransportConnected') {
                callback();
                // Start the latency test every 2 minutes
                setInterval(latencyTest, 2 * 60 * 1000);
            }
        });
    });

    // When the local transport produces a track
    sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        // Send a message to the server to create a corresponding server-side producer
        const message = {
            type: 'createProducer',
            id: appData.producerId,
            userId: appData.userId,
            kind,
            rtpParameters
        }
        socket.send(JSON.stringify(message));

        // When the server-side producer is created
        socket.addEventListener('message', async (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'producerCreated') {
                callback({ id: message.producerId });
            }
        });
    });

    sendTransport.on('connectionstatechange', (state) => {
        switch (state) {
            case 'connecting':
                console.log('Producer transport connecting');
                break;
            case 'connected':
                console.log('Producer transport connected');
                break;
            case 'failed':
                sendTransport.close();
                console.log('Producer transport failed');
                break;
            default:
                console.error('Producer transport state:', state);
        }
    });

    // client.on('user-joined', handleUserJoined);
    // client.on('user-left', handleUserLeft);
    client.on('user-published', handleUserTrackPublished);
    client.on('user-unpublished', handleUserTrackUnpublished);
    client.on('user-left', handleUserLeft);
    client.join(APP_ID, CHANNEL, TOKEN, null);
}

createSocketConnection();

/* // Close the producer transport and leave the channel when the window is closed
window.onunload = () => {
    client.leave();
    // Triggers a "transportclose" event in all its producers and consumers
    sendTransport.close();
    socket.send(JSON.stringify({ type: 'closeProducerTransport', id: sendTransport.id}));
} */