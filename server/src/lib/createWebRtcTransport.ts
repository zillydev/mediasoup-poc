import { config } from '../config';
import { Router } from 'mediasoup/node/lib/types';

const createWebRtcTransport = async (mediasoupRouter: Router) => {
    const {
        maxIncomingBitrate,
        initialAvailableOutgoingBitrate,
    } = config.mediasoup.webRtcTransport;

    const transport = await mediasoupRouter.createWebRtcTransport({
        listenIps: config.mediasoup.webRtcTransport.listenIps,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        preferTcp: false,
        initialAvailableOutgoingBitrate,
    });

    if (maxIncomingBitrate) {
        try {
            await transport.setMaxIncomingBitrate(maxIncomingBitrate);
        } catch (error) {
            throw error;
        }
    }

    return {
        transport,
        params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
        }
    }
}

export { createWebRtcTransport }