const express = require('express');
const app = express();
const PORT = 8080;

// Load mock data
const mockData = require('./mockData.json');
const API_BEARER_TOKEN = `eyJ0eXAiOiJKadsCJhbGciOiJIy45wNiJ9.eyJpc3MiOiJ5ZWx...`

app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${API_BEARER_TOKEN}`) {
    return res.status(403).json({ error: 'Forbidden: Invalid or missing authorization token' });
  }
  next();
});

// This simulates the single request restriction
let activeRequest = false; 
// This simulates the max 5 concurrent requests
let activeRequestsCount = 0;

// The API Allows only 1 request at a time
app.get('/api/one-request/:deviceId', async (req, res) => {
  if (activeRequest) {
    return res.status(429).send({ error: 'Only one request allowed at a time.' });
  }
  activeRequest = true;

  const deviceId = req.params.deviceId;

  setTimeout(() => {
    activeRequest = false;
    res.json({ online: mockData[deviceId] || false });
  }, 1000);
});

// The API Allows unlimited simultaneous requests
app.get('/api/unlimited-requests/:deviceId', (req, res) => {
  const deviceId = req.params.deviceId;

  setTimeout(() => {
    res.json({ online: mockData[deviceId] || false });
  }, 10000);
});

// Scenario 3: Max 5 simultaneous requests with random delay between 1-3 seconds
app.get('/api/limited-requests/:deviceId', (req, res) => {
  if (activeRequestsCount >= 5) {
    return res.status(429).send({ error: 'Max 5 allowed at a time.' });
  }

  activeRequestsCount++;

  const deviceId = req.params.deviceId;

  const delay = Math.floor(Math.random() * (3000 - 1000 + 1) + 1000);
  setTimeout(() => {
    activeRequestsCount--;
    res.json({ online: mockData[deviceId] || false });
  }, delay);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
