import { calculateBalance, isEmptyRow } from "./calculator";

export function fixUpRows(rows) {
  const filledRows = rows.filter((row) => !isEmptyRow(row));
  const emptyRows = rows.filter((row) => isEmptyRow(row));

  return [...filledRows, ...emptyRows].map((row, index) => ({
    ...row,
    row_no: index + 1,
    balance: calculateBalance(row),
  }));
}
