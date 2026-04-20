function getOrdinal(day: number): string {
    if (day > 3 && day < 21) return `${day}th`;

    switch (day % 10) {
        case 1: return `${day}st`;
        case 2: return `${day}nd`;
        case 3: return `${day}rd`;
        default: return `${day}th`;
    }
}

export function formatDateTime(timestamp: string | number | Date): string {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";

    const now = new Date();
    const isCurrentYear = date.getFullYear() === now.getFullYear();

    const time = date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });

    const day = getOrdinal(date.getDate());

    const month = date.toLocaleString("en-US", {
        month: "long",
    });

    const year = isCurrentYear ? "" : ` ${date.getFullYear()}`;

    return `${time}, ${day} ${month}${year}`;
}