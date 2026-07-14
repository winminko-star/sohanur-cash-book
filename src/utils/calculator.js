export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function calculateBalance(row) {
  return (
    toNumber(row.blash1) +
    toNumber(row.blash2) +
    toNumber(row.return_ac) -
    toNumber(row.deposit)
  );
}

export function formatMoney(value) {
  return toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function isEmptyRow(row) {
  return (
    String(row.note || "").trim() === "" &&
    toNumber(row.blash1) === 0 &&
    toNumber(row.blash2) === 0 &&
    toNumber(row.return_ac) === 0 &&
    toNumber(row.deposit) === 0
  );
}
