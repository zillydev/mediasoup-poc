import puppeteer from 'puppeteer';
import path from 'path';
import { execSync } from 'child_process';
import express from 'express';
import http from 'http';

(async () => {
  // Bundle the code with Parcel
  // execSync('parcel build agora-ts-client/index.html', { stdio: 'inherit' });
  execSync('parcel build agora-client/index.html', { stdio: 'inherit' })
  // execSync('browserify ./agora-client/main.js -o ./agora-client/app-bundle.js && live-server --port=8090 ./agora-client', { stdio: 'inherit' })
  // Create a local server
  const app = express();
  app.use(express.static(path.join(__dirname, 'dist')));
  const server = http.createServer(app);
  server.listen(1234);

  // Launch headless browser
  const browser = await puppeteer.launch({
    headless: true, // Run in headless mode
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // Open a new page
  const page = await browser.newPage();
  // page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  const clientPath = path.join(__dirname, 'dist', 'index.html');
  console.log(`Process ID: ${process.pid}`);
  await page.goto('http://localhost:1234/index.html',
    {
      waitUntil: 'networkidle2' // Wait until the network is idle
    });
  server.close();
  // await setTimeout(() => {}, 10000); 
  // await browser.close();
})();