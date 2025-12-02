async function updateBlindsAPI(payload: any) {
    const res = await fetch("/api/update-blinds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return res.json();
}
