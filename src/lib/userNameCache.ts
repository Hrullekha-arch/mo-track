async function fetchUserNames(ids: string[]) {
  const res = await fetch("/api/users/names", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return res.json();
}
