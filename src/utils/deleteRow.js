import { isEmptyRow } from "./calculator";

export function deleteLastEmptyRow(rows) {
  if (rows.length <= 1) {
    return {
      rows,
      success: false,
      message: "At least one row must remain.",
    };
  }

  const lastRow = rows[rows.length - 1];

  if (!isEmptyRow(lastRow)) {
    return {
      rows,
      success: false,
      message: "The last row must be empty before it can be deleted.",
    };
  }

  return {
    rows: rows.slice(0, -1),
    success: true,
    message: "Last empty row deleted.",
  };
}
