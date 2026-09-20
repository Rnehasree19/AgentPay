export function formatPricePaise(pricePaise, currency = "INR") {
  if (!Number.isInteger(pricePaise) || pricePaise < 0) {
    return null;
  }

  const rupees = Math.floor(pricePaise / 100).toLocaleString("en-IN");

  if (currency === "INR") {
    return `₹${rupees}`;
  }

  return `${currency || "INR"} ${rupees}`;
}