const parseIndo = (val) => {
  if (val === '' || val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  
  const str = val.toString().trim();
  if (!str) return 0;

  const cleaned = str.replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(cleaned) || 0;
};
console.log("3.4 string:", parseIndo("3.4"));
console.log("3,4 string:", parseIndo("3,4"));
console.log("3.4 number:", parseIndo(3.4));
