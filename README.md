
# Device Online Status Fetch

This repository is for Yellowbow take home exercise.

## Table of Contents
1. [Get Started](#1-get-started)
2. [Preparation](#2-preparation)
3. [Implementation](#3-implementation)
4. [After Implementation & Troubleshooting](#4-after-implementation--troubleshooting)

---
### 1. Get Started
 **Clone the repository:**
   ```bash
   git clone git@github.com:HenryHuang365/Yellowbox.git
   ```
   **Install dependencies:**
   ```bash
   npm install
   ```
  **Start the server:**
   ```bash
 node server.js
   ```
**Change the API_BASE_URL and the fetch path:**
Uncomment `const  API_BASE_URL  =  "http://localhost:8080"`. 

Adjust the fetch path to different server endpoints: 
```javascript
// getDevicesOnlineStatusOne
fetch(`${API_BASE_URL}/api/one-request/${deviceId}`)
// getDevicesOnlineStatusTwo
fetch(`${API_BASE_URL}/api/unlimited-requests/${deviceId}`)
// getDevicesOnlineStatusThree
fetch(`${API_BASE_URL}/api/limited-requests/${deviceId}`)
//getDevicesOnlineStatusFour
fetch(`${API_BASE_URL}/api/limited-requests/${deviceId}`)
```

**Compile the TypeScript file: Compile Yellowbox-exercise-task-oct24.ts with TypeScript:**:
   ```bash
 tsc
   ```
**Run the compiled JavaScript file:**:
   ```bash
 node Yellowbox-exercise-task-oct24.js
   ```
**Compare the output and the mockData.json:**

### 2. Preparation

#### Reviewing the Fetch API Documentation

The first step was to review the Fetch API documentation here: [Fetch API Guide](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) to ensure the correct usage pattern and error handling for asynchronous requests. Below is a sample code from the document that guided the structure for making a request:

```javascript
async function getData() {
  const url = "https://example.org/products.json";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    const json = await response.json();
    console.log(json);
  } catch (error) {
    console.error(error.message);
  }
}
```
### Understanding API Restrictions and thinking an Approach

Before I start coding, I thorougly considered the API restriction, its significance, and the adjustments required to implement each scenario:

#### API That Allows Only One Request at a Time
- **Significance**: Only one request can be processed at a time, so I need to wait for each request to complete before proceeding to the next.
- **Approach**: I can use a `for` loop to iterate through each device ID, sending a request and awaiting its completion before moving to the next.

#### API That Allows Unlimited Requests
- **Significance**: There are no restrictions on the number of requests, which means the api can handle requests parallelly.
- **Approach**: I can use`Promise.all` to send all requests simultaneously. Since the response time is fixed to 10 seoncds and on limitation on requests, I can confidently use parallel processing (e.g., Promise.all) as all requests are guaranteed to complete within the same fixed time.

#### API That Allows a Maximum of 5 Simultaneous Requests
- **Significance**: A maximum of 5 requests can be processed at a time, with individual response times between 1 and 3 seconds.
- **Approach**: Regardless the response time, the api has a limit of 5 simultaneous requests. Therefore, I should send the requests in a batch of 5 and continue sending the next hatch until the previouse 5 requests are all finished. 

### Questions for Clarification

To ensure my undertstanding, I confirmed some key points with Hojun:

- **The api.example does not response: ** Hojun confirms that the provided api is just an example, it does not response. So I realise that I will need to implement a server to test my code. 
- **The meaning of the response times:  ** Hojun replies that the response times are not critical in the exercise, I should focus on my approach of how I handle asynchronous operations. 

### 3. Implementation

Each function was implemented differently based on the api restrictions. Here’s a breakdown of the implementation choices and justifications:

#### Function 1: `getDevicesOnlineStatusOne`
- **Restriction**: Only 1 request allowed at a time.
- **Implementation**: I used a `for` loop with `await` to sequentially send requests, ensuring each completed before the next started.
- **Justification**: Using a loop allowed me to process each device ID one at a time as required by the restriction.

#### Function 2: `getDevicesOnlineStatusTwo`
- **Restriction**: Unlimited simultaneous requests with a fixed 10-second response time.
- **Implementation**: I used `Promise.all` to send all requests in parallel.
- **Justification**: Given the fixed response time, all requests could complete in the same timeframe. `Promise.all` is the best choice to allow all requests to be sent simultaneously, which maximises efficiency.

#### Function 3: `getDevicesOnlineStatusThree` (with two variations)
- **Restriction**: A maximum of 5 simultaneous requests, with response times between 1 and 3 seconds.
- **Implementation**: Initially, I used batching by sending requests in batches of 5, waiting for each batch to complete before starting the next. After testing, I refined this approach to use a fetch queue to keep 5 requests active at all times.
- **Justification**: The batch approach works well as the response times are not critical in this exercise. But I still tried to use fetch queuing to optimise the fetching effiency. By using fetch queuing, there’s a constant flow of 5 requests, improving efficiency, especially given the variable response time for each request.

### 4. After Implementation & Troubleshooting

After implementing the functions, I created a server with three endpoints simulating different API rate limitations to ensure the accuracy of each function's logic. Additionally, a mock data file (`mockData.json`) was created to return consistent results for each device ID.

#### Server Endpoints
- **Endpoint 1**: `/api/one-request/:deviceId`
  - Simulates an API that allows only one request at a time.
```javascript
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
```
- **Endpoint 2**: `/api/unlimited-requests/:deviceId`
  - Simulates an API that allows unlimited simultaneous requests with a fixed response time of 10 seconds.
```javascript
app.get('/api/unlimited-requests/:deviceId', (req, res) => {
  const deviceId = req.params.deviceId;

  setTimeout(() => {
    res.json({ online: mockData[deviceId] || false });
  }, 10000); // Fixed 10 seconds respons time
});
```
- **Endpoint 3**: `/api/limited-requests/:deviceId`
  - Simulates an API that allows a maximum of 5 simultaneous requests with a response time varying between 1 and 3 seconds per request.
```javascript
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
  }, delay); // Random 1 to 3 seconds response time
});
```
By stimulating the restriction of the api endpoints, I am able to test my implementation and compare the output with the mockData.json to debug any errors in my initial implementation.
