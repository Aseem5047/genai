export async function sendMessage(message: string) {
    const res = await fetch(`${import.meta.env.VITE_BASE_API_URL}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
    });

    if (!res.ok) {
        throw new Error("Failed to fetch response");
    }

    const data = await res.json();
    return data;
}