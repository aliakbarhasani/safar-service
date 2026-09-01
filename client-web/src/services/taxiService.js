export async function requestTaxiRide(rideData) {
  try {
    // Simulated API call for production readiness
    console.log("Sending ride request to backend:", rideData);

    // In future phases, replace with actual fetch/axios call:
    // const response = await fetch("/api/v1/taxi/request", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(rideData)
    // });
    // return await response.json();

    return { success: true, message: "درخواست سفر با موفقیت ثبت شد", rideId: "RIDE-" + Math.floor(Math.random() * 100000) };
  } catch (error) {
    console.error("Error requesting taxi:", error);
    throw error;
  }
}