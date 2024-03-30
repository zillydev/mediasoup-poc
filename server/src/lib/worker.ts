import * as mediasoup from 'mediasoup';
import { Worker } from 'mediasoup/node/lib/types';

import { config } from '../config';

// const worker: Array<{
//     worker: Worker,
// }> = [];

// let nextMediasoupWorkerIdx = 0;

const createRouter = async () => {
    const worker = await mediasoup.createWorker({
        logLevel: config.mediasoup.worker.logLevel,
        logTags: config.mediasoup.worker.logTags,
        rtcMinPort: config.mediasoup.worker.rtcMinPort,
        rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
    });

    worker.on('died', () => {
        console.error('mediasoup Worker died, exiting 1...');
        process.exit(1);
    });

    const mediaCodecs = config.mediasoup.router.mediaCodecs;
    const router = await worker.createRouter({ mediaCodecs });
    return router;
}

export { createRouter };