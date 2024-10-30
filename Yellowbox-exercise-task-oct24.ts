// const API_BASE_URL = "https://api.example.com/deviceOnlineStatus"
const API_BASE_URL = "http://localhost:8080"
const API_BEARER_TOKEN = `eyJ0eXAiOiJKadsCJhbGciOiJIy45wNiJ9.eyJpc3MiOiJ5ZWx...`

// - An authorised GET request to https://api.example.com/deviceOnlineStatus/{deviceId} API will
//   return a JSON body containing a single boolean true or false value.
// - You must use this API to construct a map from device IDs to true or false values depending
//   whether each of the devices from the passed device Ids array is online.
//
// Use the browser fetch API: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
// - (assume there will be no CORS or other response issues)
//
// Important: This task must be completed using only native JavaScript/TypeScript functionalities.
// External libraries are not permitted; please rely solely on the Fetch API and standard JS/TS
// features.

// TODO: Write 3 separate implementations of this function assuming:
// 1. The API Allows only 1 request at a time
// 2. The API Allows unlimited simultaneous requests, given that:
//     - each call takes 10s to return (not additive)
// 3. The API Allows a maximum of 5 simultaneous requests, given that:
//     - individual requests take a random amount of time between 1 and 3 seconds to complete
//     - simultaneous requests will not delay or slow each other

// Example use case of the function and return value:
// - E.g. deviceIds = [1, 2, 3] => function returns { 1: true, 2: true, 3: false }
// - Note the boolean values will depend on the API response


/* ------------------------------------ 1. The API Allows only 1 request at a time ------------------------------------------------- */

/** Returns a map indicating whether each of the passed devices are online or offline
 * @returns A map of booleans for each device ID indicating whether the device is online */
export async function getDevicesOnlineStatusOne(
  /** Array of device IDs to check the online status of */
  deviceIds: string[]
) {
  const map: Map<string, boolean> = new Map();
  
  for (const deviceId of deviceIds) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/one-request/${deviceId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${API_BEARER_TOKEN}`,
        },
      });
      if (response.ok) {
        const status = await response.json();
        map.set(deviceId, status);
      } else {
        console.error(`Device: ${deviceId} online status fetch failed`);
        map.set(deviceId, false); // Default to false status for any fetch response that is not ok.
      }
    } catch (error) {
      console.error(`Device ${deviceId} online status fetch error message: `, error);
      map.set(deviceId, false); // Default to false status for any error happens in the fetch process.
    }
  }

  return map;
}


/* ------------------------------------ 2. The API Allows unlimited simultaneous requests ------------------------------------------------- */


/** Returns a map indicating whether each of the passed devices are online or offline
 * @returns A map of booleans for each device ID indicating whether the device is online */
export async function getDevicesOnlineStatusTwo(
  /** Array of device IDs to check the online status of */
  deviceIds: string[]
) {
  const map: Map<string, boolean> = new Map();
  
  // Promise.all() reference: https://rapidapi.com/guides/parallel-api-requests
  // Since the api takes unlimited simultaneous requests and each call takes 10s to return,
  // I can confidently use parallel processing (e.g., Promise.all) as all requests are guaranteed to complete within the same fixed time.
  const responses = await Promise.all(
    deviceIds.map((deviceId) =>
      fetch(`${API_BASE_URL}/api/unlimited-requests/${deviceId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${API_BEARER_TOKEN}`,
        },
      }).catch((error) => {
        console.error(`Device ${deviceId} online status fetch error message: `, error);
        return null; // Handle fetch error by returning null
      })
    )
  );

  await Promise.all(
		responses.map(async (response, index) => {
			const deviceId = deviceIds[index];
			if (response && response.ok) {
				try {
					const status = await response.json(); // Await the JSON parsing
					map.set(deviceId, status);
				} catch (jsonError) {
					console.error(`Failed to parse JSON for device ${deviceId}`, jsonError);
					map.set(deviceId, false); // Default to false on JSON parse error
				}
			} else {
				console.error(`Device: ${deviceId} online status fetch failed`);
				map.set(deviceId, false); // Default to false for any non-OK response
			}
		})
	);

  const mapSorted = sortedMap(map);
  return mapSorted;
}


/* ------------------------------------ 3. The API Allows a maximum of 5 simultaneous requests ------------------------------------------------- */


/** Returns a map indicating whether each of the passed devices are online or offline
 * @returns A map of booleans for each device ID indicating whether the device is online */
export async function getDevicesOnlineStatusThree(
  /** Array of device IDs to check the online status of */
  deviceIds: string[]
) {
  const map: Map<string, boolean> = new Map();
  const batchSize = 5;

  // fetch promise function
  const fetchDeviceStatus = async (deviceId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/limited-requests/${deviceId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${API_BEARER_TOKEN}`,
        },
      });
      if (response.ok) {
        const status = await response.json();
        map.set(deviceId, status);
      } else {
        console.error(`Device: ${deviceId} online status fetch failed`);
        map.set(deviceId, false);
      }
    } catch (error) {
      console.error(`Device ${deviceId} online status fetch error message: `, error);
      map.set(deviceId, false);
    }
  };

  // Send 5 requests in a batch, await them to be finished and send the next batch
  for (let i = 0; i < deviceIds.length; i += batchSize) {
    const batch = deviceIds.slice(i, i + batchSize).map(fetchDeviceStatus);
    await Promise.all(batch);
  }

  const mapSorted = sortedMap(map);
  return mapSorted;
}


/* ------------------- 4. The API Allows a maximum of 5 simultaneous requests: alternative implementation using fetch queue ------------------ */

// An alernative implementation for the api only takes 5 simultaneous requests. 
// This implementation uses a queue to always ensure there are always 5 simultanous requsts send to the api to increase the efficiency. 

/** Returns a map indicating whether each of the passed devices are online or offline
 * @returns A map of booleans for each device ID indicating whether the device is online */
export async function getDevicesOnlineStatusFour(
  /** Array of device IDs to check the online status of */
  deviceIds: string[]
) {
  const map: Map<string, boolean> = new Map();
  const maxConcurrentRequests = 5;
  let activeRequests = 0;
  let currentIndex = 0;

  // Helper function to fetch device status with a timeout
  const fetchDeviceStatus = async (deviceId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/limited-requests/${deviceId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${API_BEARER_TOKEN}`,
        },
      });
      if (response.ok) {
        const status = await response.json();
        map.set(deviceId, status);
      } else {
        console.error(`Device: ${deviceId} online status fetch failed`);
        map.set(deviceId, false);
      }
    } catch (error) {
      console.error(`Device ${deviceId} online status fetch error message: `, error);
      map.set(deviceId, false);
    }
  };

  // Queue to control the concurrency
  const executeNext = (): Promise<void> => {
    if (currentIndex >= deviceIds.length) return Promise.resolve(); // All requests processed
    const deviceId = deviceIds[currentIndex++];
    activeRequests++;

    return fetchDeviceStatus(deviceId).finally(() => {
      activeRequests--;
      if (activeRequests < maxConcurrentRequests && currentIndex < deviceIds.length) {
        return executeNext(); // Trigger the next request if limit is not reached
      }
    });
  };

  // Initiate the initial batch of requests
  const initialBatch = Array(Math.min(maxConcurrentRequests, deviceIds.length))
    .fill(null)
    .map(executeNext);

  // Wait for all requests to complete
  await Promise.all(initialBatch);

  const mapSorted = sortedMap(map);
  return mapSorted;
}

const sortedMap = (map: Map<string, boolean>) => {
  return new Map([...map.entries()].sort((a, b) => {
    return Number(a[0]) - Number(b[0]);
  }));
}

(async () => {
  const statusMap = await getDevicesOnlineStatusFour(["10", "11", "12", "13", "14", "15"]);
  console.log(statusMap);
})();
