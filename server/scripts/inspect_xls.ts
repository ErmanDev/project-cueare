import * as xlsx from 'xlsx';

const workbook = xlsx.readFile('scripts/data.xls');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log("Sheet names:", workbook.SheetNames);
console.log("Headers:");
console.log(data[0]);
console.log("First row:");
console.log(data[1]);
