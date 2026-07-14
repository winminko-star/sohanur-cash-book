import { calculateBalance } from "./calculator";

export function addRow(rows) {
  const nextRowNo =
    rows.length === 0
      ? 1
      : Math.max(...rows.map((row) => row.row_no)) + 1;

  return [
    ...rows,
    {
      row_no: nextRowNo,
      note: "",
      blash1: "",
      blash2: "",
      return_ac: "",
      deposit: "",
      balance: calculateBalance({
        blash1: 0,
        blash2: 0,
        return_ac: 0,
        deposit: 0,
      }),
    },
  ];
}
