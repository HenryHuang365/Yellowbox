const API_BASE_URL = "https://api.example.com/deviceOnlineStatus"
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

/** Returns a map indicating whether each of the passed devices are online or offline
 * @returns A map of booleans for each device ID indicating whether the device is online */
async function getDevicesOnlineStatus(
  /** Array of device IDs to check the online status of */
  deviceIds: string[]
) {
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
}
